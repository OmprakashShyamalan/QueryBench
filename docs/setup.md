# Setup Guide

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 20+ |
| ODBC Driver | 17 or 18 for SQL Server |

Notes:
- Django is pinned to `<6.0` because `mssql-django` does not yet support Django 6.x.
- Use a virtual environment for backend dependencies.

## Backend Setup (Django)

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8080
```

## Frontend Setup (React + Vite)

```bash
npm install
npm run dev
```

Frontend default URL is `http://localhost:3000`.

## Quick Start (Two Terminals)

Terminal 1:

```bash
python manage.py runserver 8080
```

Terminal 2:

```bash
npm run dev
```

## Environment Modes

```bash
QB_ENV=local python manage.py runserver 8080
QB_ENV=prod gunicorn querybench.wsgi
```

`QB_ENV` controls `DEBUG`, `SESSION_COOKIE_SECURE`, and `CSRF_COOKIE_SECURE`.
