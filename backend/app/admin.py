import argparse
import asyncio
import getpass
from pydantic import ValidationError
from .core.db import Sessions, engine
from .core.errors import Problem
from .schemas.chat import Credentials
from .services.accounts import register


async def create(name):
    try:
        data = Credentials(username=name, password=getpass.getpass("Пароль (8–128 символов): "))
        async with Sessions() as db:
            user = await register(db, data, role="admin")
        print(f"Создан администратор {user.username}.")
    except ValidationError:
        raise SystemExit("Проверьте формат имени и длину пароля.") from None
    except Problem as exc:
        raise SystemExit(exc.message) from None
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Создание локального администратора")
    parser.add_argument("username")
    asyncio.run(create(parser.parse_args().username))
