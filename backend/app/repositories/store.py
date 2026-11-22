from sqlalchemy import case, delete, or_, select, true, update, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import aliased
from app.models.entities import Dialog, LoginSession, Message, User


async def create_user(db, name, encoded, role):
    stmt = insert(User).values(username=name, password_hash=encoded, role=role)
    return await db.scalar(
        stmt.on_conflict_do_nothing(index_elements=[User.username]).returning(User)
    )


async def by_name(db, name):
    return await db.scalar(select(User).where(User.username == name))


async def find_people(db, user_id, prefix):
    query = select(User).where(
        User.id != user_id, User.username.startswith(prefix, autoescape=True)
    )
    return (await db.scalars(query.order_by(User.username).limit(25))).all()


async def users_page(db, after):
    return (await db.scalars(select(User).where(User.id > after).order_by(User.id).limit(50))).all()


async def session_account(db, digest):
    stmt = select(LoginSession, User).join(User).where(LoginSession.digest == digest)
    return (await db.execute(stmt)).one_or_none()


async def clear_expired(db, now):
    await db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))


async def remove_session(db, digest):
    await db.execute(delete(LoginSession).where(LoginSession.digest == digest))


async def get_pair(db, a, b):
    stmt = (
        insert(Dialog)
        .values(first_id=a, second_id=b)
        .on_conflict_do_nothing(constraint="dialog_pair")
    )
    await db.execute(stmt)
    return await db.scalar(select(Dialog).where(Dialog.first_id == a, Dialog.second_id == b))


async def dialog_rows(db, uid, dialog_id=None):
    latest = (
        select(Message)
        .where(Message.dialog_id == Dialog.id)
        .order_by(Message.id.desc())
        .limit(1)
        .correlate(Dialog)
        .lateral()
    )
    msg = aliased(Message, latest)
    peer_id = case((Dialog.first_id == uid, Dialog.second_id), else_=Dialog.first_id)
    stmt = (
        select(Dialog, User, msg)
        .join(User, User.id == peer_id)
        .outerjoin(latest, true())
        .where(or_(Dialog.first_id == uid, Dialog.second_id == uid))
    )
    if dialog_id is not None:
        stmt = stmt.where(Dialog.id == dialog_id)
    return (await db.execute(stmt.order_by(msg.id.desc().nullslast(), Dialog.id.desc()))).all()


async def fetch_dialog(db, dialog_id, *, lock=False):
    return await db.get(Dialog, dialog_id, with_for_update=lock)


async def history_rows(db, dialog_id, before, count):
    stmt = select(Message).where(Message.dialog_id == dialog_id)
    if before is not None:
        stmt = stmt.where(Message.id < before)
    return (await db.scalars(stmt.order_by(Message.id.desc()).limit(count))).all()


async def mark_seen(db, uid, when):
    await db.execute(
        update(User)
        .where(User.id == uid)
        .values(last_seen_at=func.greatest(User.last_seen_at, when))
    )
    await db.commit()


async def contacts(db, uid):
    other_id = case((Dialog.first_id == uid, Dialog.second_id), else_=Dialog.first_id)
    stmt = (
        select(Dialog.id, User.id, User.last_seen_at)
        .join(User, User.id == other_id)
        .where(or_(Dialog.first_id == uid, Dialog.second_id == uid))
    )
    return (await db.execute(stmt)).all()
