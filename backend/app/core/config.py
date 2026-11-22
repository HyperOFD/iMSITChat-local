import os
import re
from pathlib import Path
from urllib.parse import quote

ORIGINS = tuple(
    os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
)
COOKIE = "imsit_session"
SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
SESSION_SECONDS = 7 * 24 * 3600


def database_schema():
    schema = os.getenv("DB_SCHEMA", "public")
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", schema):
        raise ValueError("Некорректное имя схемы")
    return schema


def database_url():
    if url := os.getenv("DATABASE_URL"):
        return url
    password = Path(os.environ["DB_PASSWORD_FILE"]).read_text().strip()
    return f"postgresql+asyncpg://imsit:{quote(password, safe='')}@db/imsit"
