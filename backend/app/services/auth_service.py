
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from app.db.database import database
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
)

users_collection = database["users"]


async def register_user(name: str, email: str, password: str):
    normalized_email = str(email).strip().lower()

    # Ensure email addresses are unique.
    await users_collection.create_index("email", unique=True)

    user = {
        "name": name.strip(),
        "email": normalized_email,
        "hashed_password": hash_password(password),
        "dashboard_type": None,
        "onboarding_completed": False,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        result = await users_collection.insert_one(user)
    except DuplicateKeyError:
        return None

    user["id"] = str(result.inserted_id)
    user.pop("_id", None)
    user.pop("hashed_password", None)

    return user


async def login_user(email: str, password: str):
    normalized_email = str(email).strip().lower()

    user = await users_collection.find_one(
        {"email": normalized_email}
    )

    if not user or not verify_password(
        password, user["hashed_password"]
    ):
        return None

    user_id = str(user["_id"])
    token = create_access_token(user_id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": user["name"],
            "email": user["email"],
            "dashboard_type": user.get("dashboard_type"),
        },
    }
