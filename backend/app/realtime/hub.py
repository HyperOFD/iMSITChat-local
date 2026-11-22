import asyncio
from dataclasses import dataclass, field

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from app.core.db import Sessions
from app.core.errors import Problem
from app.core.security import utcnow
from app.repositories import store
from app.services.accounts import authenticate
from app.services.dialogs import accessible, is_member


@dataclass(eq=False)
class Client:
    socket: WebSocket
    digest: str
    uid: int
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    peers: set[int] = field(default_factory=set)
    typing_dialog: int | None = None
    typing_peer: int | None = None
    expiry: asyncio.TimerHandle | None = None
    closed: bool = False


class Hub:
    def __init__(self):
        self.clients: set[Client] = set()

    def refresh_users(self, *uids):
        for client in self.clients:
            if client.uid in uids:
                client.changed.set()

    def presence_changed(self, uid):
        for client in self.clients:
            if uid in client.peers:
                client.changed.set()

    def attach(self, client):
        first = not any(c.uid == client.uid for c in self.clients)
        self.clients.add(client)
        if first:
            self.presence_changed(client.uid)

    def stop_typing(self, client):
        if client.expiry is not None:
            client.expiry.cancel()
            client.expiry = None
        if client.typing_peer is not None:
            self.refresh_users(client.typing_peer)
        client.typing_dialog = client.typing_peer = None

    async def typing(self, client, signal):
        async with Sessions() as db:
            user = await authenticate(db, client.digest)
            dialog = await accessible(db, signal.dialog_id, user.id)
        if client not in self.clients:
            return
        if not signal.active:
            if client.typing_dialog == dialog.id:
                self.stop_typing(client)
            return
        if client.typing_dialog != dialog.id:
            self.stop_typing(client)
            client.typing_dialog = dialog.id
            client.typing_peer = dialog.second_id if dialog.first_id == user.id else dialog.first_id
            self.refresh_users(client.typing_peer)
        if client.expiry:
            client.expiry.cancel()
        client.expiry = asyncio.get_running_loop().call_later(5, self.stop_typing, client)

    async def detach(self, client):
        if client not in self.clients:
            return
        self.clients.remove(client)
        self.stop_typing(client)
        client.changed.set()
        if not any(c.uid == client.uid for c in self.clients):
            try:
                async with Sessions() as db:
                    await store.mark_seen(db, client.uid, utcnow())
            finally:
                self.presence_changed(client.uid)

    async def close(self, client, code):
        async with client.lock:
            await self._close(client, code)

    async def _close(self, client, code):
        if client in self.clients and not client.closed:
            try:
                await asyncio.wait_for(client.socket.close(code=code), 2)
            except (RuntimeError, OSError, WebSocketDisconnect, TimeoutError):
                pass
            client.closed = True
            client.changed.set()

    async def revoke(self, digest):
        await asyncio.gather(
            *(self.close(c, 4401) for c in list(self.clients) if c.digest == digest)
        )

    def snapshot(self, client, contacts):
        client.peers = {uid for _, uid, _ in contacts}
        online = {c.uid for c in self.clients}
        typing = {(c.uid, c.typing_dialog) for c in self.clients if c.typing_dialog is not None}
        return [
            {
                "dialog_id": did,
                "online": uid in online,
                "typing": (uid, did) in typing,
                "last_seen_at": seen.isoformat() if seen else None,
            }
            for did, uid, seen in contacts
        ]

    async def update(self, client, dialog=None, message=None, *, heartbeat=False):
        async with client.lock:
            if client.closed or client not in self.clients:
                return
            try:
                async with Sessions() as db:
                    user = await authenticate(db, client.digest)
                    if message is None:
                        if heartbeat:
                            await store.mark_seen(db, user.id, utcnow())
                        contacts = await store.contacts(db, user.id)
                        event = {
                            "type": "heartbeat" if heartbeat else "activity.snapshot",
                            "activity": self.snapshot(client, contacts),
                        }
                    elif is_member(dialog, user.id):
                        event = {
                            "type": "message.created",
                            "message": message.model_dump(mode="json"),
                        }
                    else:
                        return
                await asyncio.wait_for(client.socket.send_json(event), 2)
            except Problem:
                await self._close(client, 4401)
            except (OSError, RuntimeError, WebSocketDisconnect, TimeoutError):
                await self._close(client, 1011)

    async def watch_activity(self, client):
        loop = asyncio.get_running_loop()
        next_heartbeat = loop.time()
        while not client.closed and client in self.clients:
            heartbeat = loop.time() >= next_heartbeat
            if heartbeat:
                next_heartbeat = loop.time() + 20
            client.changed.clear()
            await self.update(client, heartbeat=heartbeat)
            if client.closed or client not in self.clients:
                return
            try:
                await asyncio.wait_for(client.changed.wait(), max(0, next_heartbeat - loop.time()))
            except TimeoutError:
                pass

    async def publish(self, dialog, message):
        await asyncio.gather(
            *(
                self.update(c, dialog, message)
                for c in list(self.clients)
                if is_member(dialog, c.uid)
            )
        )
