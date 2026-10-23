
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from app.core.dependencies import get_current_user
from app.db.database import database
from app.schemas.profile import (
    DashboardPreferenceRequest,
    ProfileResponse,
)

router = APIRouter(prefix="/profile", tags=["Profile"])

users_collection = database["users"]


def serialize_profile(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "dashboard_type": user.get("dashboard_type"),
        "onboarding_completed": user.get(
            "onboarding_completed", False
        ),
    }


@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(
    user: dict = Depends(get_current_user),
):
    return serialize_profile(user)


@router.patch(
    "/dashboard",
    response_model=ProfileResponse,
)
async def set_dashboard(
    data: DashboardPreferenceRequest,
    user: dict = Depends(get_current_user),
):
    await users_collection.update_one(
        {"_id": ObjectId(user["_id"])},
        {
            "$set": {
                "dashboard_type": data.dashboard_type,
                "onboarding_completed": True,
            }
        },
    )

    updated_user = await users_collection.find_one(
        {"_id": ObjectId(user["_id"])}
    )

    if updated_user is None:
        raise HTTPException(
            status_code=404,
            detail="User profile not found",
        )

    return serialize_profile(updated_user)
