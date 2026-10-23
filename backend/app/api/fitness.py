from datetime import datetime, timezone, timedelta
from typing import Literal
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import get_current_user
from app.db.database import database
from app.schemas.fitness import WorkoutCreate, WorkoutUpdate, FitnessGoalsUpdate

router = APIRouter(prefix="/fitness", tags=["Fitness & Activity"])

workouts_collection = database["workout_entries"]
users_collection = database["users"]

CATEGORY_LABELS = {
    "strength": "Strength Training",
    "running": "Running",
    "walking": "Walking",
    "cycling": "Cycling",
    "cardio": "Cardio",
    "yoga": "Yoga & Stretching",
    "sports": "Sports",
    "other": "Other Activity",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


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


def serialize_workout(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "name": item.get("name"),
        "category": item.get("category"),
        "category_label": CATEGORY_LABELS.get(item.get("category"), "Activity"),
        "workout_date": item.get("workout_date"),
        "start_time": item.get("start_time"),
        "duration_minutes": item.get("duration_minutes", 0),
        "intensity": item.get("intensity"),
        "notes": item.get("notes"),
        "created_at": format_dt(item.get("created_at")),
        "updated_at": format_dt(item.get("updated_at")),
    }


def generate_insights(
    workouts_this_week: list[dict],
    today_workouts: list[dict],
    goals: dict,
    most_recent_workout: dict | None,
) -> list[dict]:
    insights = []

    total_weekly_mins = sum(w.get("duration_minutes", 0) for w in workouts_this_week)
    total_weekly_sessions = len(workouts_this_week)

    # 1. Weekly activity volume
    if total_weekly_sessions > 0:
        insights.append({
            "type": "summary",
            "title": "Weekly Activity Volume",
            "description": f"You logged {total_weekly_mins} minutes of physical activity across {total_weekly_sessions} {'session' if total_weekly_sessions == 1 else 'sessions'} over the past 7 days.",
        })
    else:
        insights.append({
            "type": "opportunity",
            "title": "Start Moving",
            "description": "No workouts recorded in the past 7 days. Even a brisk 15-minute walk boosts energy and recovery.",
        })

    # 2. Most frequent activity category
    if workouts_this_week:
        category_counts: dict[str, int] = {}
        for w in workouts_this_week:
            cat = w.get("category", "other")
            category_counts[cat] = category_counts.get(cat, 0) + 1

        top_cat = max(category_counts, key=category_counts.get)
        top_cat_label = CATEGORY_LABELS.get(top_cat, top_cat.capitalize())
        top_cat_count = category_counts[top_cat]

        insights.append({
            "type": "focus",
            "title": "Primary Activity Focus",
            "description": f"{top_cat_label} was your most frequent workout type this week with {top_cat_count} {'session' if top_cat_count == 1 else 'sessions'}.",
        })

    # 3. Weekly session goal progress
    sessions_goal = goals["weekly_sessions_goal"]
    if total_weekly_sessions >= sessions_goal:
        insights.append({
            "type": "achievement",
            "title": "Weekly Target Reached",
            "description": f"Goal achieved! You completed {total_weekly_sessions} of your {sessions_goal} planned sessions this week.",
        })
    elif total_weekly_sessions > 0:
        remaining_sessions = sessions_goal - total_weekly_sessions
        insights.append({
            "type": "progress",
            "title": "Session Consistency",
            "description": f"You have completed {total_weekly_sessions} of your {sessions_goal} weekly sessions — {remaining_sessions} more to reach your goal.",
        })

    # 4. Recent activity timing
    if most_recent_workout:
        today_date = utc_now().date()
        try:
            recent_date = datetime.strptime(most_recent_workout["workout_date"], "%Y-%m-%d").date()
            days_ago = (today_date - recent_date).days
            if days_ago == 0:
                today_mins = sum(w.get("duration_minutes", 0) for w in today_workouts)
                insights.append({
                    "type": "today",
                    "title": "Active Today",
                    "description": f"Great job moving today! You've logged {today_mins} active minutes so far.",
                })
            elif days_ago > 3:
                insights.append({
                    "type": "reminder",
                    "title": "Gentle Movement Check-in",
                    "description": f"Your last recorded workout was {days_ago} days ago. Consider taking time for moderate movement today.",
                })
        except ValueError:
            pass

    return insights


@router.post("/workouts", status_code=status.HTTP_201_CREATED)
async def create_workout(
    data: WorkoutCreate,
    user: dict = Depends(get_current_user),
):
    workout = {
        **user_filter(user),
        "name": data.name.strip(),
        "category": data.category,
        "workout_date": data.workout_date,
        "start_time": data.start_time,
        "duration_minutes": data.duration_minutes,
        "intensity": data.intensity,
        "notes": data.notes.strip() if data.notes else None,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }

    result = await workouts_collection.insert_one(workout)
    workout["_id"] = result.inserted_id

    return serialize_workout(workout)


@router.get("/workouts")
async def get_workouts(
    category: str | None = None,
    start_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    limit: int = Query(default=50, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    query = user_filter(user)

    if category and category in CATEGORY_LABELS:
        query["category"] = category

    date_filters = {}
    if start_date:
        date_filters["$gte"] = start_date
    if end_date:
        date_filters["$lte"] = end_date

    if date_filters:
        query["workout_date"] = date_filters

    cursor = workouts_collection.find(query).sort([
        ("workout_date", -1),
        ("created_at", -1),
    ]).limit(limit)

    results = await cursor.to_list(length=limit)
    return [serialize_workout(w) for w in results]


@router.get("/workouts/{workout_id}")
async def get_workout_by_id(
    workout_id: str,
    user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workout ID format.",
        )

    workout = await workouts_collection.find_one({
        "_id": ObjectId(workout_id),
        **user_filter(user),
    })

    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout record not found.",
        )

    return serialize_workout(workout)


@router.put("/workouts/{workout_id}")
async def update_workout(
    workout_id: str,
    data: WorkoutUpdate,
    user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workout ID format.",
        )

    existing = await workouts_collection.find_one({
        "_id": ObjectId(workout_id),
        **user_filter(user),
    })

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout record not found.",
        )

    update_fields: dict = {"updated_at": utc_now()}

    if data.name is not None:
        update_fields["name"] = data.name.strip()
    if data.category is not None:
        update_fields["category"] = data.category
    if data.workout_date is not None:
        update_fields["workout_date"] = data.workout_date
    if data.start_time is not None:
        update_fields["start_time"] = data.start_time
    if data.duration_minutes is not None:
        update_fields["duration_minutes"] = data.duration_minutes
    if data.intensity is not None:
        update_fields["intensity"] = data.intensity
    if data.notes is not None:
        update_fields["notes"] = data.notes.strip() if data.notes else None

    await workouts_collection.update_one(
        {"_id": ObjectId(workout_id)},
        {"$set": update_fields},
    )

    updated = await workouts_collection.find_one({"_id": ObjectId(workout_id)})
    return serialize_workout(updated)


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_200_OK)
async def delete_workout(
    workout_id: str,
    user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workout ID format.",
        )

    result = await workouts_collection.delete_one({
        "_id": ObjectId(workout_id),
        **user_filter(user),
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout record not found.",
        )

    return {"message": "Workout record deleted successfully", "id": workout_id}


@router.get("/goals")
async def get_fitness_goals(
    user: dict = Depends(get_current_user),
):
    return {
        "daily_active_minutes_goal": user.get("fitness_daily_minutes_goal", 45),
        "weekly_sessions_goal": user.get("fitness_weekly_sessions_goal", 4),
        "weekly_active_minutes_goal": user.get("fitness_weekly_minutes_goal", 180),
    }


@router.patch("/goals")
async def update_fitness_goals(
    data: FitnessGoalsUpdate,
    user: dict = Depends(get_current_user),
):
    updates = {}
    if data.daily_active_minutes_goal is not None:
        updates["fitness_daily_minutes_goal"] = data.daily_active_minutes_goal
    if data.weekly_sessions_goal is not None:
        updates["fitness_weekly_sessions_goal"] = data.weekly_sessions_goal
    if data.weekly_active_minutes_goal is not None:
        updates["fitness_weekly_minutes_goal"] = data.weekly_active_minutes_goal

    if updates:
        await users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": updates},
        )

    updated_user = await users_collection.find_one({"_id": user["_id"]})
    return {
        "daily_active_minutes_goal": updated_user.get("fitness_daily_minutes_goal", 45),
        "weekly_sessions_goal": updated_user.get("fitness_weekly_sessions_goal", 4),
        "weekly_active_minutes_goal": updated_user.get("fitness_weekly_minutes_goal", 180),
    }


@router.get("/summary")
async def get_fitness_summary(
    user: dict = Depends(get_current_user),
):
    today = utc_now().date()
    today_str = today.isoformat()

    # 7-day window: [today - 6 days, today]
    start_date = today - timedelta(days=6)
    start_date_str = start_date.isoformat()

    goals = {
        "daily_active_minutes_goal": user.get("fitness_daily_minutes_goal", 45),
        "weekly_sessions_goal": user.get("fitness_weekly_sessions_goal", 4),
        "weekly_active_minutes_goal": user.get("fitness_weekly_minutes_goal", 180),
    }

    # Fetch all workouts in the last 7 days for the user
    cursor = workouts_collection.find({
        **user_filter(user),
        "workout_date": {"$gte": start_date_str, "$lte": today_str},
    }).sort([("workout_date", -1), ("created_at", -1)])
    weekly_workouts = await cursor.to_list(length=200)

    # Fetch most recent workout overall
    most_recent = await workouts_collection.find_one(
        user_filter(user),
        sort=[("workout_date", -1), ("created_at", -1)],
    )

    # Today's workouts
    today_workouts = [w for w in weekly_workouts if w.get("workout_date") == today_str]
    today_minutes = sum(w.get("duration_minutes", 0) for w in today_workouts)
    today_sessions = len(today_workouts)

    daily_goal = goals["daily_active_minutes_goal"]
    daily_remaining = max(daily_goal - today_minutes, 0)
    daily_pct = round(min((today_minutes / daily_goal) * 100, 100), 1) if daily_goal > 0 else 0.0

    today_summary = {
        "date": today_str,
        "total_minutes_today": today_minutes,
        "session_count_today": today_sessions,
        "daily_goal_minutes": daily_goal,
        "daily_progress_percentage": daily_pct,
        "daily_remaining_minutes": daily_remaining,
        "daily_goal_reached": today_minutes >= daily_goal,
        "most_recent_workout": serialize_workout(most_recent) if most_recent else None,
    }

    # Weekly statistics
    total_weekly_minutes = sum(w.get("duration_minutes", 0) for w in weekly_workouts)
    total_weekly_sessions = len(weekly_workouts)
    avg_duration = (
        round(total_weekly_minutes / total_weekly_sessions, 1)
        if total_weekly_sessions > 0
        else 0.0
    )

    weekly_sessions_goal = goals["weekly_sessions_goal"]
    weekly_sessions_pct = (
        round(min((total_weekly_sessions / weekly_sessions_goal) * 100, 100), 1)
        if weekly_sessions_goal > 0
        else 0.0
    )
    weekly_sessions_remaining = max(weekly_sessions_goal - total_weekly_sessions, 0)

    weekly_minutes_goal = goals["weekly_active_minutes_goal"]
    weekly_minutes_pct = (
        round(min((total_weekly_minutes / weekly_minutes_goal) * 100, 100), 1)
        if weekly_minutes_goal > 0
        else 0.0
    )
    weekly_minutes_remaining = max(weekly_minutes_goal - total_weekly_minutes, 0)

    # Category Breakdown
    cat_minutes: dict[str, int] = {}
    cat_sessions: dict[str, int] = {}
    for w in weekly_workouts:
        cat = w.get("category", "other")
        dur = w.get("duration_minutes", 0)
        cat_minutes[cat] = cat_minutes.get(cat, 0) + dur
        cat_sessions[cat] = cat_sessions.get(cat, 0) + 1

    category_breakdown = [
        {
            "category": cat,
            "label": CATEGORY_LABELS.get(cat, cat.capitalize()),
            "total_minutes": mins,
            "session_count": cat_sessions[cat],
            "percentage": round((mins / total_weekly_minutes) * 100, 1) if total_weekly_minutes > 0 else 0.0,
        }
        for cat, mins in sorted(cat_minutes.items(), key=lambda x: x[1], reverse=True)
    ]

    # Daily 7-day breakdown for chart
    daily_history = []
    for day_offset in range(6, -1, -1):
        d = today - timedelta(days=day_offset)
        d_str = d.isoformat()
        day_workouts = [w for w in weekly_workouts if w.get("workout_date") == d_str]
        d_mins = sum(w.get("duration_minutes", 0) for w in day_workouts)
        daily_history.append({
            "date": d_str,
            "day_name": d.strftime("%a"),
            "minutes": d_mins,
            "session_count": len(day_workouts),
            "goal_reached": d_mins >= daily_goal,
        })

    weekly_analytics = {
        "start_date": start_date_str,
        "end_date": today_str,
        "total_minutes": total_weekly_minutes,
        "total_hours": round(total_weekly_minutes / 60, 1),
        "session_count": total_weekly_sessions,
        "avg_duration_minutes": avg_duration,
        "sessions_goal": weekly_sessions_goal,
        "sessions_progress_percentage": weekly_sessions_pct,
        "sessions_remaining": weekly_sessions_remaining,
        "sessions_goal_reached": total_weekly_sessions >= weekly_sessions_goal,
        "minutes_goal": weekly_minutes_goal,
        "minutes_progress_percentage": weekly_minutes_pct,
        "minutes_remaining": weekly_minutes_remaining,
        "minutes_goal_reached": total_weekly_minutes >= weekly_minutes_goal,
        "category_breakdown": category_breakdown,
        "daily_breakdown": daily_history,
    }

    insights = generate_insights(weekly_workouts, today_workouts, goals, most_recent)

    return {
        "goals": goals,
        "today": today_summary,
        "weekly": weekly_analytics,
        "insights": insights,
    }
