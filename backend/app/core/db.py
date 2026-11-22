from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from .config import database_schema, database_url

engine = create_async_engine(
    database_url(),
    pool_pre_ping=True,
    connect_args={"server_settings": {"search_path": database_schema(), "timezone": "UTC"}},
)
Sessions = async_sessionmaker(engine, expire_on_commit=False)


async def connection():
    async with Sessions() as session:
        yield session
