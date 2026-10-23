from datetime import datetime, timezone, timedelta
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import get_current_user
from app.db.database import database
from app.schemas.sleep import SleepRecordCreate, SleepGoalRequest

router = APIRouter(prefix="/sleep", tags=["Sleep & Recovery"])

sleep_collection = database["sleep_records"]
users_collection = database["users"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_time(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def user_filter(user: dict) -> dict:
    return {"user_id": str(user["_id"])}


def format_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)


def serialize_record(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "sleep_date": item.get("sleep_date"),
        "bedtime": format_dt(item.get("bedtime")),
        "wake_time": format_dt(item.get("wake_time")),
        "time_in_bed_minutes": item.get("time_in_bed_minutes", 0),
        "awake_minutes": item.get("awake_minutes", 0),
        "sleep_duration_minutes": item.get("sleep_duration_minutes", 0),
        "sleep_efficiency": item.get("sleep_efficiency", 0.0),
        "quality": item.get("quality"),
        "restedness": item.get("restedness"),
        "notes": item.get("notes"),
        "created_at": format_dt(item.get("created_at")),
    }


def generate_insights(records: list[dict], goal_minutes: int, dashboard_type: str | None) -> list[dict]:
    insights = []

    if not records:
        return [
            {
                "type": "welcome",
                "title": "Start Tracking Your Rest",
                "description": "Log last night's bedtime and wake time to unlock personalized sleep metrics, recovery scores, and restorative insights.",
            }
        ]

    # Calculate metrics
    durations = [r["sleep_duration_minutes"] for r in records]
    avg_duration = sum(durations) / len(durations)
    avg_efficiency = sum(r["sleep_efficiency"] for r in records) / len(records)
    nights_meeting_goal = sum(1 for d in durations if d >= goal_minutes)

    # 1. Goal insight
    if nights_meeting_goal == len(records):
        insights.append({
            "type": "achievement",
            "title": "Goal Champion",
            "description": f"Outstanding! You met or exceeded your {goal_minutes // 60}h goal on all {len(records)} recent nights.",
        })
    elif nights_meeting_goal > 0:
        insights.append({
            "type": "progress",
            "title": "Goal Adherence",
            "description": f"You hit your sleep target on {nights_meeting_goal} of the last {len(records)} logged nights.",
        })
    else:
        diff_mins = int(goal_minutes - avg_duration)
        insights.append({
            "type": "opportunity",
            "title": "Sleep Debt Alert",
            "description": f"You are averaging {diff_mins} minutes below your target. Try moving bedtime 30 minutes earlier.",
        })

    # 2. Efficiency insight
    if avg_efficiency >= 90:
        insights.append({
            "type": "quality",
            "title": "High Sleep Efficiency",
            "description": f"Your average sleep efficiency is {round(avg_efficiency, 1)}%, indicating deep, restorative sleep with low restlessness.",
        })
    elif avg_efficiency < 80:
        insights.append({
            "type": "tip",
            "title": "Reduce Night Wakefulness",
            "description": f"Your average efficiency is {round(avg_efficiency, 1)}%. Limiting caffeine and heavy meals 3 hours before bed can help maintain uninterrupted sleep.",
        })

    # 3. Personalized Theme insight
    if dashboard_type == "womens":
        insights.append({
            "type": "wellness",
            "title": "Hormonal Balance & Recovery",
            "description": "Adequate slow-wave sleep regulates cortisol and reproductive hormone cycles. Prioritize dim, calming environments in the evening.",
        })
    else:
        insights.append({
            "type": "wellness",
            "title": "Strength & Metabolic Recovery",
            "description": "Deep sleep releases over 70% of daily human growth hormone, essential for muscular repair and cellular regeneration.",
        })

    return insights


@router.post("/records", status_code=status.HTTP_201_CREATED)
async def create_sleep_record(
    data: SleepRecordCreate,
    user: dict = Depends(get_current_user),
):
    bedtime = normalize_time(data.bedtime)
    wake_time = normalize_time(data.wake_time)

    if wake_time <= bedtime:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Wake time must be later than bedtime.",
        )

    time_in_bed_seconds = (wake_time - bedtime).total_seconds()
    time_in_bed_minutes = int(time_in_bed_seconds // 60)

    if time_in_bed_minutes < 30:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sleep session must be at least 30 minutes.",
        )

    if time_in_bed_minutes > 1440:  # 24 hours
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sleep session cannot exceed 24 hours.",
        )

    if data.awake_minutes >= time_in_bed_minutes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Time spent awake must be less than total time in bed.",
        )

    sleep_duration_minutes = time_in_bed_minutes - data.awake_minutes
    sleep_efficiency = round((sleep_duration_minutes / time_in_bed_minutes) * 100, 1)

    record = {
        **user_filter(user),
        "sleep_date": data.sleep_date,
        "bedtime": bedtime,
        "wake_time": wake_time,
        "time_in_bed_minutes": time_in_bed_minutes,
        "awake_minutes": data.awake_minutes,
        "sleep_duration_minutes": sleep_duration_minutes,
        "sleep_efficiency": sleep_efficiency,
        "quality": data.quality,
        "restedness": data.restedness,
        "notes": data.notes.strip() if data.notes else None,
        "created_at": utc_now(),
    }

    result = await sleep_collection.insert_one(record)
    record["_id"] = result.inserted_id

    return serialize_record(record)


@router.get("/records")
async def get_sleep_records(
    limit: int = Query(default=30, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    cursor = sleep_collection.find(user_filter(user)).sort([
        ("sleep_date", -1),
        ("bedtime", -1),
    ]).limit(limit)

    records = await cursor.to_list(length=limit)
    return [serialize_record(r) for r in records]


@router.delete("/records/{record_id}", status_code=status.HTTP_200_OK)
async def delete_sleep_record(
    record_id: str,
    user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(record_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sleep record ID.",
        )

    result = await sleep_collection.delete_one({
        "_id": ObjectId(record_id),
        **user_filter(user),
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sleep record not found.",
        )

    return {"message": "Sleep record deleted successfully", "id": record_id}


@router.patch("/goal")
async def update_sleep_goal(
    data: SleepGoalRequest,
    user: dict = Depends(get_current_user),
):
    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"sleep_goal_minutes": data.goal_minutes}},
    )

    return {"sleep_goal_minutes": data.goal_minutes}


@router.get("/summary")
async def get_sleep_summary(
    user: dict = Depends(get_current_user),
):
    goal_minutes = user.get("sleep_goal_minutes", 480)  # default 8 hours

    # Get the last 14 days of records for analytics and trend
    cursor = sleep_collection.find(user_filter(user)).sort([
        ("sleep_date", -1),
        ("bedtime", -1),
    ]).limit(14)
    records = await cursor.to_list(length=14)

    latest_record = serialize_record(records[0]) if records else None

    # Filter last 7 records for weekly calculations
    weekly_records = records[:7]
    serialized_weekly = [serialize_record(r) for r in weekly_records]

    if weekly_records:
        durations = [r["sleep_duration_minutes"] for r in weekly_records]
        avg_duration = round(sum(durations) / len(durations))
        efficiencies = [r["sleep_efficiency"] for r in weekly_records]
        avg_efficiency = round(sum(efficiencies) / len(efficiencies), 1)

        qualities = [r["quality"] for r in weekly_records if r.get("quality") is not None]
        avg_quality = round(sum(qualities) / len(qualities), 1) if qualities else None

        restedness_vals = [r["restedness"] for r in weekly_records if r.get("restedness") is not None]
        avg_restedness = round(sum(restedness_vals) / len(restedness_vals), 1) if restedness_vals else None

        weekly_analytics = {
            "total_logged_nights": len(weekly_records),
            "avg_sleep_duration_minutes": avg_duration,
            "avg_sleep_duration_hours": round(avg_duration / 60, 1),
            "avg_sleep_efficiency": avg_efficiency,
            "avg_quality": avg_quality,
            "avg_restedness": avg_restedness,
            "goal_achievement_rate": round(
                (sum(1 for d in durations if d >= goal_minutes) / len(durations)) * 100, 1
            ),
        }
    else:
        weekly_analytics = {
            "total_logged_nights": 0,
            "avg_sleep_duration_minutes": 0,
            "avg_sleep_duration_hours": 0.0,
            "avg_sleep_efficiency": 0.0,
            "avg_quality": None,
            "avg_restedness": None,
            "goal_achievement_rate": 0.0,
        }

    insights = generate_insights(serialized_weekly, goal_minutes, user.get("dashboard_type"))

    # Progress towards goal for latest record
    latest_duration = latest_record["sleep_duration_minutes"] if latest_record else 0
    goal_progress_percent = round(min((latest_duration / goal_minutes) * 100, 100), 1) if goal_minutes > 0 else 0.0

    return {
        "goal_minutes": goal_minutes,
        "latest_record": latest_record,
        "goal_progress_percentage": goal_progress_percent,
        "weekly_analytics": weekly_analytics,
        "recent_entries": [serialize_record(r) for r in records],
        "insights": insights,
    }
