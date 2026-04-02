## TraceAir

Project structure:

- `Backend`: FastAPI service that parses logs, stores flight data, and generates analysis
- `Frontend/uav-dashboard`: React + Vite dashboard

## Docker Compose

Use the root-level compose file to run the whole project.

### Local development

Runs:

- backend on `http://127.0.0.1:8000`
- frontend dev server on `http://127.0.0.1:5173`

Command:

```bash
docker compose --profile dev up --build
```

### Production-style deployment

Runs:

- backend on `http://127.0.0.1:8000`
- frontend app on `http://127.0.0.1:8080`
- public entrypoint on `https://traceair.snufkink.com`

Command:

```bash
docker compose --profile prod up --build -d
```

In production mode, the frontend container serves the built SPA through Nginx, proxies `/api` to the backend container over the internal Docker network, and Caddy terminates TLS for the public domain.

### Environment

The backend container reads environment variables from:

```text
Backend/.env
```

The main expected value there is:

```bash
GEMINI_API_KEY=your-key-here
```

Optional root-level overrides:

```bash
BACKEND_PORT=8000
BACKEND_BIND_IP=127.0.0.1
FRONTEND_DEV_PORT=5173
FRONTEND_PORT=8080
FRONTEND_BIND_IP=127.0.0.1
DOMAIN=traceair.snufkink.com
VITE_DEFAULT_FLIGHT_ID=a2ed9650-0638-4597-8374-995d8e6660a4
CHOKIDAR_USEPOLLING=true
```

## GitHub Actions Deploy

The repository includes a GitHub Actions workflow at [`.github/workflows/deploy.yml`](/Users/dementii/Hackaton/TraceAir/.github/workflows/deploy.yml) that deploys on every push to `main` and also supports manual runs.

It syncs the repository to the server over SSH, writes deployment env files on the server, and runs:

```bash
docker compose --profile prod up --build -d
```

Required GitHub repository secrets:

- `DEPLOY_HOST`: `77.42.16.180`
- `DEPLOY_USER`: `root`
- `DEPLOY_PORT`: `22`
- `DEPLOY_PATH`: `/opt/traceair`
- `DEPLOY_SSH_KEY`: private key contents from `/Users/dementii/.ssh/personal_hetzner`
- `GEMINI_API_KEY`: backend Gemini key

Recommended GitHub repository variables:

- `DEPLOY_DOMAIN`: `traceair.snufkink.com`
- `BACKEND_BIND_IP`: `127.0.0.1`
- `BACKEND_PORT`: `8000`
- `FRONTEND_BIND_IP`: `127.0.0.1`
- `FRONTEND_PORT`: `8080`
- `VITE_DEFAULT_FLIGHT_ID`: `a2ed9650-0638-4597-8374-995d8e6660a4`
- `CHOKIDAR_USEPOLLING`: `true`
- `GEMINI_MODEL`: optional override such as `gemini-2.5-flash`
