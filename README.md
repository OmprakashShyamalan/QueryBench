# QueryBench - Enterprise SQL Assessment Platform

QueryBench is a high-performance, internal-only platform designed for assessing technical SQL proficiency. It combines a robust Django/DRF backend with a high-fidelity React workspace, featuring real-time schema visualization and secure query execution.

## 🏗️ Architecture Overview

QueryBench operates on a **Two-Tier Database Model**:
1.  **Management DB (SQLite/PostgreSQL)**: Stores users, assessments, assignments, and scores. Managed by Django.
2.  **Target Assessment DBs (SQL Server/Postgres)**: External databases where participant queries are actually executed. These are treated as read-only "targets."

## 🚀 Local Setup

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **ODBC Driver 17 for SQL Server** (Required for the `pyodbc` execution engine)
- **SQL Server Instance** (For the target databases)

### 2. Backend Installation (Django)
```bash
# Install dependencies
pip install django djangorestframework django-cors-headers pyodbc

# Setup Environment
cp .env.example .env  # Update with your SQL Server credentials

# Initialize Management DB
python manage.py migrate
python manage.py createsuperuser

# Start Server
python manage.py runserver 8000
```

### 3. Frontend Installation (Vite/React)
```bash
# Install dependencies
npm install

# Start Development Server
npm run dev
```

## 🛡️ Security & Evaluation Engine

The platform implements a multi-layer "Lexical & Runtime Guardian" to protect internal infrastructure:

### Lexical Validation
Every query submitted (by Admin or Participant) is scanned for banned DDL/DML tokens. 
**Banned Tokens**: `DROP`, `DELETE`, `UPDATE`, `INSERT`, `TRUNCATE`, `ALTER`, `EXEC`, `MERGE`, `GRANT`, `REVOKE`.

### Determinism Enforcement
To ensure fair scoring, all queries **must** include an `ORDER BY` clause. The engine uses a `TOP (100)` rewrite strategy; without deterministic sorting, result set comparisons would be unstable.

### Row Capping & Timeouts
- **Result Limit**: Max 100 rows per execution to prevent memory exhaustion.
- **Query Timeout**: 5-second hard limit on the database driver level.
- **Concurrency**: Managed via a global semaphore (`MAX_CONCURRENT_QUERY_RUNS`).

## 🎨 Key Features

- **Resizable Workspace**: Grab the handles between the Sidebar, Code Editor, and Results grid to customize your view.
- **Schema Explorer**: 
  - **Metadata List**: Searchable list of tables and columns.
  - **ERD Diagram**: Interactive visual relationship map powered by `@xyflow/react` and `dagre`.
- **Admin Suite**:
  - **Question Library**: Master repository of "Gold Standard" queries.
  - **Infrastructure Targets**: Manage connection strings for different internal database environments.
  - **Bulk Operations**: Import questions via CSV or assign assessments to lists of emails.

## 📁 Project Structure

```text
├── api/                # Django REST API (Models, Serializers, Views)
├── backend/            # SQL Execution Engine (Runner, Router, Governor)
├── components/         # React UI Library
│   ├── admin/          # Admin Dashboard & Management Tabs
│   ├── ui/             # Reusable Design System (Modals, Inputs)
│   └── AssessmentView.tsx # Main Participant Workspace
├── querybench/         # Django Project Configuration
├── types.ts            # Shared TypeScript Interfaces
└── App.tsx             # Frontend Routing & State
```

## 🔒 Internal Use Only
This application is designed for deployment within a corporate VPN. Ensure that the `ASSESSMENT_DB_CONNECTION` in your `.env` points to a non-production, read-only replica of your data.
