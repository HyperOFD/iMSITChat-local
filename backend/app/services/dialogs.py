from app.core.errors import Problem, unavailable
from app.models.entities import User, Message
from app.repositories import store
from app.schemas.chat import DialogView, History, SavedMessage


def is_member(dialog, uid):
    return dialog is not None and uid in (dialog.first_id, dialog.second_id)


async def accessible(db, dialog_id, uid, *, lock=False):
    dialog = await store.fetch_dialog(db, dialog_id, lock=lock)
    if not is_member(dialog, uid):
        raise unavailable()
    return dialog


async def listing(db, uid, dialog_id=None):
    rows = await store.dialog_rows(db, uid, dialog_id)
    return [DialogView(id=d.id, peer=u, last_message=m) for d, u, m in rows]


async def start(db, uid, peer_id):
    if uid == peer_id:
        raise Problem(422, "self_dialog", "Выберите другого собеседника.")
    if await db.get(User, peer_id) is None:
        raise Problem(404, "user_not_found", "Пользователь не найден.")
    dialog = await store.get_pair(db, *sorted((uid, peer_id)))
    (row,) = await listing(db, uid, dialog.id)
    await db.commit()
    return row


async def history(db, uid, did, before, limit):
    await accessible(db, did, uid)
    rows = await store.history_rows(db, did, before, limit + 1)
    return History(items=list(reversed(rows[:limit])), has_more=len(rows) > limit)


async def send(db, uid, did, draft):
    # Serialize writers in this dialog so message IDs follow commit order.
    dialog = await accessible(db, did, uid, lock=True)
    message = Message(dialog_id=did, sender_id=uid, body=draft.body)
    db.add(message)
    await db.commit()
    return dialog, SavedMessage.model_validate(message)
