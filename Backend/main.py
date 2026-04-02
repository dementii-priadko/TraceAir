import hashlib
import json
import os
from pathlib import Path
from threading import Lock
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai

from mavlink_parser import parse_flight_log


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR = Path(os.getenv("TRACEAIR_STORAGE_DIR", str(DEFAULT_STORAGE_DIR))).expanduser().resolve()
UPLOADS_DIR = STORAGE_DIR / "uploads"
INDEX_PATH = STORAGE_DIR / "index.json"
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


class FlightStore:
    def __init__(self, storage_dir: Path, uploads_dir: Path, index_path: Path) -> None:
        self.storage_dir = storage_dir
        self.uploads_dir = uploads_dir
        self.index_path = index_path
        self._lock = Lock()
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        if not self.index_path.exists():
            self._write_index({"hash_to_id": {}, "flights": {}})

    def _read_index(self) -> dict:
        return json.loads(self.index_path.read_text(encoding="utf-8"))

    def _write_index(self, payload: dict) -> None:
        self.index_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _json_path(self, flight_id: str) -> Path:
        return self.storage_dir / f"{flight_id}.json"

    def _analysis_path(self, flight_id: str) -> Path:
        return self.storage_dir / f"{flight_id}.analysis.json"

    def _is_valid_flight_payload(self, payload: dict | None) -> bool:
        if not isinstance(payload, dict):
            return False

        trajectory = payload.get("trajectory")
        if not isinstance(trajectory, dict):
            return False

        gps_samples = trajectory.get("gps")
        if isinstance(gps_samples, list) and gps_samples:
            return True

        imu = payload.get("imu")
        if isinstance(imu, dict) and isinstance(imu.get("raw_chart"), list) and imu["raw_chart"]:
            return True

        attitude = payload.get("attitude")
        return isinstance(attitude, list) and bool(attitude)

    def save_upload(self, filename: str, contents: bytes) -> str:
        file_hash = hashlib.sha256(contents).hexdigest()

        with self._lock:
            index = self._read_index()
            existing_id = index["hash_to_id"].get(file_hash)
            if existing_id:
                existing_json_path = self._json_path(existing_id)
                existing_payload = None

                if existing_json_path.exists():
                    try:
                        existing_payload = json.loads(existing_json_path.read_text(encoding="utf-8"))
                    except Exception:
                        existing_payload = None

                if self._is_valid_flight_payload(existing_payload):
                    return existing_id

                index["hash_to_id"].pop(file_hash, None)
                index["flights"].pop(existing_id, None)
                existing_json_path.unlink(missing_ok=True)
                self._analysis_path(existing_id).unlink(missing_ok=True)

            flight_id = str(uuid4())
            upload_suffix = Path(filename or "upload.bin").suffix or ".bin"
            upload_path = self.uploads_dir / f"{file_hash}{upload_suffix}"
            json_path = self._json_path(flight_id)

            try:
                if not upload_path.exists():
                    upload_path.write_bytes(contents)
                parsed = parse_flight_log(str(upload_path))
                json_path.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
            except Exception:
                upload_path.unlink(missing_ok=True)
                json_path.unlink(missing_ok=True)
                raise

            index["hash_to_id"][file_hash] = flight_id
            index["flights"][flight_id] = {
                "sha256": file_hash,
                "source_filename": filename,
                "upload_path": str(upload_path.relative_to(self.storage_dir)),
                "json_path": json_path.name,
            }
            self._write_index(index)
            return flight_id

    def get_flight(self, flight_id: str) -> dict | None:
        flight_path = self._json_path(flight_id)
        if not flight_path.exists():
            return None
        return json.loads(flight_path.read_text(encoding="utf-8"))

    def get_cached_analysis(self, flight_id: str) -> dict | None:
        analysis_path = self._analysis_path(flight_id)
        if not analysis_path.exists():
            return None
        return json.loads(analysis_path.read_text(encoding="utf-8"))

    def save_analysis(self, flight_id: str, analysis: dict) -> None:
        self._analysis_path(flight_id).write_text(json.dumps(analysis, indent=2), encoding="utf-8")


def build_analysis_prompt(flight_id: str, flight_data: dict) -> str:
    metrics = flight_data.get("metrics", {})
    meta = flight_data.get("meta", {})
    stages = flight_data.get("stages", [])
    events = flight_data.get("events", [])

    condensed = {
        "meta": meta,
        "metrics": metrics,
        "stages": stages[:20],
        "events": events[:30],
    }

    return (
        "You are analyzing a parsed rocket flight log.\n"
        "Write the response in Markdown.\n"
        "Use exactly these top-level sections in this order:\n"
        "1. General analysis\n"
        "2. Key metrics\n"
        "3. Flight phases\n"
        "4. Anomaly detection\n"
        "Do not mention internal IDs, UUIDs, filenames, storage paths, or implementation details.\n"
        "If a section has no evidence, say that explicitly.\n\n"
        f"Flight data:\n{json.dumps(condensed, indent=2)}"
    )


def generate_analysis(flight_id: str, flight_data: dict) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents=build_analysis_prompt(flight_id, flight_data),
    )
    summary = (response.text or "").strip()
    return {
        "id": flight_id,
        "model": DEFAULT_MODEL,
        "summary": summary,
    }


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = FlightStore(STORAGE_DIR, UPLOADS_DIR, INDEX_PATH)


@app.get("/")
async def root():
    return {"message": "TraceAir backend"}


@app.post("/api/upload")
async def upload_flight(file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        flight_id = store.save_upload(file.filename or "upload.bin", contents)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse flight log: {exc}") from exc

    return {"id": flight_id}


@app.get("/api/flights/{flight_id}")
async def get_flight(flight_id: str):
    flight = store.get_flight(flight_id)
    if flight is None:
        raise HTTPException(status_code=404, detail="Flight not found")
    return flight


@app.get("/api/flights/{flight_id}/analysis")
async def get_flight_analysis(flight_id: str):
    flight = store.get_flight(flight_id)
    if flight is None:
        raise HTTPException(status_code=404, detail="Flight not found")

    cached = store.get_cached_analysis(flight_id)
    if cached is not None:
        return cached

    analysis = generate_analysis(flight_id, flight)
    store.save_analysis(flight_id, analysis)
    return analysis
