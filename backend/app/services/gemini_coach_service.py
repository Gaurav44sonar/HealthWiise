import logging
import os
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = """You are HealthWiise Coach, a friendly, concise wellness coach inside a health app.
Answer using the user's own data below when relevant, citing real numbers.
Rules:
- Keep answers short (under 150 words), warm and practical; use short bullet points when helpful.
- Only use the data provided. If data is missing, say so and suggest logging it. Never invent numbers.
- You give general wellness guidance, not medical advice. For symptoms, pain, medical conditions
  or eating disorders, recommend seeing a qualified professional.
- Stay on health, fitness, nutrition, sleep, hydration and wellbeing topics."""


async def collect_user_data(database, user: dict, days: int = 30) -> dict:
    """Summarize the last `days` days of sleep, water, workouts and meals for one user."""
    uid = str(user["_id"])
    since_dt = datetime.now(timezone.utc) - timedelta(days=days)
    since_day = since_dt.strftime("%Y-%m-%d")

    sleep = await database["sleep_records"].find(
        {"user_id": uid, "sleep_date": {"$gte": since_day}}
    ).sort("sleep_date", -1).to_list(length=60)
    workouts = await database["workout_entries"].find(
        {"user_id": uid, "workout_date": {"$gte": since_day}}
    ).sort("workout_date", -1).to_list(length=100)
    water = await database["water_entries"].find(
        {"user_id": uid, "recorded_at": {"$gte": since_dt}}
    ).to_list(length=1000)
    meals = await database["meal_entries"].find(
        {"user_id": uid, "recorded_at": {"$gte": since_dt}}
    ).to_list(length=500)

    def day_of(entry):
        v = entry.get("recorded_at")
        return v.strftime("%Y-%m-%d") if hasattr(v, "strftime") else str(v)[:10]

    water_by_day: dict[str, int] = {}
    for w in water:
        d = day_of(w)
        water_by_day[d] = water_by_day.get(d, 0) + int(w.get("amount_ml", 0))

    meals_by_day: dict[str, dict] = {}
    for m in meals:
        d = meals_by_day.setdefault(day_of(m), {"calories": 0.0, "protein_g": 0.0})
        d["calories"] += float(m.get("calories", 0))
        d["protein_g"] += float(m.get("protein_g", 0))

    sleep_hours = [round(r.get("sleep_duration_minutes", 0) / 60, 1) for r in sleep]
    return {
        "name": user.get("name"),
        "sleep_goal_hours": round(user.get("sleep_goal_minutes", 480) / 60, 1),
        "hydration_goal_ml": user.get("hydration_goal_ml", 2500),
        "sleep_nights": len(sleep),
        "avg_sleep_hours": round(sum(sleep_hours) / len(sleep_hours), 1) if sleep_hours else None,
        "recent_sleep": [
            {"date": r.get("sleep_date"), "hours": h, "quality": r.get("quality")}
            for r, h in zip(sleep[:7], sleep_hours[:7])
        ],
        "workouts_count": len(workouts),
        "recent_workouts": [
            {
                "date": w.get("workout_date"),
                "name": w.get("name"),
                "minutes": w.get("duration_minutes"),
                "intensity": w.get("intensity"),
            }
            for w in workouts[:8]
        ],
        "water_days_logged": len(water_by_day),
        "avg_daily_water_ml": round(sum(water_by_day.values()) / len(water_by_day)) if water_by_day else None,
        "meal_days_logged": len(meals_by_day),
        "avg_daily_calories": round(sum(d["calories"] for d in meals_by_day.values()) / len(meals_by_day))
        if meals_by_day
        else None,
        "avg_daily_protein_g": round(sum(d["protein_g"] for d in meals_by_day.values()) / len(meals_by_day))
        if meals_by_day
        else None,
    }


def fallback_reply(data: dict) -> str:
    parts = ["I can't reach the AI service right now, but here is a snapshot of your last 30 days:"]
    if data["avg_sleep_hours"] is not None:
        parts.append(f"- Sleep: {data['avg_sleep_hours']}h average over {data['sleep_nights']} nights (goal {data['sleep_goal_hours']}h)")
    if data["avg_daily_water_ml"] is not None:
        parts.append(f"- Water: {data['avg_daily_water_ml']} ml/day (goal {data['hydration_goal_ml']} ml)")
    if data["workouts_count"]:
        parts.append(f"- Workouts: {data['workouts_count']} logged")
    if data["avg_daily_calories"] is not None:
        parts.append(f"- Nutrition: about {data['avg_daily_calories']} kcal/day")
    if len(parts) == 1:
        parts.append("- No data logged yet. Start by logging sleep, water, meals or a workout.")
    return "\n".join(parts)


async def chat_with_coach(data: dict, message: str, history: list[dict]) -> tuple[str, bool]:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return fallback_reply(data), False

    contents = [
        {"role": "user" if h["role"] == "user" else "model", "parts": [{"text": h["content"]}]}
        for h in history[-10:]
    ]
    contents.append({"role": "user", "parts": [{"text": message}]})
    payload = {
        "systemInstruction": {"parts": [{"text": f"{SYSTEM_PROMPT}\n\nUSER DATA (last 30 days):\n{data}"}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 1024,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload, headers={"x-goog-api-key": api_key})
        if res.status_code != 200:
            logger.warning("Gemini coach returned %s: %s", res.status_code, res.text[:120])
            return fallback_reply(data), False
        parts = res.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
        if text:
            return text, True
    except Exception as exc:
        logger.warning("Gemini coach error: %s", exc)
    return fallback_reply(data), False
