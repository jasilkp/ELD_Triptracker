import os
from pathlib import Path

from dotenv import load_dotenv
import dj_database_url

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# Require SECRET_KEY to be set explicitly — no insecure fallback in production
try:
    SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
except KeyError as e:
    raise RuntimeError(
        "Missing required environment variable: DJANGO_SECRET_KEY. "
        "Set this value in your Render/host environment variables."
    ) from e

DEBUG = os.getenv("DJANGO_DEBUG", "0") == "1"

# If running in production, ensure critical variables are present so startup fails fast with clear messages
if not DEBUG:
    _missing = []
    if not os.getenv("DJANGO_ALLOWED_HOSTS"):
        _missing.append("DJANGO_ALLOWED_HOSTS")
    if _missing:
        raise RuntimeError(
            "Missing required environment variables for production: " + ", ".join(_missing) +
            ". Please set them in your Render/host environment."
        )

allowed_hosts = os.getenv("DJANGO_ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts.split(",") if h.strip()]
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = [".onrender.com", "localhost", "127.0.0.1"]
elif ".onrender.com" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(".onrender.com")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "trips",
]

MIDDLEWARE = [
    "eldtrip.middleware.ExceptionLoggingMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "eldtrip.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "eldtrip.wsgi.application"
ASGI_APPLICATION = "eldtrip.asgi.application"

default_database_url = f"sqlite:///{BASE_DIR / 'db.sqlite3'}"
DATABASES = {
    "default": dj_database_url.config(
        default=os.getenv("DATABASE_URL", default_database_url),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS — driven by env var; allows all origins only if explicitly set
_cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
if _cors_origins:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(",") if o.strip()]
else:
    CORS_ALLOW_ALL_ORIGINS = True

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ]
}
