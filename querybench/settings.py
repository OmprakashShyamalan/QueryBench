
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-enterprise-key-99887766')

# Environment mode: "local" (default) or "prod".
# Set QB_ENV=prod in the production environment to tighten security settings.
ENV = os.environ.get("QB_ENV", "local").lower()
DEBUG = (ENV == "local")

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'csp',
    'api',
    'lti',
]

MIDDLEWARE = [
    'csp.middleware.CSPMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'querybench.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'querybench.wsgi.application'

# Database Configuration: Defaults to SQLite if DB_NAME is not provided.
# Set DB_NAME (and optionally DB_USER/DB_PASSWORD) in .env to use SQL Server.
# If DB_USER is omitted, Windows Authentication (Trusted_Connection) is used instead.
DB_NAME = os.getenv('DB_NAME')
if DB_NAME:
    _db_user = os.getenv('DB_USER', '')
    _db_password = os.getenv('DB_PASSWORD', '')
    _db_port = os.getenv('DB_PORT', '')          # Empty = let SQL Server Browser resolve (needed for named instances)
    _use_sql_auth = bool(_db_user)

    _db_config = {
        'ENGINE': 'mssql',
        'NAME': DB_NAME,
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'USER': _db_user if _use_sql_auth else '',
        'PASSWORD': _db_password if _use_sql_auth else '',
        'OPTIONS': {
            'driver': 'ODBC Driver 17 for SQL Server',
            'connection_timeout': 30,
            'Trusted_Connection': 'no' if _use_sql_auth else 'yes',
        },
    }
    # Only include PORT when explicitly set — named instances (e.g. localhost\SQLEXPRESS)
    # resolve their port via SQL Server Browser; forcing 1433 will fail.
    if _db_port:
        _db_config['PORT'] = _db_port

    DATABASES = {'default': _db_config}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── Password hashing: fast for local dev, secure for production ───────────────
# Local dev: MD5PasswordHasher provides instant login (10-100x faster than PBKDF2).
# Production: PBKDF2 with 600,000+ iterations (Django default) protects against rainbow tables.
# NEVER use MD5PasswordHasher in production — it exists only for dev convenience.
if DEBUG:
    PASSWORD_HASHERS = [
        'django.contrib.auth.hashers.MD5PasswordHasher',  # Fast (insecure) for dev
        'django.contrib.auth.hashers.PBKDF2PasswordHasher',  # Fallback for existing passwords
    ]
else:
    # Production uses Django's secure defaults (PBKDF2SHA256PasswordHasher, etc.)
    pass

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Cache ──────────────────────────────────────────────────────────────────────
# Dev: LocMemCache (single-process, no dependencies).
# Prod: set REDIS_URL (e.g. redis://localhost:6379/0) to switch to Redis,
#       which makes rate-limiting and async job state work correctly across
#       multiple Gunicorn workers.
_REDIS_URL = os.getenv('REDIS_URL', '').strip()
if _REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _REDIS_URL,
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    # Anti-automation: 100 requests/min per authenticated user (ASVS V13).
    # Raise or lower "user" rate to match expected load before going to prod.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user': '100/min',
    },
}

CORS_ALLOW_ALL_ORIGINS = DEBUG  # Only allow all in development
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', 'http://localhost:3000').split(',')
if DEBUG:
    CSRF_TRUSTED_ORIGINS += ['http://*:3000', 'http://*:3001']
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SAMESITE = 'Lax'

# Session expires when the browser is closed (no persistent cookies across sessions)
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

# ── Cookie security ────────────────────────────────────────────────────────────
# Secure flag is off in local mode (no HTTPS); enable for prod.
SESSION_COOKIE_SECURE = (ENV == "prod")
CSRF_COOKIE_SECURE = (ENV == "prod")
# SameSite=Lax prevents most CSRF; tighten to "Strict" in prod if front + back share origin.
# (SESSION_COOKIE_SAMESITE and CSRF_COOKIE_SAMESITE already set above to 'Lax')

# ── Core security headers ──────────────────────────────────────────────────────
SECURE_CONTENT_TYPE_NOSNIFF = True   # X-Content-Type-Options: nosniff
X_FRAME_OPTIONS = "DENY"             # Clickjacking protection (also handled by XFrameOptionsMiddleware)

# ── Content Security Policy (django-csp >= 4.0 format) ────────────────────────
# Default: self-only. No external CDNs allowed.
# Add 'unsafe-inline' or hashes here only if the Vite build requires it.
# In prod, consider restricting connect-src to the API origin only.
CONTENT_SECURITY_POLICY = {
    "DIRECTIVES": {
        "default-src": ("'self'",),
        "script-src": ("'self'",),
        "style-src": ("'self'",),
        "img-src": ("'self'", "data:"),
    }
}

# ── Enterprise SSO / OIDC (placeholder — disabled by default) ─────────────────
# To enable: set QB_USE_SSO=true and supply the OIDC_* env vars below.
# Requires:  pip install mozilla-django-oidc
USE_ENTERPRISE_SSO = (os.environ.get("QB_USE_SSO", "false").lower() == "true")

if USE_ENTERPRISE_SSO:
    INSTALLED_APPS += ["mozilla_django_oidc"]
    AUTHENTICATION_BACKENDS = (
        "django.contrib.auth.backends.ModelBackend",
        "mozilla_django_oidc.auth.OIDCAuthenticationBackend",
    )

    LOGIN_URL = "/oidc/authenticate/"
    LOGIN_REDIRECT_URL = "/"
    LOGOUT_REDIRECT_URL = "/"

    OIDC_RP_CLIENT_ID = os.environ.get("OIDC_RP_CLIENT_ID", "<placeholder>")
    OIDC_RP_CLIENT_SECRET = os.environ.get("OIDC_RP_CLIENT_SECRET", "<placeholder>")
    OIDC_RP_SIGN_ALGO = "RS256"
    OIDC_RP_SCOPES = "openid profile email"

    # Microsoft Entra ID (Azure AD) endpoints — fill in when tenant details are available.
    OIDC_OP_AUTHORIZATION_ENDPOINT = os.environ.get("OIDC_OP_AUTHORIZATION_ENDPOINT", "<placeholder>")
    OIDC_OP_TOKEN_ENDPOINT = os.environ.get("OIDC_OP_TOKEN_ENDPOINT", "<placeholder>")
    OIDC_OP_USER_ENDPOINT = os.environ.get("OIDC_OP_USER_ENDPOINT", "<placeholder>")
    OIDC_OP_JWKS_ENDPOINT = os.environ.get("OIDC_OP_JWKS_ENDPOINT", "<placeholder>")

# ── Structured logging ─────────────────────────────────────────────────────────
# JSON-like format to stdout; ready for SIEM ingestion when deployed.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "loggers": {
        "querybench": {"handlers": ["console"], "level": "INFO"},
        "QueryBench":  {"handlers": ["console"], "level": "INFO"},
        "django.security": {"handlers": ["console"], "level": "INFO"},
    },
}
