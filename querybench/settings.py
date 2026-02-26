
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-enterprise-key-99887766')

DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'

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
    'api',
]

MIDDLEWARE = [
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

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
}

CORS_ALLOW_ALL_ORIGINS = DEBUG  # Only allow all in development
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', 'http://localhost:3000').split(',')
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SAMESITE = 'Lax'
