# QueryBench Testing Documentation

## Unit Testing

- All backend unit tests are located in `backend/tests_sql_eval.py`.
- Run tests using:
  ```bash
  python -m unittest discover -v
  ```
- 57 tests executed, all passed.
- Tests cover:
  - SQL row limit enforcement
  - Result normalization
  - SQL validation (banned tokens, multi-statement rejection, etc.)
  - Edge cases for query structure and result comparison

## End-to-End Testing

- End-to-end tests should verify:
  - User authentication and role management
  - Assessment creation, assignment, and attempt workflows
  - Query evaluation and feedback
  - Frontend/backend integration

## End-to-End (E2E) Testing

Automated E2E tests are implemented using Cypress.

### How to Run E2E Tests

1. Start your backend (Django) and frontend (Vite) servers:
   ```bash
   python manage.py runserver 8080
   npm run dev
   ```
2. In a new terminal, open Cypress test runner:
   ```bash
   npx cypress open
   # or to run headless:
   npx cypress run
   ```
3. Select and run the test: `admin_participant_flow.cy.js`

### Test Coverage
- Admin login and infrastructure creation
- User management (add participant)
- Assessment and assignment creation
- Results checking (admin)
- Participant login and assessment attempt

Test file: `cypress/e2e/admin_participant_flow.cy.js`

## Troubleshooting

- If tests fail, check for:
  - Database schema mismatches
  - Incorrect table names or field types
  - Dependency issues (see `requirements.txt`)

## How to Add Tests

- Add new unit tests in `backend/tests_sql_eval.py`.
- Use Python's `unittest` framework.
- For frontend, use Jest/React Testing Library (if implemented).

## Test Coverage

- Current backend coverage: SQL logic, normalization, validation.
- Add more tests for API endpoints and frontend as needed.

---

_Last updated: February 27, 2026_
