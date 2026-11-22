import re
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(Input):
    username: str = Field(max_length=100)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize(cls, value):
        name = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9_]{3,32}", name):
            raise ValueError("Имя должно содержать от 3 до 32 латинских букв, цифр или знаков _.")
        return name.lower()

    @field_validator("password")
    @classmethod
    def valid_password(cls, value):
        if not value.strip():
            raise ValueError("Пароль не может состоять из пробелов.")
        return value


class NewDialog(Input):
    peer_id: int = Field(gt=0, le=2147483647)


class NewMessage(Input):
    body: str = Field(max_length=4000)

    @field_validator("body")
    @classmethod
    def nonblank(cls, value):
        if not value.strip() or "\x00" in value or any(0xD800 <= ord(c) <= 0xDFFF for c in value):
            raise ValueError("Введите текст сообщения без недопустимых символов.")
        return value.strip()


class Peer(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str


class Account(Peer):
    role: Literal["user", "admin"]


class SavedMessage(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dialog_id: int
    sender_id: int
    body: str
    created_at: datetime


class DialogView(BaseModel):
    id: int
    peer: Peer
    last_message: SavedMessage | None


class History(BaseModel):
    items: list[SavedMessage]
    has_more: bool


class TypingSignal(Input):
    type: Literal["typing"]
    dialog_id: int = Field(strict=True, gt=0, le=2147483647)
    active: bool = Field(strict=True)
