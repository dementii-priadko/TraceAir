import json
import os

from google import genai

from .config import DEFAULT_MODEL


def build_analysis_unavailable(flight_id: str, reason: str) -> dict:
    return {
        "id": flight_id,
        "model": "disabled",
        "summary": (
            "## General analysis\n"
            f"AI analysis is unavailable: {reason}.\n\n"
            "## Key metrics\n"
            "Use the parsed telemetry metrics shown on the dashboard.\n\n"
            "## Flight phases\n"
            "No AI-generated phase summary is available.\n\n"
            "## Anomaly detection\n"
            "No AI-generated anomaly review is available."
        ),
    }


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
        return build_analysis_unavailable(flight_id, "GEMINI_API_KEY is not configured")

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
