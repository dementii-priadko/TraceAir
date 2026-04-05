import hashlib
import json
from pathlib import Path
from threading import Lock
from time import time
from typing import Callable
from uuid import uuid4

from mavlink_parser import parse_flight_log


UploadProgressCallback = Callable[[float, str], None]


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

    def _resolve_upload_path(self, upload_path: str) -> Path:
        stored_path = Path(upload_path)
        if stored_path.is_absolute():
            return stored_path
        return (self.storage_dir / stored_path).resolve()

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

    def save_upload(
        self,
        filename: str,
        contents: bytes,
        progress_callback: UploadProgressCallback | None = None,
    ) -> str:
        file_hash = hashlib.sha256(contents).hexdigest()
        if progress_callback:
            progress_callback(0.08, "Checking existing uploads")

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
                    if progress_callback:
                        progress_callback(1.0, "Flight already processed")
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
                    if progress_callback:
                        progress_callback(0.16, "Saving uploaded file")
                    upload_path.write_bytes(contents)
                parsed = parse_flight_log(str(upload_path), progress_callback=progress_callback)
                if progress_callback:
                    progress_callback(0.96, "Writing parsed result")
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
            if progress_callback:
                progress_callback(1.0, "Flight ready")
            return flight_id

    def get_flight(self, flight_id: str) -> dict | None:
        flight_path = self._json_path(flight_id)
        if not flight_path.exists():
            return None
        return json.loads(flight_path.read_text(encoding="utf-8"))

    def reprocess_flight(self, flight_id: str) -> dict:
        with self._lock:
            index = self._read_index()
            record = index.get("flights", {}).get(flight_id)
            if not isinstance(record, dict):
                raise KeyError(flight_id)

            upload_path_value = record.get("upload_path")
            if not isinstance(upload_path_value, str) or not upload_path_value:
                raise FileNotFoundError(f"Missing upload path for flight {flight_id}")

            upload_path = self._resolve_upload_path(upload_path_value)
            if not upload_path.exists():
                raise FileNotFoundError(f"Upload file not found for flight {flight_id}: {upload_path}")

            parsed = parse_flight_log(str(upload_path))
            self._json_path(flight_id).write_text(
                json.dumps(parsed, indent=2), encoding="utf-8"
            )
            self._analysis_path(flight_id).unlink(missing_ok=True)
            return parsed

    def reprocess_all_flights(self) -> dict[str, list[str]]:
        with self._lock:
            index = self._read_index()
            flight_ids = list(index.get("flights", {}).keys())

        reprocessed: list[str] = []
        failed: list[str] = []

        for flight_id in flight_ids:
            try:
                self.reprocess_flight(flight_id)
                reprocessed.append(flight_id)
            except Exception:
                failed.append(flight_id)

        return {
            "reprocessed": reprocessed,
            "failed": failed,
        }

    def get_cached_analysis(self, flight_id: str) -> dict | None:
        analysis_path = self._analysis_path(flight_id)
        if not analysis_path.exists():
            return None
        return json.loads(analysis_path.read_text(encoding="utf-8"))

    def save_analysis(self, flight_id: str, analysis: dict) -> None:
        self._analysis_path(flight_id).write_text(json.dumps(analysis, indent=2), encoding="utf-8")


class UploadJobStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._jobs: dict[str, dict] = {}

    def create(self, filename: str) -> str:
        job_id = str(uuid4())
        now = time()
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "filename": filename,
                "status": "queued",
                "stage": "Queued",
                "progress": 0,
                "flight_id": None,
                "error": None,
                "created_at": now,
                "updated_at": now,
            }
        return job_id

    def update(
        self,
        job_id: str,
        *,
        status: str | None = None,
        stage: str | None = None,
        progress: int | None = None,
        flight_id: str | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            if status is not None:
                job["status"] = status
            if stage is not None:
                job["stage"] = stage
            if progress is not None:
                job["progress"] = max(0, min(progress, 100))
            if flight_id is not None:
                job["flight_id"] = flight_id
            if error is not None:
                job["error"] = error
            job["updated_at"] = time()

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job is not None else None
