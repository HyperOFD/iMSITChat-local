from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from starlette.websockets import WebSocketDisconnect

pytestmark = pytest.mark.integration
ORIGIN = "http://localhost:8080"
PASS = "a local test password"


def name():
    return "u_" + uuid4().hex[:12]


def create(client):
    data = {"username": name(), "password": PASS}
    client.cookies.clear()
    user = client.post("/api/register", json=data)
    assert user.status_code == 201, user.text
    result = client.post("/api/login", json=data)
    assert result.status_code == 200, result.text
    token = client.cookies["imsit_session"]
    client.cookies.clear()
    return user.json(), {"cookie": f"imsit_session={token}"}


def dialog(client, credential, peer):
    r = client.post("/api/dialogs", json={"peer_id": peer["id"]}, headers=credential)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_registration_session_logout(client):
    data = {"username": name().upper(), "password": PASS}
    assert client.post("/api/register", json={**data, "role": "admin"}).status_code == 422
    user = client.post("/api/register", json=data).json()
    assert set(user) == {"id", "username", "role"}
    assert user["username"] == data["username"].lower() and user["role"] == "user"
    assert (
        client.post("/api/register", json={**data, "username": user["username"]}).status_code == 409
    )
    assert client.post("/api/login", json={**data, "password": "wrong-password"}).status_code == 401
    r = client.post("/api/login", json=data)
    assert (
        "httponly" in r.headers["set-cookie"].lower()
        and "samesite=strict" in r.headers["set-cookie"].lower()
    )
    token = client.cookies["imsit_session"]
    assert client.get("/api/me").json() == user
    assert client.post("/api/logout").status_code == 204
    assert client.get("/api/me", headers={"cookie": f"imsit_session={token}"}).status_code == 401


def test_concurrent_unordered_pair_and_paged_history(client):
    a, ha = create(client)
    b, hb = create(client)
    with ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(
            pool.map(lambda i: dialog(client, ha if i % 2 else hb, b if i % 2 else a), range(8))
        )
    assert len(set(ids)) == 1
    path = f"/api/dialogs/{ids[0]}/messages"
    saved = []
    for sender, headers in [(a, ha), (b, hb), (a, ha)]:
        r = client.post(path, headers=headers, json={"body": "строка\nсообщения"})
        assert r.status_code == 201, r.text
        assert r.json()["sender_id"] == sender["id"] and r.json()["created_at"].endswith("Z")
        saved.append(r.json())
    page = client.get(path + "?limit=2", headers=hb).json()
    assert page == {"items": saved[1:], "has_more": True}
    assert client.get(path + "?before=" + str(saved[1]["id"]), headers=ha).json() == {
        "items": [saved[0]],
        "has_more": False,
    }
    assert client.get("/api/dialogs", headers=hb).json()[0]["last_message"] == saved[-1]
    assert client.post("/api/dialogs", headers=ha, json={"peer_id": a["id"]}).status_code == 422
    assert client.get("/api/users?q=" + b["username"], headers=ha).json() == [
        {"id": b["id"], "username": b["username"]}
    ]


def test_foreign_dialog_and_admin_privacy(client):
    from app.core.db import Sessions
    from app.models.entities import User

    _, ha = create(client)
    b, _ = create(client)
    outsider, hc = create(client)
    did = dialog(client, ha, b)

    async def promote():
        async with Sessions() as db:
            account = await db.get(User, outsider["id"])
            account.role = "admin"
            await db.commit()

    for role in ["user", "admin"]:
        admin = client.get("/api/admin/users", headers=hc)
        assert admin.status_code == (200 if role == "admin" else 403)
        if role == "admin":
            assert all(set(row) == {"id", "role", "username"} for row in admin.json())
        assert client.get("/api/dialogs", headers=hc).json() == []
        for key in [did, 2147483647]:
            path = f"/api/dialogs/{key}/messages"
            for r in (
                client.get(path, headers=hc),
                client.post(path, headers=hc, json={"body": "test"}),
            ):
                assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
        if role == "user":
            client.portal.call(promote)


def test_ws_delivery_two_tabs_and_outsider_exclusion(client):
    a, ha = create(client)
    b, hb = create(client)
    c, hc = create(client)
    ab = dialog(client, ha, b)
    ac = dialog(client, ha, c)
    with (
        client.websocket_connect("/api/events", headers=hb) as tab,
        client.websocket_connect("/api/events", headers=hb) as second,
        client.websocket_connect("/api/events", headers=hc) as outsider,
    ):
        for socket in (tab, second, outsider):
            assert socket.receive_json()["type"] == "heartbeat"
        r = client.post(f"/api/dialogs/{ab}/messages", json={"body": "private"}, headers=ha)
        for socket in (tab, second):
            assert socket.receive_json() == {"type": "message.created", "message": r.json()}
        marker = client.post(
            f"/api/dialogs/{ac}/messages", json={"body": "marker"}, headers=ha
        ).json()
        assert outsider.receive_json()["message"] == marker
        assert client.post("/api/logout", headers=hb).status_code == 204
        for socket in (tab, second):
            with pytest.raises(WebSocketDisconnect) as exc:
                socket.receive_json()
            assert exc.value.code == 4401


def test_expired_session_and_ws_origin(client):
    from app.core.db import Sessions
    from app.core.security import utcnow, token_digest
    from app.models.entities import LoginSession

    _, ha = create(client)
    b, hb = create(client)
    did = dialog(client, ha, b)

    async def expire():
        async with Sessions() as db:
            record = await db.get(LoginSession, token_digest(hb["cookie"].split("=", 1)[1]))
            record.expires_at = utcnow()
            await db.commit()

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/api/events", headers={**hb, "origin": "http://invalid.local"}
        ):
            pass
    with client.websocket_connect("/api/events", headers=hb) as socket:
        assert socket.receive_json()["type"] == "heartbeat"
        client.portal.call(expire)
        assert (
            client.post(
                f"/api/dialogs/{did}/messages", headers=ha, json={"body": "after expiry"}
            ).status_code
            == 201
        )
        with pytest.raises(WebSocketDisconnect) as exc:
            socket.receive_json()
        assert exc.value.code == 4401
    assert client.get("/api/me", headers=hb).status_code == 401
    with (
        client.websocket_connect("/api/events", headers=hb) as socket,
        pytest.raises(WebSocketDisconnect),
    ):
        socket.receive_json()


def test_csrf_errors_and_rate_limit(client):
    for headers in [{"origin": "http://invalid.local"}, {"x-imsit-request": ""}]:
        r = client.post("/api/login", json={}, headers=headers)
        assert r.status_code == 403 and r.json()["error"]["request_id"] == r.headers["x-request-id"]
    for _ in range(30):
        assert client.post("/api/login", json={}).status_code == 422
    r = client.post("/api/login", json={})
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limit"


def test_private_presence_typing_timeout_and_last_seen(client):
    _, ha = create(client)
    b, hb = create(client)
    _, hc = create(client)
    did = dialog(client, ha, b)
    signal = {"type": "typing", "dialog_id": did, "active": True}
    with client.websocket_connect("/api/events", headers=ha) as alice:
        assert alice.receive_json()["activity"] == [
            {"dialog_id": did, "online": False, "typing": False, "last_seen_at": None}
        ]
        with client.websocket_connect("/api/events", headers=hc) as outsider:
            assert outsider.receive_json()["activity"] == []
            outsider.send_json(signal)
            with pytest.raises(WebSocketDisconnect) as forbidden:
                outsider.receive_json()
            assert forbidden.value.code == 1008

        with client.websocket_connect("/api/events", headers=hb) as bob:
            assert bob.receive_json()["activity"][0]["online"]
            assert alice.receive_json()["activity"][0]["online"]
            with client.websocket_connect("/api/events", headers=hb) as second:
                assert second.receive_json()["activity"][0]["online"]
                second.send_json(signal)
                assert alice.receive_json()["activity"][0]["typing"]
            # Closing the typing tab leaves the other tab online.
            activity = alice.receive_json()["activity"][0]
            assert activity["online"] and not activity["typing"]
            bob.send_json(signal)
            assert alice.receive_json()["activity"][0]["typing"]
            # Without a stop frame, the server times the indicator out.
            assert not alice.receive_json()["activity"][0]["typing"]

        offline = alice.receive_json()["activity"][0]
        assert not offline["online"] and offline["last_seen_at"] is not None
    with client.websocket_connect("/api/events", headers=ha) as reopened:
        assert reopened.receive_json()["activity"][0] == offline
