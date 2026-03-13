import base64
import json
import time
import datetime
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from api.models import Assessment, AssessmentQuestion, Assignment, Attempt, AttemptAnswer, DatabaseConfig, Question
from lti.models import LmsAssessmentMapping, LmsProvider

LTI_DEPLOYMENT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id"
LTI_CONTEXT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/context"
LTI_RESOURCE_LINK_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/resource_link"
LTI_AGS_CLAIM = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"


def _b64url_int(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _public_jwk(public_key, kid: str):
    numbers = public_key.public_numbers()
    return {
        "kty": "RSA",
        "kid": kid,
        "alg": "RS256",
        "use": "sig",
        "n": _b64url_int(numbers.n),
        "e": _b64url_int(numbers.e),
    }


class _FakeResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload or {}
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


class LtiIntegrationTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="admin", is_staff=True, is_superuser=True)

        self.db_config = DatabaseConfig.objects.create(
            config_name="LTI Test DB",
            host="localhost",
            port=1433,
            database_name="LTI_DB",
            trusted_connection=True,
            provider="SQL_SERVER",
        )
        self.assessment = Assessment.objects.create(
            name="LTI Assessment",
            description="Assessment mapped from LMS",
            duration_minutes=60,
            attempts_allowed=1,
            db_config=self.db_config,
            is_published=True,
        )
        self.question = Question.objects.create(
            title="Q1",
            prompt="Select 1",
            difficulty="EASY",
            solution_query="SELECT 1 AS n",
            created_by=self.admin,
        )
        AssessmentQuestion.objects.create(assessment=self.assessment, question=self.question, sort_order=1, weight=1)

        self.provider = LmsProvider.objects.create(
            name="Moodle Local",
            issuer="https://moodle.local",
            client_id="querybench-client",
            auth_url="https://moodle.local/auth",
            token_url="https://moodle.local/token",
            keyset_url="https://moodle.local/jwks",
            deployment_id="deployment-1",
        )
        self.mapping = LmsAssessmentMapping.objects.create(
            provider=self.provider,
            lms_course_id="course-100",
            lms_assignment_id="assignment-200",
            querybench_assessment=self.assessment,
        )

        self.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.public_key = self.private_key.public_key()
        self.kid = "lms-key-1"

    def _launch_claims(self, nonce="nonce-abc"):
        now = int(time.time())
        return {
            "iss": self.provider.issuer,
            "aud": self.provider.client_id,
            "sub": "lms-user-001",
            "email": "student1@example.com",
            "name": "LTI Student",
            "iat": now,
            "exp": now + 300,
            "nonce": nonce,
            LTI_DEPLOYMENT_CLAIM: self.provider.deployment_id,
            LTI_CONTEXT_CLAIM: {"id": self.mapping.lms_course_id},
            LTI_RESOURCE_LINK_CLAIM: {"id": self.mapping.lms_assignment_id},
            LTI_AGS_CLAIM: {
                "lineitems": "https://moodle.local/mod/lti/services.php/lineitems",
                "lineitem": "https://moodle.local/mod/lti/services.php/lineitems/10",
                "scope": ["https://purl.imsglobal.org/spec/lti-ags/scope/score"],
            },
        }

    def _signed_id_token(self, claims):
        private_pem = self.private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": self.kid})

    @patch("lti.services.requests.get")
    def test_lti_launch_verification_and_session_creation(self, mock_get):
        jwks = {"keys": [_public_jwk(self.public_key, self.kid)]}
        mock_get.return_value = _FakeResponse(jwks)

        token = self._signed_id_token(self._launch_claims())
        response = self.client.post("/lti/launch", {"id_token": token}, secure=True)

        self.assertEqual(response.status_code, 302)
        self.assertIn("launch_assignment_id=", response["Location"])

        assignment = Assignment.objects.get(assessment=self.assessment)
        attempt = Attempt.objects.get(assignment=assignment)
        self.assertEqual(attempt.source, "lms")
        self.assertEqual(attempt.lms_provider_id, self.provider.id)
        self.assertEqual(attempt.lms_assignment_id, self.mapping.lms_assignment_id)
        self.assertEqual(attempt.lti_context_id, self.mapping.lms_course_id)

    @patch("lti.services.requests.get")
    def test_nonce_replay_is_rejected(self, mock_get):
        jwks = {"keys": [_public_jwk(self.public_key, self.kid)]}
        mock_get.return_value = _FakeResponse(jwks)

        token = self._signed_id_token(self._launch_claims(nonce="replay-1"))
        first = self.client.post("/lti/launch", {"id_token": token}, secure=True)
        second = self.client.post("/lti/launch", {"id_token": token}, secure=True)

        self.assertEqual(first.status_code, 302)
        self.assertEqual(second.status_code, 400)
        self.assertIn("nonce", second.json().get("error", "").lower())

    @patch("lti.services.requests.post")
    @patch("lti.services.requests.get")
    def test_grade_return_endpoint(self, mock_get, mock_post):
        jwks = {"keys": [_public_jwk(self.public_key, self.kid)]}
        mock_get.return_value = _FakeResponse(jwks)

        token = self._signed_id_token(self._launch_claims())
        self.client.post("/lti/launch", {"id_token": token}, secure=True)

        assignment = Assignment.objects.get(assessment=self.assessment)
        attempt = Attempt.objects.get(assignment=assignment)

        def _post_side_effect(url, *args, **kwargs):
            if url == self.provider.token_url:
                return _FakeResponse({"access_token": "ags-token"})
            if url.endswith("/scores"):
                return _FakeResponse({}, status_code=200)
            return _FakeResponse({}, status_code=404)

        mock_post.side_effect = _post_side_effect

        self.client.force_login(assignment.user)
        response = self.client.post(
            "/lti/submit-grade",
            data=json.dumps({"session_id": attempt.id, "score": 85, "max_score": 100}),
            content_type="application/json",
            secure=True,
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["scoreGiven"], 85.0)
        self.assertEqual(body["scoreMaximum"], 100.0)

    @patch("lti.services.submit_grade_for_attempt")
    def test_finalize_calls_grade_return_for_lms_attempt(self, mock_submit_grade):
        learner = User.objects.create_user(username="learner", password="x")
        assignment = Assignment.objects.create(
            assessment=self.assessment,
            user=learner,
            due_date=timezone.now() + datetime.timedelta(days=1),
            status="IN_PROGRESS",
        )
        attempt = Attempt.objects.create(
            assignment=assignment,
            source="lms",
            lms_provider=self.provider,
            lms_assignment_id="assignment-200",
            lti_context_id="course-100",
            lti_user_id="lms-user-001",
            lti_lineitem="https://moodle.local/mod/lti/services.php/lineitems/10",
            lti_ags_scope="https://purl.imsglobal.org/spec/lti-ags/scope/score",
        )
        AttemptAnswer.objects.create(
            attempt=attempt,
            question=self.question,
            participant_query="SELECT 1 AS n",
            status="CORRECT",
        )

        self.client.force_login(learner)
        resp = self.client.post(f"/api/v1/attempts/{attempt.id}/finalize/")
        self.assertEqual(resp.status_code, 200)
        mock_submit_grade.assert_called_once()
