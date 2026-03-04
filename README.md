# QueryBench — Enterprise SQL Assessment Platform

QueryBench is an internal platform for assessing SQL proficiency. It pairs a Django/DRF backend with a React workspace featuring real-time schema visualization, secure query execution, and a full admin dashboard for managing users, questions, assessments, and results.

---

## Project Structure

```text
QueryBench/
│
├── manage.py                    # Django management entry point
├── requirements.txt             # Python dependencies
├── package.json                 # Node dependencies
├── vite.config.ts               # Vite build config
├── tsconfig.json                # TypeScript config
├── cypress.config.ts            # Cypress E2E config
├── run_cypress_clean.ps1        # Helper script to run E2E tests
├── .env                         # Local environment variables (not committed)
├── .env.example                 # Template for .env
│
├── querybench/                  # Django project settings
│   ├── settings.py              # Configuration (loads .env)
│   ├── urls.py                  # Root URL routing
│   └── wsgi.py                  # WSGI entry point
│
├── api/                         # Django REST API app
│   ├── models.py                # ORM models (management DB)
│   ├── serializers.py           # DRF serializers
│   ├── views.py                 # API endpoint logic
│   ├── urls.py                  # API URL routing
│   └── migrations/              # Django schema migrations
│
├── backend/                     # Core evaluation engine
│   ├── runner.py                # Query execution and scoring
│   ├── schema_loader.py         # Schema introspection for the UI
│   ├── sql_eval.py              # SQL safety validation and result normalization
│   ├── db_router.py             # Multi-database routing
│   ├── governor.py              # Query timeout enforcement
│   ├── config.py                # Backend configuration
│   └── schema.sql               # Management DB DDL reference
│
├── components/                  # React components
│   ├── AssessmentView.tsx       # Participant SQL workspace
│   ├── AssessmentView/
│   │   └── AssessmentHeader.tsx # Timer and submit header
│   ├── ParticipantDashboard.tsx # Participant assignment list
│   ├── SchemaVisualizer.tsx     # ERD diagram (React Flow)
│   ├── auth/
│   │   └── LoginView.tsx        # Login page
│   ├── ui/
│   │   └── Modal.tsx            # Shared modal component
│   └── admin/                   # Admin dashboard and editors
│       ├── AdminDashboard.tsx
│       ├── AssessmentEditor.tsx
│       ├── AssignmentEditor.tsx
│       ├── BulkAssign.tsx
│       ├── BulkUpload.tsx
│       ├── QuestionEditor.tsx
│       └── tabs/
│           ├── AssessmentsTab.tsx
│           ├── AssignmentsTab.tsx
│           ├── InfrastructureTab.tsx
│           ├── QuestionsTab.tsx
│           └── ResultsTab.tsx
│
├── services/
│   └── api.ts                   # Typed API client (frontend ↔ Django)
│
├── cypress/                     # End-to-end tests
│   ├── e2e/
│   │   ├── admin_e2e.cy.js      # Admin setup flow (6 tests)
│   │   └── participant_e2e.cy.js # Participant assessment flow (9 tests)
│   └── support/
│       ├── e2e.ts
│       └── commands.ts
│
├── App.tsx                      # React root — routing and auth state
├── index.tsx                    # Vite entry point
├── types.ts                     # Shared TypeScript types
└── index.html                   # HTML shell
```

---

## Local Setup

### Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 20+ |
| ODBC Driver | 17 or 18 for SQL Server |

> **Django version note**: `requirements.txt` pins `Django>=5.2,<6.0` because the SQL Server backend (`mssql-django`) does not yet support Django 6.x. Do not upgrade Django beyond 5.2.x until `mssql-django` publishes a Django 6.0-compatible release.

### 1. Backend (Django)

```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# Install Python dependencies
pip install -r requirements.txt

# Copy and configure environment variables
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux

# Apply migrations (creates the management SQLite/SQL Server DB)
python manage.py migrate

# Create the admin account
python manage.py createsuperuser

# Start the API server
python manage.py runserver 8080
```

### 2. Frontend (React + Vite)

```bash
npm install
npm run dev        # Starts on http://localhost:3000
```

---

## Database Models

| Table | Purpose |
|---|---|
| `database_configs` | Target SQL Server connection details |
| `auth_user` | Django built-in users (admins and participants) |
| `questions` | SQL questions with solution queries |
| `assessments` | Named collections of questions |
| `assessment_questions` | M2M through-table (assessment ↔ question + ordering) |
| `assignments` | Assessment assigned to a user with due date |
| `attempts` | A participant's attempt at an assignment |
| `attempt_answers` | Per-question answer and grading result |

---

## Evaluation Engine

- **SQL Safety**: Only single `SELECT`/CTE statements allowed. DDL, DML, `EXEC`, and multi-statement inputs are rejected.
- **Row Capping**: Results are capped at 5,000 rows via `TOP (n)` rewriting.
- **Timeout**: 5-second hard limit per query execution.
- **Scoring**: Participant results are compared against the solution query output. Order-sensitive comparison is configurable per question.

---

## E2E Testing (Cypress)

Tests are split into two suites that run in alphabetical order:

| Suite | File | Tests | Description |
|---|---|---|---|
| Admin | `admin_e2e.cy.js` | 6 | Admin login → create user, infra, questions, assessment, assignment |
| Participant | `participant_e2e.cy.js` | 9 | Login → wrong syntax, wrong logic, correct answers, submit → admin verifies |

```powershell
# Run all tests (admin first, participant second)
.\run_cypress_clean.ps1

# Run a single suite
.\run_cypress_clean.ps1 admin
.\run_cypress_clean.ps1 participant

# Open interactive UI
$env:CYPRESS_SKIP_VERIFY = 'true'
node node_modules\cypress\bin\cypress open
```

---

## Security Features

QueryBench ships with defense-in-depth controls aligned to OWASP ASVS and the Django Security Cheat Sheet.

### Active controls (local and prod)

| Control | Implementation |
|---|---|
| **SQL allow-listing** | Only single `SELECT`/CTE queries are accepted. DDL, DML, `EXEC`, multi-statement, and comment obfuscation are rejected by `backend/sql_eval.py` using `sqlparse` (structure) and regex (keyword banning). |
| **Row capping** | All result sets are hard-capped via `TOP (n)` injection — `apply_row_limit` in `backend/sql_eval.py`. Default: 5,000 rows. |
| **Execution timeout** | 5-second limit per query (`QUERY_TIMEOUT_SECONDS` in `backend/config.py`). |
| **Rate limiting** | DRF `UserRateThrottle` at 100 req/min per authenticated user. Tunable via `DEFAULT_THROTTLE_RATES` in `querybench/settings.py`. |
| **CSRF protection** | Django's `CsrfViewMiddleware` active. `CSRF_COOKIE_SAMESITE=Lax`. |
| **Content Security Policy** | `django-csp` middleware enforces `'self'`-only defaults. No external CDN scripts, styles, or images. |
| **Security headers** | `SECURE_CONTENT_TYPE_NOSNIFF`, `X_FRAME_OPTIONS=DENY`. |
| **Session security** | `SESSION_EXPIRE_AT_BROWSER_CLOSE=True`, `SESSION_COOKIE_SAMESITE=Lax`. |
| **Structured logging** | Query executions and errors logged with user ID and duration. `django.security` events are captured and ready for SIEM ingestion. |

### Environment switch

```bash
# Local mode (default) — DEBUG on, secure cookies off, CORS open
QB_ENV=local python manage.py runserver 8080

# Production mode — DEBUG off, SESSION/CSRF cookies require HTTPS
QB_ENV=prod gunicorn querybench.wsgi
```

`QB_ENV` controls `DEBUG`, `SESSION_COOKIE_SECURE`, and `CSRF_COOKIE_SECURE`. All other security controls are active in both modes.

---

## Enterprise Deployment (Placeholder)

The settings below are scaffolded but **disabled by default**. Supply values when internal infrastructure is ready.

### OIDC / Microsoft Entra ID SSO

```bash
# Enable SSO (requires mozilla-django-oidc)
QB_USE_SSO=true

# Microsoft Entra ID app registration values
OIDC_RP_CLIENT_ID=<app-client-id>
OIDC_RP_CLIENT_SECRET=<app-client-secret>
OIDC_OP_AUTHORIZATION_ENDPOINT=https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize
OIDC_OP_TOKEN_ENDPOINT=https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token
OIDC_OP_USER_ENDPOINT=https://graph.microsoft.com/oidc/userinfo
OIDC_OP_JWKS_ENDPOINT=https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys
```

When `QB_USE_SSO=true`, `mozilla_django_oidc` is activated and `/oidc/` routes are mounted. Install before enabling:

```bash
pip install mozilla-django-oidc>=4.0
```

### Internal package registries

Uncomment the placeholders in `requirements.txt` and `.npmrc` when internal PyPI/NPM mirrors are available:

```
# requirements.txt
index-url = https://<internal-pypi>/simple

# .npmrc
registry=https://<internal-npm-registry>/
```

### Database read-only principal (recommended for prod)

Create a dedicated SQL Server login with `SELECT`-only permission on all target databases. Configure `DB_USER`/`DB_PASSWORD` (or a managed identity with Trusted Connection). The local setup uses Windows Authentication.

---

## Security Notes

- All connections to target databases use credentials defined in `database_configs` (never the Django admin credentials).
- The platform is designed for internal/VPN deployment. Do not expose the Django API or Vite dev server publicly without an HTTPS reverse proxy.
- The `.env` file contains secrets and is excluded from version control.
- Run `python manage.py test api.tests.test_security` to verify CSP headers, SQL safety, and throttle controls after any settings change.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `pyodbc` install fails | Install [ODBC Driver 17/18 for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server) |
| Port conflict | Change `8080` in `runserver` or update `server.port` in `vite.config.ts` |
| Cypress `Illegal instruction` | Run via `run_cypress_clean.ps1` instead of `npx cypress` |
| `Cannot execute empty query` | The CodeMirror editor must have content before clicking Run Query |
| `'mssql' isn't an available database backend` | `mssql-django` is missing — run `pip install -r requirements.txt`. Do not install `django-mssql-backend`; the project uses `mssql-django` (Microsoft's official backend). |
| `csp.E001` — django-csp settings format error | `django-csp` ≥ 4.0 uses `CONTENT_SECURITY_POLICY = {"DIRECTIVES": {...}}` instead of `CSP_*` variables. Check `querybench/settings.py` for the correct format. |
