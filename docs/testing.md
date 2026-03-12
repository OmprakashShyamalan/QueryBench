# Testing Guide

## Test Matrix

| Suite | File | Runner | Notes |
|---|---|---|---|
| Backend SQL unit tests | `backend/tests_sql_eval.py` | `unittest` | Pure Python, no DB required |
| Security guardrail tests | `api/tests/test_security.py` | `manage.py test` | Covers CSP, SQL safety, throttle behavior |
| Admin E2E (local DB) | `cypress/e2e/admin_local.cy.js` | Cypress | Creates fixture data for participant suite |
| Participant E2E (local DB) | `cypress/e2e/participant_local.cy.js` | Cypress | Reads fixture from admin suite |
| Admin E2E (practice DB) | `cypress/e2e/admin_practice_db.cy.js` | Cypress | Internal server (sql_store/sql_movie), requires VPN |
| Participant E2E (practice DB) | `cypress/e2e/participant_practice_db.cy.js` | Cypress | Internal server (sql_store/sql_movie), requires VPN |

## Backend Test Commands

```bash
python -m unittest backend.tests_sql_eval -v
python manage.py test api.tests.test_security -v 2
```

## E2E Test Commands

```powershell
.\run_cypress_clean.ps1
.\run_cypress_clean.ps1 admin
.\run_cypress_clean.ps1 participant
```

Interactive mode:

```powershell
$env:CYPRESS_SKIP_VERIFY = 'true'
node node_modules\cypress\bin\cypress open
```

## E2E Prerequisites

1. Start Django on port `8080`.
2. Start Vite on port `3000`.
3. Ensure management DB is migrated.
4. For practice DB suites (`*_practice_db`), connect to corporate network or VPN and populate `cypress.env.json` from `cypress.env.json.example`.
