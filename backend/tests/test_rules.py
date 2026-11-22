from datetime import timedelta
from types import SimpleNamespace
import pytest
from pydantic import ValidationError
from app.core.errors import Problem
from app.core.security import hasher, session_live, utcnow, verify_password, new_token, token_digest
from app.schemas.chat import Credentials, NewMessage
from app.services.accounts import require_admin
from app.services.dialogs import is_member


def test_argon2id_salted_password():
    a, b = hasher.hash("test-password"), hasher.hash("test-password")
    assert a.startswith("$argon2id$") and a != b
    assert verify_password(a, "test-password")
    assert not verify_password(a, "other-password")


def test_username_canonical_form():
    assert Credentials(username="  Alice_42 ", password="passphrase").username == "alice_42"


@pytest.mark.parametrize("name", ["ab", "аlice", "x" * 33, "a-b", "Kim"])
def test_invalid_username(name):
    with pytest.raises(ValidationError):
        Credentials(username=name, password="passphrase")


@pytest.mark.parametrize("body", ["  \t\n", "x" * 4001, "a\x00b"])
def test_invalid_message(body):
    with pytest.raises(ValidationError):
        NewMessage(body=body)


def test_message_preserves_lines_and_limit():
    assert NewMessage(body=" hi\nthere ").body == "hi\nthere"
    assert len(NewMessage(body="я" * 4000).body) == 4000


def test_only_participants():
    dialog = SimpleNamespace(first_id=3, second_id=5)
    assert is_member(dialog, 3) and is_member(dialog, 5)
    assert not is_member(dialog, 7) and not is_member(None, 3)


def test_admin_gate():
    require_admin(SimpleNamespace(role="admin"))
    with pytest.raises(Problem) as exc:
        require_admin(SimpleNamespace(role="user"))
    assert exc.value.status == 403


def test_session_live_until_expiry_and_missing_after_revocation():
    now = utcnow()
    assert session_live(SimpleNamespace(expires_at=now + timedelta(seconds=1)), now)
    assert not session_live(SimpleNamespace(expires_at=now), now)
    assert not session_live(None, now)


def test_tokens_are_unique_and_only_digests_identify_sessions():
    first, second = new_token(), new_token()
    assert first != second and token_digest(first) != token_digest(second)
    assert len(token_digest(first)) == 64 and token_digest(first) != first
