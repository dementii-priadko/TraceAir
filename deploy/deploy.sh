#!/usr/bin/env bash

set -euo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${DEPLOY_DOMAIN:?DEPLOY_DOMAIN is required}"
: "${GEMINI_API_KEY_B64:?GEMINI_API_KEY_B64 is required}"

cd "$DEPLOY_PATH"

GEMINI_API_KEY="$(printf '%s' "$GEMINI_API_KEY_B64" | base64 --decode)"
GEMINI_MODEL=""

if [[ -n "${GEMINI_MODEL_B64:-}" ]]; then
  GEMINI_MODEL="$(printf '%s' "$GEMINI_MODEL_B64" | base64 --decode)"
fi

cat > .env <<EOF
DOMAIN=${DEPLOY_DOMAIN}
BACKEND_BIND_IP=${BACKEND_BIND_IP:-127.0.0.1}
BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_BIND_IP=${FRONTEND_BIND_IP:-127.0.0.1}
FRONTEND_PORT=${FRONTEND_PORT:-8080}
CHOKIDAR_USEPOLLING=${CHOKIDAR_USEPOLLING:-true}
VITE_DEFAULT_FLIGHT_ID=${VITE_DEFAULT_FLIGHT_ID:-a2ed9650-0638-4597-8374-995d8e6660a4}
EOF

cat > Backend/.env <<EOF
GEMINI_API_KEY=${GEMINI_API_KEY}
EOF

if [[ -n "${GEMINI_MODEL}" ]]; then
  printf 'GEMINI_MODEL=%s\n' "${GEMINI_MODEL}" >> Backend/.env
fi

docker compose --profile prod up --build -d
