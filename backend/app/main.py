from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.core.config import ORIGINS
from app.core.db import engine
from app.core.http import install_http
from app.realtime.hub import Hub


@asynccontextmanager
async def lifespan(app):
    yield
    await engine.dispose()


def create_app():
    app = FastAPI(
        title="iMSITChat",
        version="1.0",
        openapi_url="/api/openapi.json",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.hub = Hub()
    app.include_router(router)
    install_http(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(ORIGINS),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Imsit-Request"],
    )
    return app


app = create_app()
