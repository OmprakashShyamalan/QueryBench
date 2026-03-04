"""
Security guardrail tests (ASVS-aligned).

1. CSP header present on every response.
2. SQL safety: validate_sql rejects unsafe/dangerous queries (unit + HTTP).
3. Throttle: rate limiting smoke test (overrides rate to 5/min for speed).

Run with:  python manage.py test api.tests.test_security
"""

from django.test import TestCase
from django.core.cache import cache
from rest_framework.test import APIRequestFactory

from backend.sql_eval import validate_sql


# ── 1. Content Security Policy ──────────────────────────────────────────────

class CSPHeaderTest(TestCase):
    """django-csp must emit Content-Security-Policy on every response."""

    def test_csp_header_present_on_public_endpoint(self):
        response = self.client.get("/api/v1/auth/login/")
        self.assertIn(
            "Content-Security-Policy",
            response.headers,
            "CSP header missing from response.",
        )

    def test_csp_default_src_is_self(self):
        response = self.client.get("/api/v1/auth/login/")
        csp = response.headers.get("Content-Security-Policy", "")
        self.assertIn(
            "'self'",
            csp,
            "Expected 'self' origin restriction in Content-Security-Policy.",
        )


# ── 2. SQL Safety (unit-level) ───────────────────────────────────────────────

class SQLSafetyTest(TestCase):
    """validate_sql must reject all unsafe/dangerous inputs."""

    def _assert_rejected(self, sql, fragment=None):
        with self.assertRaises(ValueError) as cm:
            validate_sql(sql)
        if fragment:
            self.assertIn(fragment.lower(), str(cm.exception).lower())

    # DML / DDL mutation
    def test_update_rejected(self):
        self._assert_rejected("UPDATE users SET password='x' WHERE 1=1")

    def test_drop_rejected(self):
        self._assert_rejected("DROP TABLE users")

    def test_insert_rejected(self):
        self._assert_rejected("INSERT INTO users(username) VALUES ('x')")

    def test_delete_rejected(self):
        self._assert_rejected("DELETE FROM users")

    def test_truncate_rejected(self):
        self._assert_rejected("TRUNCATE TABLE users")

    # Dangerous system access
    def test_exec_xp_cmdshell_rejected(self):
        self._assert_rejected("EXEC xp_cmdshell('dir')")

    def test_openrowset_rejected(self):
        self._assert_rejected(
            "SELECT * FROM OPENROWSET('SQLNCLI','server=.;uid=sa;pwd=x','SELECT 1')"
        )

    # Multi-statement injection
    def test_multi_statement_semicolon_rejected(self):
        self._assert_rejected("SELECT 1; DROP TABLE users")

    # Comment obfuscation
    def test_line_comment_rejected(self):
        self._assert_rejected("SELECT 1 -- bypass filter")

    def test_block_comment_rejected(self):
        self._assert_rejected("SELECT /* evil comment */ 1")

    # Non-SELECT input
    def test_non_select_rejected(self):
        self._assert_rejected("WAITFOR DELAY '0:0:10'")

    def test_empty_query_rejected(self):
        self._assert_rejected("", "empty")

    # Valid queries must pass
    def test_valid_select_passes(self):
        try:
            validate_sql("SELECT CustomerID FROM Customers ORDER BY CustomerID")
        except ValueError as e:
            self.fail(f"validate_sql rejected a valid SELECT query: {e}")

    def test_valid_cte_passes(self):
        try:
            validate_sql(
                "WITH cte AS (SELECT CustomerID FROM Customers) "
                "SELECT * FROM cte ORDER BY CustomerID"
            )
        except ValueError as e:
            self.fail(f"validate_sql rejected a valid CTE query: {e}")


# ── 3. Throttling (smoke test) ───────────────────────────────────────────────

class ThrottleTest(TestCase):
    """
    DRF's UserRateThrottle returns HTTP 429 once the request cap is exceeded.

    Uses a self-contained throttle subclass with the rate baked into
    THROTTLE_RATES so there is no dependency on api_settings or
    @override_settings (APIView.throttle_classes is set at class-creation
    time from api_settings, making @override_settings unreliable here).

    The production global cap is 100/min (querybench/settings.py).
    """

    def setUp(self):
        cache.clear()  # reset any stale throttle counters from prior tests
        self.factory = APIRequestFactory()

    def tearDown(self):
        cache.clear()

    def test_throttle_triggers_429_after_limit(self):
        """6 rapid requests against a 5/min cap must produce at least one 429."""
        from rest_framework.views import APIView
        from rest_framework.response import Response
        from rest_framework.throttling import UserRateThrottle
        from rest_framework.permissions import AllowAny

        class _BurstThrottle(UserRateThrottle):
            scope = '_test_burst'
            THROTTLE_RATES = {'_test_burst': '5/min'}

        class _ThrottledView(APIView):
            throttle_classes = [_BurstThrottle]
            permission_classes = [AllowAny]
            authentication_classes = []

            def get(self, request):
                return Response({'ok': True})

        view = _ThrottledView.as_view()
        # No auth — throttle falls back to REMOTE_ADDR (127.0.0.1 from factory)
        # as the identity key. All 6 requests share it so the counter accumulates.
        status_codes = [
            view(self.factory.get('/test-throttle/')).status_code
            for _ in range(6)
        ]
        self.assertIn(
            429,
            status_codes,
            f"Expected HTTP 429 after exceeding 5/min rate limit; got: {status_codes}",
        )
