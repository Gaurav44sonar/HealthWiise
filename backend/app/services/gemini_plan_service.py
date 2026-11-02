import json
import logging
import os
import re

import httpx

from app.schemas.ai_plan import PlanRequest

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash"
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

GOAL_TEXT = {
    "lose_weight": "lose weight gradually and sustainably",
    "build_muscle": "build muscle and strength",
    "stay_fit": "stay fit and keep a healthy routine",
    "improve_sleep": "improve sleep quality and recovery",
    "reduce_stress": "reduce stress and improve energy",
}
EQUIPMENT_TEXT = {"gym": "full gym access", "home_basic": "basic home equipment (dumbbells, bands)", "none": "no equipment"}


def _prompt(req: PlanRequest, data: dict) -> str:
    return f"""You are HealthWiise Coach. Create a personalised 7-day workout and meal plan.

User goal: {GOAL_TEXT[req.goal]}
Workout days per week: {req.workout_days} (the other days are rest or light activity such as walking or stretching)
Equipment: {EQUIPMENT_TEXT[req.equipment]}
Diet preference: {req.diet}
Extra notes: {req.notes or "none"}

User's real data from the last 30 days (use it to tailor the plan; never invent numbers):
{data}

Return ONLY a JSON object with exactly this shape:
{{
  "summary": "2-3 sentences explaining how the plan fits this user's data and goal",
  "days": [
    {{
      "day": "Monday",
      "workout": {{"title": "...", "duration_minutes": 40, "intensity": "light|moderate|high", "exercises": ["..."]}},
      "meals": {{"breakfast": "...", "lunch": "...", "dinner": "...", "snack": "..."}},
      "calorie_target": 2000,
      "tip": "one short sleep/hydration/recovery tip for the day"
    }}
  ]
}}
Rules: exactly 7 days, Monday to Sunday; 3-6 exercises on workout days; rest days use a light activity as the workout;
practical, affordable meals; respect the diet preference; keep calorie targets sensible and not extreme.
This is general wellness guidance, not medical advice."""


def _parse(text: str) -> dict | None:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        obj = json.loads(re.sub(r",\s*([}\]])", r"\1", text[start : end + 1]))
    except Exception:
        return None
    days = obj.get("days")
    if not isinstance(days, list) or len(days) != 7:
        return None
    try:
        for d, name in zip(days, DAYS):
            d["day"] = name
            d["workout"] = {
                "title": str(d["workout"].get("title", "Activity")),
                "duration_minutes": int(d["workout"].get("duration_minutes", 0) or 0),
                "intensity": str(d["workout"].get("intensity", "moderate")),
                "exercises": [str(x) for x in d["workout"].get("exercises", [])],
            }
            m = d.get("meals", {})
            d["meals"] = {k: str(m.get(k, "")) for k in ("breakfast", "lunch", "dinner", "snack")}
            d["calorie_target"] = int(d.get("calorie_target", 0) or 0)
            d["tip"] = str(d.get("tip", ""))
    except Exception:
        return None
    return {"summary": str(obj.get("summary", "")), "days": days}


def fallback_plan(req: PlanRequest, data: dict) -> dict:
    """Rule-based plan used when Gemini is unavailable."""
    base_kcal = {"lose_weight": 1800, "build_muscle": 2500}.get(req.goal, 2100)
    workout_slots = {1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: list(range(7))}[req.workout_days]
    strength = {
        "gym": ["Squats 3x10", "Bench press 3x10", "Rows 3x10", "Plank 3x40s"],
        "home_basic": ["Goblet squats 3x12", "Push-ups 3x10", "Dumbbell rows 3x12", "Plank 3x40s"],
        "none": ["Bodyweight squats 3x15", "Push-ups 3x10", "Lunges 3x12", "Plank 3x40s"],
    }[req.equipment]
    cardio = ["Brisk walk or jog 25 min", "Mobility and stretching 10 min"]
    meal_sets = {
        "vegan": ("Oats with fruit and seeds", "Lentil and veg bowl with rice", "Tofu stir-fry with vegetables", "Hummus and carrots"),
        "vegetarian": ("Veg omelette with toast", "Paneer or chickpea bowl with rice", "Dal, roti and sabzi", "Greek yogurt and fruit"),
    }
    default_meals = ("Oats or eggs with fruit", "Rice or roti with dal and vegetables", "Grilled protein with vegetables", "Nuts and a fruit")
    b, l, d, s = meal_sets.get(req.diet, default_meals)
    if req.diet == "high_protein":
        b, s = "Eggs or protein smoothie with toast", "Yogurt or boiled eggs"
    sleep_h = data.get("avg_sleep_hours")
    tips = [
        "Drink water through the day." if not data.get("avg_daily_water_ml") or data["avg_daily_water_ml"] < data.get("hydration_goal_ml", 2500)
        else "Keep up your good hydration.",
        f"Aim for {data.get('sleep_goal_hours', 8)}h of sleep tonight." if not sleep_h or sleep_h < data.get("sleep_goal_hours", 8)
        else "Keep your consistent bedtime.",
    ]
    days = []
    for i, name in enumerate(DAYS):
        if i in workout_slots:
            w = {"title": "Strength" if i % 2 == 0 else "Cardio and core", "duration_minutes": 40, "intensity": "moderate",
                 "exercises": strength if i % 2 == 0 else cardio + ["Plank 3x40s"]}
        else:
            w = {"title": "Rest / light walk", "duration_minutes": 20, "intensity": "light", "exercises": ["Easy walk 20 min", "Stretching 10 min"]}
        days.append({
            "day": name, "workout": w,
            "meals": {"breakfast": b, "lunch": l, "dinner": d, "snack": s},
            "calorie_target": base_kcal, "tip": tips[i % 2],
        })
    return {
        "summary": f"A balanced {req.workout_days}-day plan for your goal to {GOAL_TEXT[req.goal]}, built from standard guidelines "
                   "(the AI service was unavailable, so this is a rule-based plan).",
        "days": days,
    }


async def generate_plan(req: PlanRequest, data: dict) -> tuple[dict, bool]:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        payload = {
            "contents": [{"parts": [{"text": _prompt(req, data)}]}],
            "generationConfig": {
                "temperature": 0.5,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json",
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=40.0) as client:
                res = await client.post(url, json=payload, headers={"x-goog-api-key": api_key})
            if res.status_code == 200:
                parts = res.json()["candidates"][0]["content"]["parts"]
                plan = _parse("".join(p.get("text", "") for p in parts))
                if plan:
                    return plan, True
                logger.warning("Gemini plan response could not be parsed")
            else:
                logger.warning("Gemini plan returned %s: %s", res.status_code, res.text[:120])
        except Exception as exc:
            logger.warning("Gemini plan error: %s", exc)
    return fallback_plan(req, data), False
