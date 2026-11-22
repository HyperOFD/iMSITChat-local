import asyncio
from typing import Annotated
from anyio import CancelScope
from pydantic import ValidationError
from app.core.limits import SlidingWindow
from fastapi import (
    APIRouter,
    Depends,
    Path,
    Query,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import COOKIE, ORIGINS, SECURE, SESSION_SECONDS
from app.core.db import Sessions, connection
from app.core.errors import Problem
from app.core.security import token_digest
from app.models.entities import User
from app.realtime.hub import Client
from app.repositories import store
from app.schemas.chat import (
    Account,
    Credentials,
    DialogView,
    History,
    NewDialog,
    NewMessage,
    Peer,
    SavedMessage,
    TypingSignal,
)
from app.services import accounts, dialogs

router = APIRouter(prefix="/api")
DB = Annotated[AsyncSession, Depends(connection)]
DialogID = Annotated[int, Path(gt=0, le=2147483647)]


def digest(request):
    return token_digest(request.cookies.get(COOKIE, ""))


async def current(request: Request, db: DB):
    return await accounts.authenticate(db, digest(request))


Me = Annotated[User, Depends(current)]


@router.get("/health")
async def health(db: DB):
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.post("/register", response_model=Account, status_code=201)
async def register(data: Credentials, db: DB):
    return await accounts.register(db, data)


@router.post("/login", response_model=Account)
async def login(data: Credentials, response: Response, request: Request, db: DB):
    user, token = await accounts.login(db, data)
    if COOKIE in request.cookies:
        old = digest(request)
        await accounts.logout(db, old)
        await request.app.state.hub.revoke(old)
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="strict",
        secure=SECURE,
        path="/",
    )
    return user


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DB, me: Me):
    key = digest(request)
    await accounts.logout(db, key)
    await request.app.state.hub.revoke(key)
    response.delete_cookie(COOKIE, path="/", httponly=True, secure=SECURE, samesite="strict")


@router.get("/me", response_model=Account)
async def me(user: Me):
    return user


@router.get("/users", response_model=list[Peer])
async def users(
    db: DB,
    me: Me,
    q: Annotated[str, Query(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_]+$")],
):
    return await store.find_people(db, me.id, q.lower())


@router.get("/admin/users", response_model=list[Account])
async def admin_users(db: DB, me: Me, after: Annotated[int, Query(ge=0, le=2147483647)] = 0):
    accounts.require_admin(me)
    return await store.users_page(db, after)


@router.get("/dialogs", response_model=list[DialogView])
async def listing(db: DB, me: Me):
    return await dialogs.listing(db, me.id)


@router.post("/dialogs", response_model=DialogView)
async def start(data: NewDialog, request: Request, db: DB, me: Me):
    result = await dialogs.start(db, me.id, data.peer_id)
    request.app.state.hub.refresh_users(me.id, data.peer_id)
    return result


@router.get("/dialogs/{did}/messages", response_model=History)
async def history(
    did: DialogID,
    db: DB,
    me: Me,
    before: Annotated[int | None, Query(gt=0, le=2147483647)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
):
    return await dialogs.history(db, me.id, did, before, limit)


@router.post("/dialogs/{did}/messages", response_model=SavedMessage, status_code=201)
async def send(did: DialogID, data: NewMessage, request: Request, db: DB, me: Me):
    dialog, message = await dialogs.send(db, me.id, did, data)
    await request.app.state.hub.publish(dialog, message)
    return message


@router.websocket("/events")
async def events(ws: WebSocket):
    if ws.headers.get("origin") not in ORIGINS:
        await ws.close(code=1008)
        return
    key = digest(ws)
    hub = ws.app.state.hub
    await ws.accept()
    try:
        async with Sessions() as db:
            user = await accounts.authenticate(db, key)
    except Problem:
        await ws.close(code=4401)
        return
    client = Client(ws, key, user.id)
    hub.attach(client)
    limits = SlidingWindow()

    async def read_signals():
        while client in hub.clients:
            frame = await ws.receive()
            if frame["type"] == "websocket.disconnect":
                return
            raw = frame.get("text")
            if raw is None or len(raw) > 256 or not limits.allow("typing", 120):
                await hub.close(client, 1008)
                return
            try:
                signal = TypingSignal.model_validate_json(raw)
                await hub.typing(client, signal)
            except ValidationError:
                await hub.close(client, 1008)
                return
            except Problem as exc:
                await hub.close(client, 4401 if exc.status == 401 else 1008)
                return

    tasks = [asyncio.create_task(hub.watch_activity(client)), asyncio.create_task(read_signals())]
    try:
        finished, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in finished:
            task.result()
    except (WebSocketDisconnect, RuntimeError, OSError):
        pass
    finally:
        for task in tasks:
            task.cancel()
        with CancelScope(shield=True):
            await asyncio.gather(*tasks, return_exceptions=True)
            await hub.detach(client)
