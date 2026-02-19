# QueryBench - Enterprise SQL Assessment Platform

QueryBench is a high-performance, internal-only platform designed for assessing technical SQL proficiency. It combines a robust Django/DRF backend with a high-fidelity React workspace, featuring real-time schema visualization and secure query execution.

## 🏗️ Project Structure

```text
QueryBench/
├── manage.py              # Django management script (Root)
├── .env                   # Environment variables (Internal Config)
├── requirements.txt       # Python dependencies
├── index.html             # Frontend entry point
├── App.tsx                # Main React Application
├── types.ts               # Shared TypeScript interfaces
│
├── querybench/            # Django Core Project Folder
│   ├── settings.py        # System configuration
│   └── urls.py            # Global routing
│
├── api/                   # Django REST App
│   ├── models.py          # ORM for Management DB
│   └── views.py           # API endpoints (Evaluation/Execution)
│
├── backend/               # SQL Execution Engine & Database Assets
│   ├── runner.py          # SQL Server / Postgres Execution Logic
│   ├── schema.sql         # Master DDL for Management DB
│   └── db_router.py       # High-availability routing
│
└── components/            # React UI Library
    ├── AssessmentView.tsx # Participant workspace
    └── admin/             # Admin management suite
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

# Initialize Management Database (SQLite by default)
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

QueryBench implements a multi-layer "Lexical & Runtime Guardian" to protect internal infrastructure:

- **Lexical Validation**: Scans all queries for banned DDL/DML tokens (`DROP`, `DELETE`, `TRUNCATE`, etc.).
- **Determinism Enforcement**: All queries **must** include an `ORDER BY` clause to ensure fair scoring during result-set comparison.
- **Row Capping**: All result sets are automatically capped at 100 rows using `TOP (100)` or `LIMIT 100` rewrites.
- **Execution Timeout**: A hard 5-second limit is enforced at the driver level for all participant queries.

## 🛠️ Troubleshooting

### SQL Server ODBC Driver Issues
QueryBench uses `pyodbc` to connect to internal SQL Server instances. You must have the Microsoft ODBC Driver installed on your host machine.
- **Windows**: Install [Microsoft ODBC Driver 17/18 for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server).
- **Linux**: Install the `msodbcsql17` or `msodbcsql18` package.

### Database Connection Issues
- Ensure your `ASSESSMENT_DB_PRIMARY_CONN` in `.env` uses the correct driver name (e.g., `{ODBC Driver 17 for SQL Server}`).
- Verify that the database server is reachable from your local machine (check VPN/Firewall settings).

### Port Conflicts
- **Backend (8080)**: If port 8080 is in use, run `python manage.py runserver 8081` and update the `VITE_API_URL` in your frontend config.
- **Frontend (3000)**: If port 3000 is occupied, Vite will attempt to use the next available port. Check the terminal output for the active URL.

### Missing Environment Variables
If the server fails to start, ensure your `.env` file contains:
- `DJANGO_SECRET_KEY`
- `ASSESSMENT_DB_PRIMARY_CONN`
- `DATABASE_URL` (if not using default SQLite)

## 🔒 Internal Use Only
This application is designed for deployment within a corporate VPN. It should never be exposed directly to the public internet. Ensure that your target database connections use read-only credentials with limited schema access.
