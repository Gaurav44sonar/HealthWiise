import asyncio
import os
import logging
from dotenv import load_dotenv
from pymongo import AsyncMongoClient

load_dotenv()
logger = logging.getLogger(__name__)

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "healthwiise")
IS_TESTING = os.getenv("TESTING", "").lower() in ("true", "1", "yes")

class _DummyCollection:
    def __getitem__(self, item):
        return self

    def __getattr__(self, name):
        async def _dummy_call(*args, **kwargs):
            return []
        return _dummy_call

class _DummyDatabase:
    def __getitem__(self, item):
        return _DummyCollection()

if IS_TESTING or not MONGODB_URL:
    client = None
    database = _DummyDatabase()
else:
    try:
        client = AsyncMongoClient(
            MONGODB_URL,
            serverSelectionTimeoutMS=5000,
        )
        database = client[DATABASE_NAME]
    except Exception as exc:
        logger.warning("MongoDB client could not be initialized (offline/sandbox): %s", exc)
        client = None
        database = _DummyDatabase()


async def check_database_connection():
    if client is None or IS_TESTING:
        return False
    try:
        await asyncio.wait_for(client.admin.command("ping"), timeout=5)
        return True
    except Exception as exc:
        logger.warning("MongoDB ping failed or offline: %s", exc)
        return False


async def close_database_connection():
    if client is not None:
        try:
            await client.close()
        except Exception:
            pass
