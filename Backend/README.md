# TraceAir Backend

This backend accepts ArduPilot `.BIN` and `.tlog` flight logs, parses them into JSON, stores the parsed result on disk, and can generate a short LLM-based analysis for any saved flight.

It is intentionally simple. There is no database, no auth, and no object storage layer. Everything is stored locally in the configured storage directory so the service is easy to run during development and easy to inspect when something goes wrong.

## What it does

- `POST /api/upload` uploads a `.BIN` or `.tlog` file, starts an async processing job, and returns a `job_id`.
- `GET /api/uploads/{job_id}` returns the current upload / parsing / analysis progress.
- `GET /api/flights/{id}` returns the full parsed JSON for a previously uploaded flight.
- `GET /api/flights/{id}/analysis` returns a Markdown analysis generated with Gemini.

If the same file is uploaded twice, the backend does not create a duplicate flight record. It hashes the file contents with SHA-256, checks the local manifest, and returns the existing UUID if that hash has already been seen.

## Storage layout

By default the service writes everything into `storage/`.

If `TRACEAIR_STORAGE_DIR` is set, that directory is used instead. In the Docker image it defaults to `/data/traceair` so uploads and parsed files can be mounted on a persistent volume and retained across deployments.

The service writes:

- `storage/index.json` is the manifest that maps file hashes to flight UUIDs.
- `storage/uploads/{sha256}.bin` is the original uploaded file, stored by content hash.
- `storage/{uuid}.json` is the parsed flight payload returned by `GET /api/flights/{id}`.
- `storage/{uuid}.analysis.json` is the cached Gemini analysis.

That means:

- raw uploads are deduplicated by file content
- API-facing flight records stay stable by UUID
- repeated analysis requests do not call Gemini again unless the cache file is removed

For container deployments, mount `/data/traceair` to persistent storage. Example:

```bash
docker run -p 8000:8000 \
  -v traceair-data:/data/traceair \
  traceair-backend
```

## Requirements

- Python 3.12 is recommended
- a Gemini API key in `GEMINI_API_KEY`

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

Set the Gemini key:

```bash
export GEMINI_API_KEY='your-key-here'
```

Optional:

```bash
export GEMINI_MODEL='gemini-2.5-flash'
```

## Run

```bash
uvicorn main:app --reload
```

By default the API will be available at `http://127.0.0.1:8000`.

## API

### `POST /api/upload`

Send a `multipart/form-data` request with a single file field named `file`.

Example:

```bash
curl -X POST http://127.0.0.1:8000/api/upload \
  -F "file=@/absolute/path/to/flight.BIN"
```

Response:

```json
{
  "job_id": "a1b2c3d4-..."
}
```

Notes:

- the uploaded file is hashed before parsing
- parsing and AI analysis run in a background job
- if that hash already exists in `storage/index.json`, the existing UUID is reused
- invalid or empty uploads return `400`

### `GET /api/uploads/{job_id}`

Returns the current upload job status.

Example:

```bash
curl http://127.0.0.1:8000/api/uploads/a1b2c3d4-...
```

Example response:

```json
{
  "id": "a1b2c3d4-...",
  "filename": "flight.tlog",
  "status": "processing",
  "stage": "Generating analysis",
  "progress": 92,
  "flight_id": null,
  "error": null
}
```

When the job finishes, `status` becomes `completed` and `flight_id` is populated.

### `GET /api/flights/{id}`

Returns the full parsed flight JSON for the given UUID.

Example:

```bash
curl http://127.0.0.1:8000/api/flights/a1b2c3d4-...
```

If the UUID does not exist, the endpoint returns `404`.

### `GET /api/flights/{id}/analysis`

Returns a cached or freshly generated Gemini analysis for the given flight.

Example:

```bash
curl http://127.0.0.1:8000/api/flights/a1b2c3d4-.../analysis
```

The summary is generated as Markdown and follows this structure:

1. General analysis
2. Key metrics
3. Flight phases
4. Anomaly detection

If the flight is missing, the endpoint returns `404`.

If `GEMINI_API_KEY` is not set, the endpoint returns `503`.

## Parser

The parser lives in `mavlink_parser.py`. It reads ArduPilot DataFlash logs and MAVLink telemetry logs and produces a JSON structure with:

- metadata and firmware info
- origin and sensor sampling details
- high-level metrics such as speed, acceleration, altitude, and duration
- GPS and SIM trajectories
- IMU and attitude data
- events, stages, modes, and parameters

The parser output is saved directly as the canonical flight JSON.

Metric calculation notes:

- `total_distance_m` is calculated from consecutive GPS fixes with the Haversine formula
- `max_horizontal_speed_ms` and `max_vertical_speed_ms` are derived from IMU acceleration arrays via trapezoidal integration
- when IMU data is unavailable, speed metrics fall back to GPS-derived estimates
- WGS-84 coordinates are converted into a local ENU frame for 3D visualization
