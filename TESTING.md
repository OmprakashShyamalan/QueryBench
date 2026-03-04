# QueryBench — Testing Documentation

---

## Overview

| Suite | File | Tests | Runner |
|---|---|---|---|
| Backend unit | `backend/tests_sql_eval.py` | 57 | `unittest` |
| Security guardrails | `api/tests/test_security.py` | 17 | `manage.py test` |
| E2E — Admin flow | `cypress/e2e/admin_e2e.cy.js` | 6 | Cypress |
| E2E — Participant flow | `cypress/e2e/participant_e2e.cy.js` | 11 | Cypress |

---

## 1. Backend Unit Tests

**File:** `backend/tests_sql_eval.py`
**Framework:** Python `unittest`
**Count:** 57 tests

### What is covered

| Category | Description |
|---|---|
| SQL validation | Banned tokens (`DROP`, `DELETE`, `UPDATE`, `EXEC`, etc.), multi-statement rejection, comment stripping, empty query rejection |
| `apply_row_limit` | `TOP (n)` injection for plain `SELECT`, `SELECT DISTINCT`, CTEs, and queries with existing `TOP` |
| `normalize_result` | Decimal precision, date/datetime ISO normalisation, `None` sort sentinel, case-insensitive column lookup |
| Result comparison | Order-insensitive (default) and order-sensitive set/list comparison |
| Edge cases | Whitespace-only input, queries with subqueries, deeply nested CTEs |

### How to run

```bash
# From repo root (activating the venv first)
python -m unittest backend.tests_sql_eval -v
```

Expected output: `Ran 57 tests in ~0.04s — OK`

---

## 2. Security Guardrail Tests

**File:** `api/tests/test_security.py`
**Framework:** Django `TestCase` + DRF `APIClient`
**Count:** 17 tests

### Test classes

#### `CSPHeaderTest` (2 tests)
Verifies that `django-csp` emits a valid `Content-Security-Policy` header on every response.

| Test | Assertion |
|---|---|
| `test_csp_header_present_on_public_endpoint` | `Content-Security-Policy` key present in response headers |
| `test_csp_default_src_is_self` | Header value contains `'self'` origin restriction |

#### `SQLSafetyTest` (14 tests)
Unit-tests `backend.sql_eval.validate_sql` directly. Each unsafe input must raise `ValueError`.

| Test | Input |
|---|---|
| `test_update_rejected` | `UPDATE users SET ...` |
| `test_drop_rejected` | `DROP TABLE users` |
| `test_insert_rejected` | `INSERT INTO users ...` |
| `test_delete_rejected` | `DELETE FROM users` |
| `test_truncate_rejected` | `TRUNCATE TABLE users` |
| `test_exec_xp_cmdshell_rejected` | `EXEC xp_cmdshell('dir')` |
| `test_openrowset_rejected` | `SELECT * FROM OPENROWSET(...)` |
| `test_multi_statement_semicolon_rejected` | `SELECT 1; DROP TABLE users` |
| `test_line_comment_rejected` | `SELECT 1 -- bypass` |
| `test_block_comment_rejected` | `SELECT /* evil */ 1` |
| `test_non_select_rejected` | `WAITFOR DELAY '0:0:10'` |
| `test_empty_query_rejected` | `""` (empty string) |
| `test_valid_select_passes` | Valid `SELECT ... ORDER BY` — must **not** raise |
| `test_valid_cte_passes` | Valid `WITH ... SELECT` — must **not** raise |

#### `ThrottleTest` (1 test)
Overrides DRF throttle rate to `5/min`, fires 6 rapid requests, asserts HTTP 429 is received.

### How to run

```bash
python manage.py test api.tests.test_security -v 2
```

> **Note:** The throttle test relies on Django's cache backend. If using a non-default cache the 429 assertion may not trigger — check `CACHES` in `settings.py`.

---

## 3. Cypress E2E Tests

Both suites share state (`testIsolation: false`) and must run in order: **admin first, participant second**.

The recommended way to run both suites is via the helper script:

```powershell
.\run_cypress_clean.ps1          # run both suites in order
.\run_cypress_clean.ps1 admin    # admin suite only
.\run_cypress_clean.ps1 participant  # participant suite only
```

Or interactively:

```powershell
$env:CYPRESS_SKIP_VERIFY = 'true'
node node_modules\cypress\bin\cypress open
```

> Do **not** use `npx cypress run` directly — use the script to avoid `Illegal instruction` errors on some Windows environments.

### Prerequisites

Before running, ensure:
- Django is running: `python manage.py runserver 8080`
- Vite is running: `npm run dev`
- The management DB is clean (the scripts create all data from scratch)

### Suite 1 — Admin flow (`admin_e2e.cy.js`, 6 tests)

| # | Test | What it does |
|---|---|---|
| 1 | Admin Logs In | Authenticates as admin, lands on Admin Dashboard |
| 2 | Admin Creates Participant User | Creates a participant account via Users tab |
| 3 | Admin Creates Infrastructure (W3Schools) | Adds a `DatabaseConfig` (W3Schools DB), verifies Test Connection |
| 4 | Admin Creates 5 Questions | Creates all 5 questions in a loop: validates SQL, saves — or cancels if validation fails |
| 5 | Admin Creates Assessment with 5 Questions | Creates an assessment, adds the 5 questions to it |
| 6 | Admin Assigns Assessment to Participant | Assigns the assessment to the participant with a due date |

### Suite 2 — Participant flow (`participant_e2e.cy.js`, 11 tests)

| # | Test | What it does |
|---|---|---|
| 1 | Participant Logs In | Authenticates as participant, lands on Participant Dashboard |
| 2 | Participant Opens Assigned Assessment | Opens the assessment from the inbox |
| 3 | Explorer tab shows all schema tables | Verifies full schema (Customers, Orders, Products, Suppliers, …) is shown in Explorer |
| 4 | Diagram tab renders ER diagram with all table nodes and FK edges | Asserts all table nodes and >2 FK edges are visible in React Flow |
| 5 | Q1 — Wrong Syntax Answer | Submits `SELCT` typo, asserts syntax error feedback |
| 6 | Q2 — Correct Syntax, Wrong Projection | Submits a query missing a column, asserts incorrect answer feedback |
| 7 | Q3 — Correct Answer | Submits a correct query, asserts "Query Correct!" |
| 8 | Q4 — Correct Answer (typed, not run) | Types answer without running — asserts it is saved |
| 9 | Q5 — Correct Answer (typed, not run) | Types answer without running — asserts it is saved |
| 10 | Participant Submits Assessment | Clicks Submit, confirms, asserts "Assessment Submitted" |
| 11 | Admin Verifies Results | Logs back in as admin, opens Results tab, asserts attempt is recorded with a score |

---

## 4. Scoring Behaviour: Order-Sensitive Questions

By default, results are compared as an **unordered set** — the participant's `ORDER BY` does not affect the correctness verdict.

When a question has **Order-sensitive grading** enabled, rows must arrive in the same order as the solution. This is set per-question in the QuestionEditor UI ("Scoring Behaviour" checkbox) and stored as `order_sensitive` on the `Question` model.

| `order_sensitive` | Comparison method | Wrong `ORDER BY` = wrong answer? |
|---|---|---|
| `false` (default) | Unordered set — both sides sorted canonically before compare | No |
| `true` | Exact ordered list comparison | Yes |

---

## 5. Adding New Tests

### Backend unit test

Add a method to `backend/tests_sql_eval.py`. Use Python `unittest.TestCase`. No DB connection required — all tests are pure Python.

```python
def test_my_new_case(self):
    result = validate_sql("SELECT 1")
    # or
    rows = apply_row_limit("SELECT * FROM t ORDER BY id", 100)
    self.assertIn("TOP (100)", rows.upper())
```

### Security test

Add a method to the appropriate class in `api/tests/test_security.py`. New unsafe SQL patterns go in `SQLSafetyTest`; new header checks go in `CSPHeaderTest`.

### E2E test

Add a new `it()` block inside the relevant `describe()` in `admin_e2e.cy.js` or `participant_e2e.cy.js`. The suites are stateful — new tests must account for the state left by previous tests.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: backend` | Run from repo root with venv active |
| Cypress times out on `cm-content` | Backend or frontend server not running; check ports 8080 / 3000 |
| `Validation Failed` flashes then corrects itself | Expected — the UI shows a spinner during the DB round-trip; the test waits 2s after clicking "Validate Logic" |
| Security throttle test never returns 429 | The Django in-memory cache resets between test cases; ensure `DEFAULT_CACHE_BACKEND` is not `DummyCache` |
| `csp.E001` — settings format error | `django-csp` ≥ 4.0 uses `CONTENT_SECURITY_POLICY = {"DIRECTIVES": {...}}`. The project currently targets 3.x; do not upgrade without updating `settings.py`. |

---

_Last updated: 2026-03-04_
