from datetime import timedelta
from starlette.concurrency import run_in_threadpool
from app.core import security
from app.core.config import SESSION_SECONDS
from app.core.errors import Problem, unauthorized
from app.models.entities import LoginSession
from app.repositories import store


async def register(db, credentials, *, role="user"):
    encoded = await run_in_threadpool(security.hasher.hash, credentials.password)
    user = await store.create_user(db, credentials.username, encoded, role)
    if user is None:
        raise Problem(409, "username_taken", "Это имя уже занято.")
    await db.commit()
    return user


async def login(db, credentials):
    user = await store.by_name(db, credentials.username)
    encoded = user.password_hash if user else security.DUMMY_HASH
    valid = await run_in_threadpool(security.verify_password, encoded, credentials.password)
    if not valid or user is None:
        raise Problem(401, "bad_credentials", "Неверное имя пользователя или пароль.")
    now = security.utcnow()
    token = security.new_token()
    await store.clear_expired(db, now)
    db.add(
        LoginSession(
            digest=security.token_digest(token),
            user_id=user.id,
            expires_at=now + timedelta(seconds=SESSION_SECONDS),
        )
    )
    await db.commit()
    return user, token


async def authenticate(db, digest):
    row = await store.session_account(db, digest)
    if not security.session_live(row[0] if row else None, security.utcnow()):
        raise unauthorized()
    return row[1]


def require_admin(user):
    if user.role != "admin":
        raise Problem(403, "admin_required", "Доступно только администратору.")


async def logout(db, digest):
    await store.remove_session(db, digest)
    await db.commit()
