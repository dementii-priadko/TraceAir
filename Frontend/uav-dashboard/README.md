# TraceAir Frontend

Frontend dashboard for UAV / rocket telemetry analysis.

Built with:
- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- Leaflet / React Leaflet
- Docker / Docker Compose

## What It Does

The app loads parsed flight telemetry from the backend and presents:
- summary metrics
- landing page with direct `.bin` / `.tlog` upload
- 3D viewer with route replay and time scrubbing
- speed and altitude charts
- clickable mission stages and modes timeline
- interactive ground track with map / satellite switch
- backend-generated markdown analysis
- export to CSV, XLSX, raw JSON, Markdown, and PDF
- uploaded file label surfaced in the dashboard header

## Requirements

You need:
- Node.js 20+ recommended
- npm 10+ recommended
- the TraceAir backend running locally

Backend default URL expected by the frontend:

```text
http://127.0.0.1:8000
```

## Environment

Copy `.env.example` to `.env` if you want custom values.

Available variables:

```bash
VITE_API_BASE_URL=
VITE_DEV_PROXY_TARGET=http://127.0.0.1:8000
VITE_DEFAULT_FLIGHT_ID=a2ed9650-0638-4597-8374-995d8e6660a4
```

Variable notes:

- `VITE_API_BASE_URL`: optional explicit API origin. Leave empty to use same-origin `/api` requests.
- `VITE_DEV_PROXY_TARGET`: Vite dev proxy target for `/api` during development.
- `VITE_DEFAULT_FLIGHT_ID`: default flight to open when no uploaded flight is selected.

## Install

```bash
npm install
```

## Run

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Preview production build:

```bash
npm run preview
```

## Backend Integration

The frontend currently uses these existing backend endpoints:

- `POST /api/upload`
- `GET /api/flights/{id}`
- `GET /api/flights/{id}/analysis`

No additional backend endpoints are required.

## Main UI Areas

- Landing page with single-step file upload
- Header with branding, active file label, export, and upload
- Summary cards
- 3D viewer
- Speed chart
- Stages and modes timeline
- Ground track map
- Altitude chart
- Analysis summary

## Export Formats

The export menu supports:

- `CSV`: flattened GPS trajectory telemetry
- `XLSX`: spreadsheet export of trajectory telemetry
- `Raw JSON`: full flight payload exactly as currently loaded
- `Markdown`: exported AI analysis summary
- `PDF`: text-based AI analysis report with headings, lists, and inline emphasis

## Project Structure

```text
src/
  components/
    ai/
    charts/
    common/
    events/
    layout/
    summary/
    viewer/
  data/
  pages/
  services/
  types/
  utils/
```

## Notes

- If the backend is unavailable, the dashboard falls back to local mock data.
- Analysis markdown is rendered on the frontend with a lightweight custom renderer.
- PDF export uses `jsPDF` and is lazy-loaded on demand.
- The interactive map uses OpenStreetMap and Esri satellite tiles.
- The dashboard stores uploaded file labels in `sessionStorage` so the UI can show the original filename instead of only the backend id.
- The current bundle is still relatively large because of `xlsx`, map libraries, and PDF export dependencies.

## Next Reasonable Improvements

- lazy-load map and xlsx export logic
- add click-outside close behavior for the export dropdown
- add upload progress and success state
- reduce the main dashboard chunk further via route/component-level splitting
