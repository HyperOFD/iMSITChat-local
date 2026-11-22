import asyncio
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy.engine import make_url

ORIGIN = "http://localhost:8080"


@pytest.fixture(scope="session")
def test_schema():
    raw = os.environ.get("TEST_DATABASE_URL", "")
    if not raw or not (make_url(raw).database or "").endswith("_test"):
        pytest.fail("Требуется TEST_DATABASE_URL с именем отдельной базы, оканчивающимся на _test.")
    schema = "test_" + uuid4().hex
    dsn = raw.replace("postgresql+asyncpg://", "postgresql://", 1)

    async def ddl(command):
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute(command)
        finally:
            await conn.close()

    with pytest.MonkeyPatch.context() as env:
        env.setenv("DATABASE_URL", raw)
        env.setenv("DB_SCHEMA", schema)
        env.setenv("ALLOWED_ORIGINS", ORIGIN)
        asyncio.run(ddl(f'CREATE SCHEMA "{schema}"'))
        try:
            root = Path(__file__).resolve().parents[1]
            subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"], cwd=root, check=True
            )
            yield
        finally:
            asyncio.run(ddl(f'DROP SCHEMA "{schema}" CASCADE'))


@pytest.fixture
def client(test_schema):
    from fastapi.testclient import TestClient
    from app.main import create_app

    with TestClient(
        create_app(), base_url=ORIGIN, headers={"origin": ORIGIN, "x-imsit-request": "1"}
    ) as http:
        yield http
