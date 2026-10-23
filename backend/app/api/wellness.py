from datetime import datetime, timezone, timedelta
from typing import Any
from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.db.database import database

router = APIRouter(prefix="/wellness", tags=["Wellness Insights"])

water_collection = database["water_entries"]
meals_collection = database["meal_entries"]
sleep_collection = database["sleep_records"]
workouts_collection = database["workout_entries"]
users_collection = database["users"]


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


@router.get("/summary")
async def get_wellness_summary(
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    now = utc_now()
    today_date = now.date()
    today_str = today_date.isoformat()

    start_7d = today_date - timedelta(days=6)
    start_7d_str = start_7d.isoformat()

    today_start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end_dt = today_start_dt + timedelta(days=1)
    week_start_dt = today_start_dt - timedelta(days=6)

    # 1. Fetch Goals
    hydration_goal = user.get("hydration_goal_ml", 2500)
    sleep_goal_mins = user.get("sleep_goal_minutes", 480)
    fitness_daily_goal = user.get("fitness_daily_minutes_goal", 45)
    fitness_weekly_sess_goal = user.get("fitness_weekly_sessions_goal", 4)
    fitness_weekly_mins_goal = user.get("fitness_weekly_minutes_goal", 180)
    nutrition_calorie_goal = user.get("nutrition_calorie_goal", None)

    # 2. Fetch Today's Data
    # Water today
    today_water_entries = await water_collection.find({
        **user_filter(user),
        "recorded_at": {"$gte": today_start_dt, "$lt": today_end_dt},
    }).to_list(length=200)
    water_today_ml = sum(w.get("amount_ml", 0) for w in today_water_entries)

    # Meals today
    today_meal_entries = await meals_collection.find({
        **user_filter(user),
        "recorded_at": {"$gte": today_start_dt, "$lt": today_end_dt},
    }).to_list(length=200)
    calories_today = sum(m.get("calories", 0) for m in today_meal_entries)
    protein_today = sum(m.get("protein_g", 0) for m in today_meal_entries)
    carbs_today = sum(m.get("carbs_g", 0) for m in today_meal_entries)
    fat_today = sum(m.get("fat_g", 0) for m in today_meal_entries)

    # Workouts today
    today_workouts = await workouts_collection.find({
        **user_filter(user),
        "workout_date": today_str,
    }).to_list(length=100)
    workout_mins_today = sum(w.get("duration_minutes", 0) for w in today_workouts)
    workout_sessions_today = len(today_workouts)

    # Latest Sleep Record
    latest_sleep = await sleep_collection.find_one(
        user_filter(user),
        sort=[("sleep_date", -1), ("bedtime", -1)],
    )

    # 3. Fetch 7-Day Window for Trends & Weekly Goals
    week_water_entries = await water_collection.find({
        **user_filter(user),
        "recorded_at": {"$gte": week_start_dt, "$lt": today_end_dt},
    }).to_list(length=500)

    week_meal_entries = await meals_collection.find({
        **user_filter(user),
        "recorded_at": {"$gte": week_start_dt, "$lt": today_end_dt},
    }).to_list(length=500)

    week_sleep_records = await sleep_collection.find({
        **user_filter(user),
        "sleep_date": {"$gte": start_7d_str, "$lte": today_str},
    }).sort([("sleep_date", -1)]).to_list(length=50)

    week_workouts = await workouts_collection.find({
        **user_filter(user),
        "workout_date": {"$gte": start_7d_str, "$lte": today_str},
    }).to_list(length=200)

    # Aggregate 7-Day Matrix Day-by-Day
    daily_matrix = []
    for offset in range(6, -1, -1):
        day = today_date - timedelta(days=offset)
        day_str = day.isoformat()
        day_start = now.replace(
            year=day.year, month=day.month, day=day.day, hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)

        # Water for day
        day_water = sum(
            w.get("amount_ml", 0)
            for w in week_water_entries
            if day_start <= (w.get("recorded_at") if hasattr(w.get("recorded_at"), "tzinfo") and w.get("recorded_at").tzinfo else w.get("recorded_at", datetime.min).replace(tzinfo=timezone.utc)) < day_end
        )

        # Meals for day
        day_meals = [
            m for m in week_meal_entries
            if day_start <= (m.get("recorded_at") if hasattr(m.get("recorded_at"), "tzinfo") and m.get("recorded_at").tzinfo else m.get("recorded_at", datetime.min).replace(tzinfo=timezone.utc)) < day_end
        ]
        day_calories = sum(m.get("calories", 0) for m in day_meals)

        # Sleep for day
        day_sleep = next((s for s in week_sleep_records if s.get("sleep_date") == day_str), None)
        day_sleep_duration = (
            round(day_sleep.get("sleep_duration_minutes", 0) / 60, 1) if day_sleep else None
        )
        day_sleep_efficiency = day_sleep.get("sleep_efficiency") if day_sleep else None

        # Workouts for day
        day_wos = [w for w in week_workouts if w.get("workout_date") == day_str]
        day_wo_mins = sum(w.get("duration_minutes", 0) for w in day_wos)

        daily_matrix.append({
            "date": day_str,
            "day_name": day.strftime("%a"),
            "water_ml": day_water,
            "water_goal_reached": day_water >= hydration_goal,
            "calories": day_calories,
            "meal_count": len(day_meals),
            "sleep_hours": day_sleep_duration,
            "sleep_efficiency": day_sleep_efficiency,
            "workout_minutes": day_wo_mins,
            "workout_sessions": len(day_wos),
            "workout_goal_reached": day_wo_mins >= fitness_daily_goal,
        })

    # Weekly Totals
    total_week_workout_mins = sum(w.get("duration_minutes", 0) for w in week_workouts)
    total_week_workout_sessions = len(week_workouts)
    total_week_water = sum(d["water_ml"] for d in daily_matrix)
    days_with_water_goal = sum(1 for d in daily_matrix if d["water_goal_reached"])

    recorded_sleep_durations = [d["sleep_hours"] for d in daily_matrix if d["sleep_hours"] is not None]
    avg_sleep_hours = (
        round(sum(recorded_sleep_durations) / len(recorded_sleep_durations), 1)
        if recorded_sleep_durations
        else None
    )

    # 4. Goal Completion Calculations
    # A. Hydration
    hydration_pct = round(min((water_today_ml / hydration_goal) * 100, 100), 1) if hydration_goal > 0 else 0.0
    hydration_remaining = max(hydration_goal - water_today_ml, 0)

    # B. Sleep Goal
    latest_sleep_mins = latest_sleep.get("sleep_duration_minutes", 0) if latest_sleep else 0
    sleep_pct = round(min((latest_sleep_mins / sleep_goal_mins) * 100, 100), 1) if sleep_goal_mins > 0 else 0.0
    sleep_remaining = max(sleep_goal_mins - latest_sleep_mins, 0)

    # C. Daily Activity Goal
    fitness_daily_pct = round(min((workout_mins_today / fitness_daily_goal) * 100, 100), 1) if fitness_daily_goal > 0 else 0.0
    fitness_daily_remaining = max(fitness_daily_goal - workout_mins_today, 0)

    # D. Weekly Workout Sessions Goal
    fitness_weekly_sess_pct = round(min((total_week_workout_sessions / fitness_weekly_sess_goal) * 100, 100), 1) if fitness_weekly_sess_goal > 0 else 0.0
    fitness_weekly_sess_remaining = max(fitness_weekly_sess_goal - total_week_workout_sessions, 0)

    # E. Weekly Active Minutes Goal
    fitness_weekly_mins_pct = round(min((total_week_workout_mins / fitness_weekly_mins_goal) * 100, 100), 1) if fitness_weekly_mins_goal > 0 else 0.0
    fitness_weekly_mins_remaining = max(fitness_weekly_mins_goal - total_week_workout_mins, 0)

    goals_overview = [
        {
            "id": "hydration_daily",
            "category": "hydration",
            "title": "Daily Hydration",
            "type": "daily",
            "current_value": water_today_ml,
            "target_value": hydration_goal,
            "unit": "ml",
            "percentage": hydration_pct,
            "remaining": hydration_remaining,
            "is_completed": water_today_ml >= hydration_goal,
        },
        {
            "id": "sleep_duration",
            "category": "sleep",
            "title": "Sleep Duration",
            "type": "latest",
            "current_value": round(latest_sleep_mins / 60, 1),
            "target_value": round(sleep_goal_mins / 60, 1),
            "unit": "hrs",
            "percentage": sleep_pct,
            "remaining": round(sleep_remaining / 60, 1),
            "is_completed": latest_sleep_mins >= sleep_goal_mins,
            "has_data": latest_sleep is not None,
        },
        {
            "id": "fitness_daily",
            "category": "fitness",
            "title": "Daily Movement",
            "type": "daily",
            "current_value": workout_mins_today,
            "target_value": fitness_daily_goal,
            "unit": "mins",
            "percentage": fitness_daily_pct,
            "remaining": fitness_daily_remaining,
            "is_completed": workout_mins_today >= fitness_daily_goal,
        },
        {
            "id": "fitness_weekly_sessions",
            "category": "fitness",
            "title": "Weekly Sessions",
            "type": "weekly",
            "current_value": total_week_workout_sessions,
            "target_value": fitness_weekly_sess_goal,
            "unit": "sessions",
            "percentage": fitness_weekly_sess_pct,
            "remaining": fitness_weekly_sess_remaining,
            "is_completed": total_week_workout_sessions >= fitness_weekly_sess_goal,
        },
        {
            "id": "fitness_weekly_minutes",
            "category": "fitness",
            "title": "Weekly Active Duration",
            "type": "weekly",
            "current_value": total_week_workout_mins,
            "target_value": fitness_weekly_mins_goal,
            "unit": "mins",
            "percentage": fitness_weekly_mins_pct,
            "remaining": fitness_weekly_mins_remaining,
            "is_completed": total_week_workout_mins >= fitness_weekly_mins_goal,
        },
    ]

    # 5. Wellness Habit Progress Score
    # Transparently averaged across active measurable goals that have recorded targets
    score_components = [
        {"name": "Hydration", "pct": hydration_pct, "weight": 1},
        {"name": "Daily Movement", "pct": fitness_daily_pct, "weight": 1},
        {"name": "Weekly Workout Frequency", "pct": fitness_weekly_sess_pct, "weight": 1},
    ]
    if latest_sleep:
        score_components.append({"name": "Sleep Duration", "pct": sleep_pct, "weight": 1})

    habit_score = round(sum(c["pct"] for c in score_components) / len(score_components))

    # 6. Cross-Service Verified Insights
    insights = []

    # Hydration Insight
    if days_with_water_goal >= 4:
        insights.append({
            "category": "hydration",
            "title": "Strong Hydration Consistency",
            "description": f"You reached your hydration goal on {days_with_water_goal} of the last 7 recorded days.",
        })
    elif water_today_ml >= hydration_goal:
        insights.append({
            "category": "hydration",
            "title": "Hydration Target Reached",
            "description": f"You've consumed {water_today_ml:,} ml of water today, fulfilling your daily requirement.",
        })

    # Fitness Insight
    if total_week_workout_sessions >= fitness_weekly_sess_goal:
        insights.append({
            "category": "fitness",
            "title": "Weekly Workout Frequency Achieved",
            "description": f"You completed {total_week_workout_sessions} of your {fitness_weekly_sess_goal} target sessions this week.",
        })
    elif total_week_workout_mins > 0:
        insights.append({
            "category": "fitness",
            "title": "Weekly Activity Accumulation",
            "description": f"You've logged {total_week_workout_mins} active minutes across {total_week_workout_sessions} sessions over the past 7 days.",
        })

    # Sleep & Recovery Insight
    if avg_sleep_hours and avg_sleep_hours >= (sleep_goal_mins / 60):
        insights.append({
            "category": "sleep",
            "title": "Restorative Sleep Baseline",
            "description": f"Your recorded sleep averaged {avg_sleep_hours} hours per night over the past week, meeting your rest goal.",
        })
    elif latest_sleep and latest_sleep.get("sleep_efficiency", 0) >= 90:
        insights.append({
            "category": "sleep",
            "title": "High Sleep Efficiency",
            "description": f"Your most recent sleep session achieved {latest_sleep['sleep_efficiency']}% efficiency with minimal awake time.",
        })

    # Nutrition Insight
    if len(today_meal_entries) > 0:
        insights.append({
            "category": "nutrition",
            "title": "Nutrition Logged Today",
            "description": f"You recorded {len(today_meal_entries)} meals totaling {calories_today:,.0f} calories and {protein_today:.1f}g protein today.",
        })

    if not insights:
        insights.append({
            "category": "general",
            "title": "Start Recording Wellness Data",
            "description": "Log your meals, water intake, sleep, or workouts to unlock comprehensive weekly trends and habit insights.",
        })

    return {
        "date": today_str,
        "habit_score": {
            "score": habit_score,
            "components": score_components,
            "calculation_note": "Averaged across your configured measurable daily & weekly goals (Hydration, Daily Movement, Weekly Sessions, and Sleep Duration).",
        },
        "daily_overview": {
            "nutrition": {
                "calories": round(calories_today, 1),
                "protein_g": round(protein_today, 1),
                "carbs_g": round(carbs_today, 1),
                "fat_g": round(fat_today, 1),
                "meal_count": len(today_meal_entries),
                "calorie_goal": nutrition_calorie_goal,
            },
            "hydration": {
                "consumed_ml": water_today_ml,
                "goal_ml": hydration_goal,
                "percentage": hydration_pct,
                "remaining_ml": hydration_remaining,
                "is_completed": water_today_ml >= hydration_goal,
            },
            "sleep": {
                "has_record": latest_sleep is not None,
                "latest_date": latest_sleep.get("sleep_date") if latest_sleep else None,
                "duration_minutes": latest_sleep_mins,
                "duration_hours": round(latest_sleep_mins / 60, 1),
                "goal_minutes": sleep_goal_mins,
                "goal_hours": round(sleep_goal_mins / 60, 1),
                "percentage": sleep_pct,
                "quality": latest_sleep.get("quality") if latest_sleep else None,
                "efficiency": latest_sleep.get("sleep_efficiency") if latest_sleep else None,
            },
            "fitness": {
                "total_minutes_today": workout_mins_today,
                "session_count_today": workout_sessions_today,
                "daily_goal_minutes": fitness_daily_goal,
                "daily_percentage": fitness_daily_pct,
                "weekly_sessions_count": total_week_workout_sessions,
                "weekly_sessions_goal": fitness_weekly_sess_goal,
            },
        },
        "goals_overview": goals_overview,
        "weekly_matrix": daily_matrix,
        "insights": insights,
    }
