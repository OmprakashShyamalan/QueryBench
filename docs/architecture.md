# Architecture Guide

## High-Level Stack

- Backend: Django + Django REST Framework
- Frontend: React + TypeScript + Vite
- Evaluation Engine: SQL validation, row limiting, timeout enforcement, result comparison
- Database layer: management DB + external SQL Server targets
- E2E: Cypress suites for admin and participant flows

## Core Directories

- `querybench/`: Django project settings, routing, WSGI
- `api/`: REST models, serializers, views, URLs, migrations
- `backend/`: query execution and SQL safety engine
- `components/`: React UI screens and admin tools
- `services/`: typed frontend API client
- `cypress/`: E2E tests and fixtures

## Request and Evaluation Flow

1. User submits SQL in the frontend editor.
2. Frontend posts query to backend API.
3. Backend validates SQL safety (single SELECT/CTE only).
4. Backend injects row cap via `TOP (n)` strategy.
5. Backend executes query against configured SQL target with timeout guard.
6. Backend normalizes and compares participant result against expected result.
7. Score and per-question status are persisted and returned to UI.

## Data Model Summary

- `database_configs`: external SQL connection details
- `questions`: prompt + solution query
- `assessments`: question collections
- `assessment_questions`: ordering bridge
- `assignments`: assessment-to-user distribution
- `attempts`: submission attempt metadata
- `attempt_answers`: per-question result and grading details
