#!/usr/bin/env bash

set -euo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${DEPLOY_DOMAIN:?DEPLOY_DOMAIN is required}"

cd "$DEPLOY_PATH"
if [[ ! -f Backend/.env ]]; then
  echo "Backend/.env is missing on the server" >&2
  exit 1
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

docker compose --profile prod up --build -d
