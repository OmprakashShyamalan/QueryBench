
# QueryBench - Enterprise SQL Assessment Platform

QueryBench is a high-performance, internal-only platform designed for assessing technical SQL proficiency. It combines a robust Django/DRF backend with a high-fidelity React workspace, featuring real-time schema visualization and secure query execution.

## 🏗️ Project Structure

```text
QueryBench/
│
├── manage.py              # Django management script (Root)
├── .env                   # Environment variables (Internal Config)
├── requirements.txt       # Python dependencies
│
├── querybench/            # Django Core Project Folder
│   ├── settings.py        # System configuration (loads .env)
│   ├── urls.py            # Global routing
│   └── wsgi.py            # Deployment entry point
│
├── api/                   # Django REST App
│   ├── models.py          # ORM (Management DB)
│   ├── serializers.py     # DRF Serializers
│   └── views.py           # API endpoints

│   ├── migrations/        # Django migrations (reflects table changes)
│
├── backend/               # Assessment Assets
│   ├── runner.py          # SQL Evaluation Logic
│   └── schema.sql         # Master DDL
│
├── src/                   # React Frontend (Conceptual Source)
├── index.html             # Frontend Entry
├── package.json           # Node dependencies
└── vite.config.ts         # Vite configuration
```

## 🚀 Local Setup

### 1. Backend Installation (Django)
The backend manages users, assessments, and acts as a secure gateway to your target database instances.

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Initialize Management Database (SQLite if .env is missing, SQL Server if configured)
python manage.py migrate

# Create an admin account for the dashboard
python manage.py createsuperuser

# Start the API server on port 8080
python manage.py runserver 8080
```

### 2. Frontend Installation (React/Vite)
The frontend provides a rich, resizable SQL workspace with ERD visualization.

```bash
# Install Node dependencies
npm install

# Start the development server (configured for port 3000)
npm run dev
```

## 🛡️ Security & Evaluation Engine

- **Lexical Validation**: Scans all queries for banned DDL/DML tokens (`DROP`, `DELETE`, `TRUNCATE`, etc.).
- **Determinism Enforcement**: All queries **must** include an `ORDER BY` clause.
- **Row Capping**: Results are automatically capped at 100-5000 rows based on config.
- **Execution Timeout**: A 5-second hard limit is enforced for all queries.

## 🛠️ Troubleshooting

- **SQL Server Driver**: Ensure "ODBC Driver 17 for SQL Server" is installed on your OS.
- **Database Connection**: Check `DB_HOST` and `DB_PORT` in `.env`.
- **Port Conflict**: If 8080 or 3000 are in use, modify the startup command or `vite.config.ts`.
- **Decimal Error**: If you see `decimal_length` errors, ensure `api/models.py` and `backend/schema.sql` use `decimal_places` for all decimal fields.

## 📋 Database Table Names
The following tables are used in the platform (see `backend/schema.sql` and `api/models.py`):

- `database_configs`
- `users`
- `questions`
- `assessments`
- `assessment_questions`
- `assignments`
- `attempts`
- `attempt_answers`

All table names are lower_snake_case in Django ORM and backend DDL.

## 🔒 Internal Use Only
This application is designed for deployment within a corporate VPN. Ensure that your target database connections use read-only credentials with limited schema access.
