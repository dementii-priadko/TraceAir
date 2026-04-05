from threading import Thread

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .analysis import build_analysis_unavailable, generate_analysis
from .config import INDEX_PATH, STORAGE_DIR, UPLOADS_DIR
from .stores import FlightStore, UploadJobStore


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
upload_jobs = UploadJobStore()


@app.get("/")
async def root():
    return {"message": "TraceAir backend"}


@app.post("/api/upload")
async def upload_flight(file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    filename = file.filename or "upload.bin"
    job_id = upload_jobs.create(filename)
    upload_jobs.update(job_id, status="processing", stage="Upload received", progress=10)

    def run_job() -> None:
        def on_progress(progress_value: float, stage_label: str) -> None:
            mapped_progress = 10 + int(round(max(0.0, min(progress_value, 1.0)) * 78))
            upload_jobs.update(
                job_id,
                status="processing",
                stage=stage_label,
                progress=mapped_progress,
            )

        try:
            flight_id = store.save_upload(
                filename,
                contents,
                progress_callback=on_progress,
            )

            upload_jobs.update(
                job_id,
                status="processing",
                stage="Generating analysis",
                progress=92,
            )

            flight = store.get_flight(flight_id)
            if flight is None:
                raise RuntimeError("Parsed flight payload was not found after upload")

            cached = store.get_cached_analysis(flight_id)
            if cached is None:
                try:
                    analysis = generate_analysis(flight_id, flight)
                except Exception as exc:
                    analysis = build_analysis_unavailable(flight_id, str(exc))
                store.save_analysis(flight_id, analysis)

            upload_jobs.update(
                job_id,
                status="processing",
                stage="Finalizing dashboard",
                progress=98,
            )
        except Exception as exc:
            upload_jobs.update(
                job_id,
                status="failed",
                stage="Processing failed",
                progress=100,
                error=f"Failed to parse flight log: {exc}",
            )
            return

        upload_jobs.update(
            job_id,
            status="completed",
            stage="Flight ready",
            progress=100,
            flight_id=flight_id,
        )

    Thread(target=run_job, daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/uploads/{job_id}")
async def get_upload_status(job_id: str):
    job = upload_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Upload job not found")
    return job


@app.get("/api/flights/{flight_id}")
async def get_flight(flight_id: str):
    flight = store.get_flight(flight_id)
    if flight is None:
        raise HTTPException(status_code=404, detail="Flight not found")
    return flight


@app.post("/api/flights/{flight_id}/reprocess")
async def reprocess_flight(flight_id: str):
    try:
        flight = store.reprocess_flight(flight_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Flight not found") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to reprocess flight log: {exc}") from exc

    return {"id": flight_id, "reprocessed": True, "flight": flight}


@app.post("/api/flights/reprocess")
async def reprocess_all_flights():
    result = store.reprocess_all_flights()
    return {
        "reprocessed_count": len(result["reprocessed"]),
        "failed_count": len(result["failed"]),
        **result,
    }


@app.get("/api/flights/{flight_id}/analysis")
async def get_flight_analysis(flight_id: str):
    flight = store.get_flight(flight_id)
    if flight is None:
        raise HTTPException(status_code=404, detail="Flight not found")

    cached = store.get_cached_analysis(flight_id)
    if cached is not None:
        return cached

    try:
        analysis = generate_analysis(flight_id, flight)
    except Exception as exc:
        analysis = build_analysis_unavailable(flight_id, str(exc))
    store.save_analysis(flight_id, analysis)
    return analysis
