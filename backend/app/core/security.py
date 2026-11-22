import hashlib
import secrets
from datetime import datetime, timezone
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError

hasher = PasswordHasher(type=Type.ID)
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))


def verify_password(encoded, password):
    try:
        return hasher.verify(encoded, password)
    except VerifyMismatchError:
        return False


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def new_token():
    return secrets.token_urlsafe(32)


def utcnow():
    return datetime.now(timezone.utc)


def session_live(record, now):
    return record is not None and record.expires_at > now
