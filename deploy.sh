#!/usr/bin/env bash
# One-shot Ubuntu deploy: Django (Gunicorn) + static frontend + Nginx
# Domains: real100agro.com + real100agro.in
# Target layout: /root/real100/manage.py
# Frontend: /root/real100/frontend/ (static HTML/CSS/JS, no build)
#
# On the VPS as root:
#   git clone https://github.com/searchgrand197/real100.git /root/real100
#   bash /root/real100/deploy.sh
#
# Optional:
#   EMAIL=you@example.com bash /root/real100/deploy.sh

set -euo pipefail

# Survive CRLF if the file was edited on Windows
if [[ "$(uname -s)" == "Linux" ]] && grep -q $'\r' "$0" 2>/dev/null; then
  tmp="$(mktemp)"
  tr -d '\r' < "$0" > "$tmp"
  exec bash "$tmp" "$@"
fi

# Drop stale env from an old yourbrand/intvice deploy (DOMAIN=... overrides defaults)
case "${DOMAIN:-}" in
  *yourbrand*|*intvice*) unset DOMAIN APP_NAME ;;
esac
case "${APP_NAME:-}" in
  yourbrand) unset APP_NAME ;;
esac

DOMAIN="${DOMAIN:-real100agro.com}"
DOMAIN_ALT="${DOMAIN_ALT:-real100agro.in}"
APP_NAME="${APP_NAME:-real100agro}"
APP_USER="${APP_USER:-www-data}"
EMAIL="${EMAIL:-admin@${DOMAIN}}"
WORKERS="${WORKERS:-$(( $(nproc) * 2 + 1 ))}"
SEED_DATA="${SEED_DATA:-1}"
PREFERRED_APP_DIR="/root/real100"

echo "==> Domains: ${DOMAIN} + ${DOMAIN_ALT}  (service: ${APP_NAME})"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: bash /root/real100/deploy.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer /root/real100, else detect from script / cwd
if [[ -n "${APP_DIR:-}" ]]; then
  :
elif [[ -f "${PREFERRED_APP_DIR}/manage.py" && ( "${SCRIPT_DIR}" == "${PREFERRED_APP_DIR}" || "${SCRIPT_DIR}" == "/root/real100" ) ]]; then
  APP_DIR="${PREFERRED_APP_DIR}"
elif [[ -f "${SCRIPT_DIR}/manage.py" ]]; then
  APP_DIR="${SCRIPT_DIR}"
elif [[ -f "${SCRIPT_DIR}/backend/manage.py" ]]; then
  APP_DIR="${SCRIPT_DIR}/backend"
elif [[ -f "$(pwd)/manage.py" ]]; then
  APP_DIR="$(pwd)"
elif [[ -f "$(pwd)/backend/manage.py" ]]; then
  APP_DIR="$(pwd)/backend"
elif [[ -f "${PREFERRED_APP_DIR}/manage.py" ]]; then
  APP_DIR="${PREFERRED_APP_DIR}"
else
  echo "Could not find manage.py."
  echo "Expected: /root/real100/manage.py"
  echo "  git clone https://github.com/searchgrand197/real100.git /root/real100"
  echo "  bash /root/real100/deploy.sh"
  exit 1
fi

APP_DIR="$(cd "${APP_DIR}" && pwd)"
FRONTEND_DIR="${APP_DIR}/frontend"
VENV_DIR="${APP_DIR}/.venv"
ENV_FILE="${APP_DIR}/.env"
SOCKET_PATH="/run/${APP_NAME}/${APP_NAME}.sock"
SERVICE_NAME="${APP_NAME}"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"

echo "==> App directory: ${APP_DIR}"

# /root is mode 700 by default — Nginx/www-data cannot reach /root/real100 without traverse
if [[ "${APP_DIR}" == /root/* ]]; then
  echo "==> Allowing Nginx/Gunicorn to traverse /root -> real100"
  chmod 711 /root
  chmod 755 /root/real100 2>/dev/null || true
  # every directory in the path needs +x for others
  d="${APP_DIR}"
  while [[ "${d}" == /root/* && "${d}" != "/root" ]]; do
    chmod a+x "${d}" 2>/dev/null || true
    d="$(dirname "${d}")"
  done
fi

if [[ ! -f "${APP_DIR}/manage.py" ]]; then
  echo "manage.py not found in ${APP_DIR}"
  exit 1
fi

if [[ ! -f "${APP_DIR}/requirements.txt" ]]; then
  echo "requirements.txt not found in ${APP_DIR}"
  exit 1
fi

if [[ ! -f "${FRONTEND_DIR}/index.html" ]]; then
  echo "Frontend not found at ${FRONTEND_DIR}"
  echo "Expected git layout: frontend/ (static index.html + assets/)"
  exit 1
fi

id -u "${APP_USER}" >/dev/null 2>&1 || APP_USER="www-data"

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  python3 python3-venv python3-pip python3-dev \
  build-essential libsqlite3-dev \
  nginx curl ca-certificates gnupg \
  certbot python3-certbot-nginx \
  git

echo "==> Creating Python venv + installing deps"
python3 -m venv "${VENV_DIR}"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"
pip install --upgrade pip wheel
pip install -r "${APP_DIR}/requirements.txt"

if [[ ! -f "${ENV_FILE}" ]]; then
  SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')"
  cat > "${ENV_FILE}" <<EOF
SECRET_KEY=${SECRET}
DEBUG=False
ALLOWED_HOSTS=${DOMAIN},www.${DOMAIN},${DOMAIN_ALT},www.${DOMAIN_ALT},127.0.0.1,localhost
CSRF_TRUSTED_ORIGINS=https://${DOMAIN},https://www.${DOMAIN},https://${DOMAIN_ALT},https://www.${DOMAIN_ALT},http://${DOMAIN},http://www.${DOMAIN},http://${DOMAIN_ALT},http://www.${DOMAIN_ALT}
FRONTEND_ORIGIN=https://${DOMAIN},https://www.${DOMAIN},https://${DOMAIN_ALT},https://www.${DOMAIN_ALT},http://localhost:8001,http://127.0.0.1:8001
EOF
  echo "==> Wrote ${ENV_FILE}"
else
  echo "==> Using existing ${ENV_FILE}"
fi

mkdir -p "${APP_DIR}/media" "${APP_DIR}/staticfiles" "${APP_DIR}/logs"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

echo "==> Django migrate + collectstatic"
cd "${APP_DIR}"
python manage.py migrate --noinput
python manage.py collectstatic --noinput

if [[ "${SEED_DATA}" == "1" ]]; then
  if python manage.py help seed_catalog >/dev/null 2>&1; then
    COUNT="$(python - <<'PY'
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from apps.catalog.models import Product
print(Product.objects.count())
PY
)"
    if [[ "${COUNT}" == "0" ]]; then
      echo "==> Seeding catalogue (fresh DB has no products)"
      python manage.py seed_catalog || echo "WARN: seed_catalog failed (continuing)"
    else
      echo "==> DB already has ${COUNT} products — skip seed"
    fi
  fi
fi

echo "==> Frontend is static HTML at ${FRONTEND_DIR} (no npm build)"
if [[ ! -f "${FRONTEND_DIR}/index.html" ]]; then
  echo "Frontend missing: ${FRONTEND_DIR}/index.html"
  exit 1
fi

# Critical for git deploys: migrate/build ran as root — Gunicorn is www-data
echo "==> Fixing ownership for ${APP_USER}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chmod 640 "${ENV_FILE}"
chown root:"${APP_USER}" "${ENV_FILE}"
# SQLite needs write on the directory for -journal/-wal files
chmod 775 "${APP_DIR}"
chmod 664 "${APP_DIR}/db.sqlite3" 2>/dev/null || true

echo "==> Writing Gunicorn systemd unit"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Gunicorn for ${APP_NAME} (${DOMAIN} + ${DOMAIN_ALT})
After=network.target

[Service]
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
RuntimeDirectory=${APP_NAME}
RuntimeDirectoryMode=0755
ExecStart=${VENV_DIR}/bin/gunicorn \\
  --workers ${WORKERS} \\
  --bind unix:${SOCKET_PATH} \\
  --access-logfile ${APP_DIR}/logs/gunicorn-access.log \\
  --error-logfile ${APP_DIR}/logs/gunicorn-error.log \\
  --timeout 120 \\
  config.wsgi:application
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> Writing Nginx site for ${DOMAIN} + ${DOMAIN_ALT}"
cat > "${NGINX_SITE}" <<EOF
upstream ${APP_NAME}_app {
    server unix:${SOCKET_PATH} fail_timeout=0;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN} ${DOMAIN_ALT} www.${DOMAIN_ALT};

    client_max_body_size 25M;

    root ${FRONTEND_DIR};
    index index.html;

    access_log /var/log/nginx/${APP_NAME}.access.log;
    error_log  /var/log/nginx/${APP_NAME}.error.log;

    location /api/ {
        proxy_pass http://${APP_NAME}_app;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /admin/ {
        proxy_pass http://${APP_NAME}_app;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /static/ {
        alias ${APP_DIR}/staticfiles/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /media/ {
        alias ${APP_DIR}/media/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sfn "${NGINX_SITE}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "==> Opening firewall for Nginx"
  ufw allow OpenSSH || true
  ufw allow 'Nginx Full' || true
fi

echo "==> Starting services"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
sleep 2

if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
  echo "ERROR: ${SERVICE_NAME} failed to start"
  journalctl -u "${SERVICE_NAME}" -n 40 --no-pager || true
  exit 1
fi

nginx -t
systemctl reload nginx

echo "==> Attempting Let's Encrypt SSL (DNS A records for both domains must point here)"
if certbot --nginx \
    -d "${DOMAIN}" -d "www.${DOMAIN}" \
    -d "${DOMAIN_ALT}" -d "www.${DOMAIN_ALT}" \
    --non-interactive --agree-tos -m "${EMAIL}" --redirect; then
  echo "SSL enabled: https://${DOMAIN} and https://${DOMAIN_ALT}"
else
  echo "WARN: Certbot failed (DNS not ready yet?). Site is on http://${DOMAIN} / http://${DOMAIN_ALT}"
  echo "Later run:"
  echo "  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} -d ${DOMAIN_ALT} -d www.${DOMAIN_ALT} -m ${EMAIL} --agree-tos --non-interactive --redirect"
fi

systemctl restart "${SERVICE_NAME}"
systemctl reload nginx

echo
echo "============================================"
echo " Deploy complete (git-ready)"
echo " URL:     https://${DOMAIN}  + https://${DOMAIN_ALT}"
echo " API:     /api/"
echo " Django:  /admin/"
echo " App:     ${APP_DIR}"
echo " Env:     ${ENV_FILE}"
echo " Logs:    ${APP_DIR}/logs/"
echo " Status:  systemctl status ${SERVICE_NAME}"
echo "============================================"
echo "Install path: /root/real100/manage.py"
echo "Clone + deploy:"
echo "  git clone https://github.com/searchgrand197/real100.git /root/real100"
echo "  bash /root/real100/deploy.sh"
echo "Fill secrets in ${ENV_FILE}, then: systemctl restart ${SERVICE_NAME}"
