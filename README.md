# QueryBench - The Enterprise SQL Assessment Platform

A high-performance SQL assessment platform designed for internal organizational use.

## Local Setup

### 1. Requirements
- Python 3.11+
- Node.js 18+ (for frontend development)
- SQL Server (Application & Assessment DBs)

### 2. Application Database Setup (SQL Server)
Before running the backend, initialize your SQL Server instance with the master schema:
1. Open SQL Server Management Studio (SSMS) or Azure Data Studio.
2. Execute the script located at `backend/schema.sql`.
3. Ensure the SQL user configured in `.env` has `db_owner` permissions on the `QueryBench` database.

### 3. Backend Installation
```bash
pip install django djangorestframework psycopg2-binary pyodbc django-auth-adfs
# Configure .env
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8080
```

### 4. Frontend Installation
```bash
npm install
npm run dev
```

## Microsoft Authentication (Azure Entra ID)
The platform is pre-configured to support Microsoft SSO. 

### Azure Setup:
1. Register an App in **Azure Entra ID**.
2. Set **Redirect URI** to `https://<your-domain>/auth/callback`.
3. Update environment variables (`AZURE_TENANT_ID`, etc).

## Security Design Decisions
- **SSO Integration**: Uses OIDC via Azure Entra ID.
- **Master-Target Isolation**: The "Application DB" (where scores are) is physically separate from the "Assessment DB" (where raw data for queries is).
- **Lexical Validator**: Rejects any query containing keywords like `DROP`, `UPDATE`, `EXEC`, or `TRUNCATE`.
- **Row Limit**: Results are truncated at 5,000 rows.

## Configuration
Update these variables in your `.env`:
- `DATABASE_URL`: Connection for QueryBench (App DB).
- `ASSESSMENT_DB_CONNECTION`: Default connection for evaluation.
- `SQL_TIMEOUT`: 5
- `MAX_ROWS`: 5000