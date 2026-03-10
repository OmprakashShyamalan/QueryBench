# Security Guide

## Active Controls

| Control | Implementation |
|---|---|
| SQL allow-listing | Rejects DDL/DML/EXEC/multi-statement and comment-obfuscated queries |
| Row capping | `TOP (n)` injection to limit result volume |
| Query timeout | 5-second execution cap |
| API throttling | DRF `UserRateThrottle` (default 100 req/min) |
| CSRF protection | Django middleware + same-site cookie controls |
| Content Security Policy | `django-csp` middleware with self-only directives |
| Session hardening | browser-close expiry and secure cookie behavior in prod |
| Structured logging | execution and security events available for SIEM ingestion |

## Configuration Pointers

- SQL evaluation and row cap logic: `backend/sql_eval.py`
- Timeout value: `backend/config.py`
- Throttle config and security headers: `querybench/settings.py`
- Security regression tests: `api/tests/test_security.py`

## Environment Posture

- `QB_ENV=local`: development defaults
- `QB_ENV=prod`: secure cookie flags for HTTPS deployment

## Recommended Production Hardening

1. Run behind HTTPS reverse proxy.
2. Use dedicated read-only SQL principal for target databases.
3. Keep `.env` out of source control.
4. Run security tests after any settings or middleware change.
