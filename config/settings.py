"""Django settings for the real100agro backend.

Env-based. Postgres when DATABASE_URL is set, SQLite otherwise (dev only).
Frontend is the static site on Cloudflare Workers; this API serves it.
"""
import os
from pathlib import Path
from urllib.parse import urlparse

from corsheaders.defaults import default_headers
from dotenv import load_dotenv

try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent
# Restart the dev server after changing .env so SMTP and Firebase pick it up.
load_dotenv(BASE_DIR / ".env")


def env(name, default=""):
    return os.environ.get(name, default)


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes")


SECRET_KEY = env("SECRET_KEY", "dev-only-insecure-change-me")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = [h.strip() for h in env("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in env(
        "CSRF_TRUSTED_ORIGINS",
        "https://real100agro.com,https://www.real100agro.com,https://real100agro.in,https://www.real100agro.in",
    ).split(",")
    if o.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "apps.accounts",
    "apps.catalog",
    "apps.orders",
    "apps.content",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Database: Postgres via DATABASE_URL, else SQLite (dev only) ---
db_url = env("DATABASE_URL")
if db_url:
    u = urlparse(db_url)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": u.path.lstrip("/"),
            "USER": u.username,
            "PASSWORD": u.password,
            "HOST": u.hostname,
            "PORT": u.port or 5432,
            "CONN_MAX_AGE": 60,
        }
    }
else:
    DATABASES = {
        "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
    }

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- CORS: Workers frontend + local dev ---
# The static site is not served by Django, so a page on another port
# (Live Server, python http.server, etc.) is a different origin. Without
# these, the browser sends only the OPTIONS preflight and never the GET,
# and the page keeps its hardcoded HTML.
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in env(
        "FRONTEND_ORIGIN",
        "https://real100agro.com,https://www.real100agro.com,https://real100agro.in,https://www.real100agro.in,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8001,http://127.0.0.1:8001",
    ).split(",") if o.strip()
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
]
CORS_ALLOW_CREDENTIALS = True
# Guest carts are keyed by this header (localStorage), because a cart
# cookie set by port 8000 is not reliable for a page on another port.
CORS_ALLOW_HEADERS = list(default_headers) + ["x-cart-key"]

REST_FRAMEWORK = {
    # Token only. SessionAuthentication would treat a Django admin login
    # cookie as the shop user and then reject every cart/checkout POST
    # for a missing CSRF token. Anonymous carts still use the session key.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardPagination",
    "PAGE_SIZE": 24,
    "DEFAULT_THROTTLE_RATES": {"anon": "100/min", "user": "300/min"},
}

# --- Integrations ---
# Phone OTP is Firebase Auth on the storefront. The backend only checks
# the ID token against Google's public keys (same approach as the clinic
# site). A service-account file is optional and not required.
FIREBASE_PROJECT_ID = env("FIREBASE_PROJECT_ID", "kushnath-19401")
FIREBASE_CREDENTIALS_PATH = env("FIREBASE_CREDENTIALS_PATH")
# Browser API key for storefront phone OTP (Identity Toolkit). Override in
# .env if Google Cloud rotates the key.
FIREBASE_WEB_API_KEY = env(
    "FIREBASE_WEB_API_KEY",
    "AIzaSyAvRobkSXCsNFOdogIFwKuN95nLOQIkXoI",
)
# Demo OTP is off once Firebase is the login. Set ALLOW_DEMO_AUTH=1 only
# for a machine that cannot reach Firebase.
ALLOW_DEMO_AUTH = env_bool("ALLOW_DEMO_AUTH", False)
DEMO_OTP = env("DEMO_OTP", "1234")
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = env("RAZORPAY_WEBHOOK_SECRET")
DELHIVERY_API_TOKEN = env("DELHIVERY_API_TOKEN")
DELHIVERY_BASE_URL = env("DELHIVERY_BASE_URL", "https://track.delhivery.com")
DELHIVERY_PICKUP_NAME = env("DELHIVERY_PICKUP_NAME", "real100agro warehouse")
STORE_GSTIN = env("STORE_GSTIN")
STORE_FSSAI = env("STORE_FSSAI")

# --- Email (GoDaddy SMTP, same mailbox the clinic site already sends from) ---
EMAIL_HOST = env("EMAIL_HOST")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_TIMEOUT = int(env("EMAIL_TIMEOUT", "10"))
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "real100agro <support@intvice.com>")
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST
    else "django.core.mail.backends.console.EmailBackend"
)
# Shop inbox for new orders and status copies. Customer mail goes to the
# email they save with their delivery address. An empty value skips the
# shop copy (paused while testing).
ORDER_NOTIFY_EMAIL = env("ORDER_NOTIFY_EMAIL", "support@real100agroindia.com")
# Temporary dev copy of every outgoing mail (BCC, so customers never see it).
# Leave empty before hosting.
EMAIL_COPY_TO = env("EMAIL_COPY_TO")
STORE_SUPPORT_EMAIL = env("STORE_SUPPORT_EMAIL", "support@real100agroindia.com")
STORE_SUPPORT_PHONE = env("STORE_SUPPORT_PHONE", "+91 94131 75726")
