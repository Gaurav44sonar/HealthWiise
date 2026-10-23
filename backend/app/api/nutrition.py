
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user
from app.db.database import database
from app.schemas.nutrition import (
    WaterEntryRequest,
    MealEntryRequest,
    HydrationGoalRequest,
)

router = APIRouter(prefix="/nutrition", tags=["Nutrition"])

water_collection = database["water_entries"]
meals_collection = database["meal_entries"]
users_collection = database["users"]


def utc_now():
    return datetime.now(timezone.utc)


def normalize_time(value: datetime | None) -> datetime:
    if value is None:
        return utc_now()

    if value.tzinfo is None:
        raise HTTPException(
            status_code=422,
            detail="recorded_at must include a timezone",
        )

    return value.astimezone(timezone.utc)


def user_filter(user: dict) -> dict:
    return {"user_id": str(user["_id"])}


@router.post("/water", status_code=201)
async def add_water(
    data: WaterEntryRequest,
    user: dict = Depends(get_current_user),
):
    entry = {
        **user_filter(user),
        "amount_ml": data.amount_ml,
        "recorded_at": normalize_time(data.recorded_at),
        "created_at": utc_now(),
    }

    result = await water_collection.insert_one(entry)

    return {
        "id": str(result.inserted_id),
        "amount_ml": entry["amount_ml"],
        "recorded_at": entry["recorded_at"],
    }


@router.get("/water")
async def get_water_entries(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    user: dict = Depends(get_current_user),
):
    try:
        day = (
            datetime.strptime(date, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            if date
            else utc_now().replace(
                hour=0, minute=0, second=0, microsecond=0
            )
        )
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date")

    end = day + timedelta(days=1)

    entries = await water_collection.find(
        {
            **user_filter(user),
            "recorded_at": {"$gte": day, "$lt": end},
        }
    ).sort("recorded_at", -1).to_list(length=500)

    total = sum(item["amount_ml"] for item in entries)

    def format_dt(dt):
        if isinstance(dt, datetime):
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        return dt

    return {
        "date": day.date().isoformat(),
        "total_ml": total,
        "entries": [
            {
                "id": str(item["_id"]),
                "amount_ml": item["amount_ml"],
                "recorded_at": format_dt(item.get("recorded_at")),
            }
            for item in entries
        ],
    }


@router.patch("/hydration-goal")
async def set_hydration_goal(
    data: HydrationGoalRequest,
    user: dict = Depends(get_current_user),
):
    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"hydration_goal_ml": data.goal_ml}},
    )

    return {"hydration_goal_ml": data.goal_ml}



@router.post("/meals", status_code=201)
async def add_meal(
    data: MealEntryRequest,
    user: dict = Depends(get_current_user),
):
    entry = {
        **user_filter(user),
        **data.model_dump(exclude={"recorded_at"}),
        "recorded_at": normalize_time(data.recorded_at),
        "created_at": utc_now(),
    }

    result = await meals_collection.insert_one(entry)

    # Return JSON-serializable values only.
    return {
        "id": str(result.inserted_id),
        "name": entry["name"],
        "meal_type": entry["meal_type"],
        "calories": entry["calories"],
        "protein_g": entry["protein_g"],
        "carbs_g": entry["carbs_g"],
        "fat_g": entry["fat_g"],
        "recorded_at": entry["recorded_at"].isoformat(),
    }

# async def add_meal(
#     data: MealEntryRequest,
#     user: dict = Depends(get_current_user),
# ):
#     entry = {
#         **user_filter(user),
#         **data.model_dump(exclude={"recorded_at"}),
#         "recorded_at": normalize_time(data.recorded_at),
#         "created_at": utc_now(),
#     }

#     result = await meals_collection.insert_one(entry)

#     return {
#         "id": str(result.inserted_id),
#         **{
#             key: value
#             for key, value in entry.items()
#             if key != "user_id"
#         },
#     }


@router.get("/meals")
async def get_meals(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    user: dict = Depends(get_current_user),
):
    try:
        day = (
            datetime.strptime(date, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            if date
            else utc_now().replace(
                hour=0, minute=0, second=0, microsecond=0
            )
        )
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date")

    end = day + timedelta(days=1)

    entries = await meals_collection.find(
        {
            **user_filter(user),
            "recorded_at": {"$gte": day, "$lt": end},
        }
    ).sort("recorded_at", -1).to_list(length=500)

    totals = {
        "calories": sum(item["calories"] for item in entries),
        "protein_g": sum(item["protein_g"] for item in entries),
        "carbs_g": sum(item["carbs_g"] for item in entries),
        "fat_g": sum(item["fat_g"] for item in entries),
    }

    return {
        "date": day.date().isoformat(),
        "totals": totals,
        "entries": [
            {
                "id": str(item["_id"]),
                "name": item["name"],
                "meal_type": item["meal_type"],
                "calories": item["calories"],
                "protein_g": item["protein_g"],
                "carbs_g": item["carbs_g"],
                "fat_g": item["fat_g"],
                "recorded_at": item["recorded_at"],
            }
            for item in entries
        ],
    }


@router.get("/summary")
async def nutrition_summary(
    user: dict = Depends(get_current_user),
):
    now = utc_now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    filters = {
        **user_filter(user),
        "recorded_at": {"$gte": start, "$lt": end},
    }

    water = await water_collection.find(filters).to_list(length=500)
    meals = await meals_collection.find(filters).to_list(length=500)

    water_total = sum(x["amount_ml"] for x in water)
    hydration_goal = user.get("hydration_goal_ml", 2500)

    return {
        "date": start.date().isoformat(),
        "hydration": {
            "consumed_ml": water_total,
            "goal_ml": hydration_goal,
            "percentage": round(
                min(water_total / hydration_goal * 100, 100), 1
            ),
        },
        "nutrition": {
            "calories": sum(x["calories"] for x in meals),
            "protein_g": sum(x["protein_g"] for x in meals),
            "carbs_g": sum(x["carbs_g"] for x in meals),
            "fat_g": sum(x["fat_g"] for x in meals),
            "meal_count": len(meals),
        },
    }
