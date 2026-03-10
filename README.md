# QueryBench

Enterprise SQL assessment platform built with Django/DRF and React.

## Documentation

Project documentation has been centralized in one place:

- [Documentation Hub](docs/README.md)

## Quick Links

- [Setup Guide](docs/setup.md)
- [Architecture Guide](docs/architecture.md)
- [Testing Guide](docs/testing.md)
- [Security Guide](docs/security.md)
- [Operations Guide](docs/operations.md)
- [Release Notes](docs/release-notes.md)
- [Load Report Artifacts](docs/reports/README.md)

## Development Quick Start

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py runserver 8080
```

In a second terminal:

```bash
npm install
npm run dev
```
