# Operations Guide

## Daily Runbook

1. Pull latest changes.
2. Install/update dependencies.
3. Apply migrations.
4. Start backend and frontend services.
5. Run targeted tests for changed areas.

## Common Commands

```bash
pip install -r requirements.txt
npm install
python manage.py migrate
python manage.py runserver 8080
npm run dev
```

## Test/Validation Commands

```bash
python -m unittest backend.tests_sql_eval -v
python manage.py test api.tests.test_security -v 2
```

```powershell
.\run_cypress_clean.ps1
```

## Troubleshooting Quick Hits

- `pyodbc` install errors: install ODBC Driver 17/18 for SQL Server.
- `'mssql' isn't an available backend`: reinstall dependencies from `requirements.txt`.
- Cypress UI instability on Windows: use `run_cypress_clean.ps1` instead of raw `npx cypress run`.
- Training suites timeout: verify VPN/corporate network connectivity.

## Data Reset and Housekeeping

- Use management command(s) under `api/management/commands` as needed.
- Keep generated report artifacts organized (see `docs/reports/README.md`).
- Do not commit local secrets from `.env` or `cypress.env.json`.
