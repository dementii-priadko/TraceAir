import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR = Path(os.getenv("TRACEAIR_STORAGE_DIR", str(DEFAULT_STORAGE_DIR))).expanduser().resolve()
UPLOADS_DIR = STORAGE_DIR / "uploads"
INDEX_PATH = STORAGE_DIR / "index.json"
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
