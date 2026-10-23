
import os

from dotenv import load_dotenv
from pymongo import AsyncMongoClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "healthwiise")

if not MONGODB_URL:
    raise RuntimeError("MONGODB_URL is missing from backend/.env")

client = AsyncMongoClient(
    MONGODB_URL,
    serverSelectionTimeoutMS=5000,
)

database = client[DATABASE_NAME]


async def check_database_connection():
    await client.admin.command("ping")
    return True


async def close_database_connection():
    await client.close()
