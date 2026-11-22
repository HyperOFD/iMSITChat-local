import json
import logging
from uuid import uuid4
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from .config import ORIGINS
from .errors import Problem
from .limits import SlidingWindow

logger = logging.getLogger("uvicorn.error")


def error(request, status, code, message, fields=None):
    content = {"code": code, "message": message, "request_id": request.state.request_id}
    if fields:
        content["fields"] = fields
    return JSONResponse({"error": content}, status_code=status)


def install_http(app):
    limits = SlidingWindow()
    app.state.limits = limits

    @app.exception_handler(Problem)
    async def business_error(request, exc):
        return error(request, exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        fields = {}
        for item in exc.errors():
            field = str(item["loc"][-1])
            hints = {
                "username": "Допустимы 3–32 латинские буквы, цифры и _.",
                "password": "Введите пароль длиной 8–128 символов.",
                "body": "Введите от 1 до 4000 символов.",
            }
            fields[field] = hints.get(field, "Недопустимое значение.")
        return error(request, 422, "validation", "Проверьте введённые данные.", fields)

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return error(request, exc.status_code, "http_error", "Ресурс или метод недоступен.")

    @app.middleware("http")
    async def security(request, call_next):
        request.state.request_id = uuid4().hex
        path = request.url.path
        ip = request.headers.get("x-real-ip") or (
            request.client.host if request.client else "local"
        )
        method = request.method
        guarded = method not in {"GET", "HEAD", "OPTIONS"}
        if guarded and (
            request.headers.get("origin") not in ORIGINS
            or request.headers.get("x-imsit-request") != "1"
        ):
            response = error(request, 403, "csrf", "Запрос отклонён. Обновите страницу.")
        elif path != "/api/health" and not limits.allow(("api", ip), 600):
            response = error(
                request, 429, "rate_limit", "Слишком много запросов. Подождите минуту."
            )
        elif guarded and not limits.allow(
            (ip, "auth" if path in ("/api/login", "/api/register") else "write"),
            30 if path in ("/api/login", "/api/register") else 120,
        ):
            response = error(
                request, 429, "rate_limit", "Слишком много запросов. Подождите минуту."
            )
        else:
            try:
                response = await call_next(request)
            except Exception as exc:
                logger.error(
                    json.dumps(
                        {
                            "event": "request_failed",
                            "request_id": request.state.request_id,
                            "kind": type(exc).__name__,
                        }
                    )
                )
                response = error(request, 500, "internal", "Не удалось выполнить запрос.")
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["Cache-Control"] = "no-store"
        if response.status_code == 429:
            response.headers["Retry-After"] = "60"
        route = request.scope.get("route")
        if path != "/api/health":
            logger.info(
                json.dumps(
                    {
                        "request_id": request.state.request_id,
                        "method": method,
                        "route": getattr(route, "path", None),
                        "status": response.status_code,
                    }
                )
            )
        return response
