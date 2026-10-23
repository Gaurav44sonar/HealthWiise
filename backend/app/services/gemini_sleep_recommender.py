import asyncio
import json
import logging
import os
import re
from typing import Any
import urllib.error
import urllib.request

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger(__name__)

# Primary and fallback model names for Gemini Flash
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]


def clean_json_response(raw_text: str) -> list[dict]:
    """Extract and parse a JSON array from model output."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    # Find array brackets
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    parsed = json.loads(text)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict) and "recommendations" in parsed:
        return parsed["recommendations"]
    return []


def generate_dynamic_fallback_recommendations(
    user: dict,
    goal_minutes: int,
    analytics_7d: dict,
    analytics_30d: dict,
    consistency: dict,
    trend: dict,
    prediction: dict | None,
) -> list[dict]:
    """
    Generate 4 tailored, data-driven recommendations based on the ML prediction score
    and real user MongoDB records when Gemini API is unavailable or unconfigured.
    """
    goal_hrs = round(goal_minutes / 60.0, 1)
    avg_dur = analytics_7d.get("avg_sleep_duration_hours")
    eff = analytics_7d.get("avg_sleep_efficiency")
    cons_level = consistency.get("consistency_level", "Moderate")
    score = prediction.get("estimated_sleep_quality") if prediction else None
    gender = user.get("dashboard_type", "wellness")
    name = user.get("name", "Friend")

    recs = []

    # 1. Target Duration & Sleep Debt Recommendation
    if avg_dur is not None and avg_dur < (goal_hrs - 0.3):
        diff = int((goal_hrs - avg_dur) * 60)
        recs.append({
            "id": "rule_a_duration_below_goal",
            "title": f"Bridge Your {diff}-Minute Rest Deficit",
            "explanation": f"Your 7-day average duration is {avg_dur}h, which is {diff} minutes short of your {goal_hrs}h target.",
            "triggered_by": f"ML model and MongoDB records observe a daily deficit of {diff} mins vs {goal_hrs}h goal.",
            "action": "Move your bedtime 20–30 minutes earlier and initiate digital wind-down at 10:00 PM.",
            "category": "duration",
            "data_sufficient": True,
        })
    elif avg_dur is not None:
        recs.append({
            "id": "ai_rec_duration",
            "title": f"Maintain Your {avg_dur}h Sleep Foundation",
            "explanation": f"You are consistently meeting your {goal_hrs}h sleep goal ({avg_dur}h 7-day average), which stabilizes your metabolic health.",
            "triggered_by": f"7-day recorded average ({avg_dur}h) adheres to configured goal ({goal_hrs}h).",
            "action": "Protect your morning sunlight exposure within 30 minutes of waking to anchor this sleep duration.",
            "category": "duration",
            "data_sufficient": True,
        })
    else:
        recs.append({
            "id": "rule_d_insufficient_records",
            "title": f"Aim for {goal_hrs} Hours of Restorative Rest",
            "explanation": f"Your target is configured to {goal_hrs} hours. Logging daily sleep records enables the ML model to track your cumulative sleep debt.",
            "triggered_by": f"Sleep duration target set to {goal_hrs}h in your profile.",
            "action": "Log bedtime and wake times consistently for the next 3 nights to establish your baseline.",
            "category": "duration",
            "data_sufficient": False,
        })

    # 2. Schedule Consistency & Circadian Rhythm
    bt_var = consistency.get("bedtime_variance_minutes")
    if cons_level == "Irregular" or (bt_var is not None and bt_var > 45):
        recs.append({
            "id": "rule_b_irregular_schedule",
            "title": "Anchor Bedtime Within a 30-Minute Window",
            "explanation": f"Your bedtime variance of ±{bt_var or 50} minutes creates circadian social jetlag, disrupting deep sleep cycles.",
            "triggered_by": f"Bedtime standard deviation is ±{bt_var or 50} mins across recorded nights.",
            "action": "Establish a consistent 'lights out' time on both weekdays and weekends within a 30-minute buffer.",
            "category": "consistency",
            "data_sufficient": True,
        })
    else:
        recs.append({
            "id": "ai_rec_consistency",
            "title": "Optimize Circadian Melatonin Timing",
            "explanation": f"Your schedule regularity is {cons_level}. Syncing your core body temperature drop at night supports deeper slow-wave sleep.",
            "triggered_by": f"Schedule consistency is evaluated as {cons_level} from MongoDB records.",
            "action": "Keep bedroom ambient temperature at 18–20°C (65–68°F) to accelerate sleep onset.",
            "category": "consistency",
            "data_sufficient": True,
        })

    # 3. Sleep Efficiency & Restorativeness
    if eff is not None and eff < 85.0:
        recs.append({
            "id": "rule_g_restlessness",
            "title": "Reduce Nighttime Restlessness & Awakenings",
            "explanation": f"Your recorded sleep efficiency is {eff}%, indicating time spent awake in bed after initial sleep onset.",
            "triggered_by": f"Average sleep efficiency ({eff}%) is below the 85% restorative benchmark.",
            "action": "Cut caffeine 8 hours before bed and avoid heavy meals or high fluid volumes within 2 hours of sleep.",
            "category": "quality",
            "data_sufficient": True,
        })
    elif score is not None and score >= 8.0:
        recs.append({
            "id": "ai_rec_quality",
            "title": f"High Restorativeness ({score}/10 Projected Score)",
            "explanation": f"HealthWiise ML pipeline predicts high sleep quality ({score}/10) given your lifestyle biometrics.",
            "triggered_by": f"Random Forest regression model predicted {score}/10 based on your physiological profile.",
            "action": "Incorporate light evening mobility or stretching to preserve this restorative recovery state.",
            "category": "quality",
            "data_sufficient": True,
        })
    else:
        recs.append({
            "id": "ai_rec_quality",
            "title": "Elevate Sleep Restorativeness & Deep Sleep",
            "explanation": "Improving sleep architecture enhances physical recovery, mental sharpness, and daytime focus.",
            "triggered_by": "ML sleep quality model and lifestyle recovery metrics.",
            "action": "Dim indoor lighting 60 minutes before bed and replace phone scrolling with reading or guided breathing.",
            "category": "quality",
            "data_sufficient": True,
        })

    # 4. Tailored Wellness & Recovery Habit
    if gender == "womens":
        recs.append({
            "id": "ai_rec_lifestyle",
            "title": "Magnesium & Gentle Evening Decompression",
            "explanation": "Supporting nervous system down-regulation promotes restorative REM and slow-wave sleep transitions.",
            "triggered_by": "Women's wellness balance, recovery, and cycle harmony metrics.",
            "action": "Pair a cup of warm chamomile tea or magnesium glycinate with 5 minutes of relaxed diaphragmatic breathing.",
            "category": "recovery",
            "data_sufficient": True,
        })
    else:
        recs.append({
            "id": "ai_rec_lifestyle",
            "title": "Strength Recovery & Cortisol Reduction",
            "explanation": "Muscular repair, protein synthesis, and growth hormone secretion peak during the first 4 hours of deep sleep.",
            "triggered_by": "Men's wellness strength, recovery, and physical conditioning profile.",
            "action": "Ensure adequate daytime hydration and keep intense strength workouts at least 3 hours before sleep.",
            "category": "recovery",
            "data_sufficient": True,
        })

    return recs[:4]


async def generate_gemini_sleep_recommendations(
    user: dict,
    goal_minutes: int,
    analytics_7d: dict,
    analytics_30d: dict,
    consistency: dict,
    trend: dict,
    prediction: dict | None,
    recent_records: list[dict],
) -> list[dict]:
    """
    Generate exactly 4 personalized recommendations using Google Gemini Flash model,
    combining the ML prediction score with user profile and MongoDB sleep records.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    if not api_key:
        logger.info("GEMINI_API_KEY not set. Using dynamic personalized fallback recommendations.")
        return generate_dynamic_fallback_recommendations(
            user=user,
            goal_minutes=goal_minutes,
            analytics_7d=analytics_7d,
            analytics_30d=analytics_30d,
            consistency=consistency,
            trend=trend,
            prediction=prediction,
        )

    # Build prompt with all context
    user_name = user.get("name", "User")
    dashboard = user.get("dashboard_type", "wellness")
    goal_hrs = round(goal_minutes / 60.0, 1)

    ml_score_text = "Not calculated yet (user has not simulated biometrics)"
    if prediction:
        ml_score_text = (
            f"Score: {prediction.get('estimated_sleep_quality')}/10.0 "
            f"({prediction.get('rating_category', 'Standard')}), "
            f"Feature Summary: {prediction.get('feature_impact_summary', '')}"
        )

    history_summary = {
        "logged_nights_7d": analytics_7d.get("total_logged_nights", 0),
        "avg_duration_7d_hours": analytics_7d.get("avg_sleep_duration_hours"),
        "goal_achievement_rate_7d": analytics_7d.get("goal_completion_rate"),
        "avg_efficiency_7d": analytics_7d.get("avg_sleep_efficiency"),
        "schedule_consistency": consistency.get("consistency_level"),
        "bedtime_variance_minutes": consistency.get("bedtime_variance_minutes"),
        "duration_trend": trend.get("direction"),
        "logged_nights_30d": analytics_30d.get("total_logged_nights", 0),
        "avg_duration_30d_hours": analytics_30d.get("avg_sleep_duration_hours"),
    }

    recent_sample = []
    for r in recent_records[:5]:
        recent_sample.append({
            "date": r.get("sleep_date"),
            "duration_hours": round(r.get("sleep_duration_minutes", 0) / 60.0, 1),
            "efficiency": r.get("sleep_efficiency"),
            "quality": r.get("quality"),
            "restedness": r.get("restedness"),
        })

    prompt = f"""You are HealthWiise's Senior AI Sleep & Circadian Medicine Specialist.
Generate exactly 4 personalized, highly practical, non-generic sleep recommendations for the user based on their ML model prediction and MongoDB sleep tracking history.

### User Profile:
- Name: {user_name}
- Wellness Track: {dashboard}
- Sleep Goal: {goal_hrs} hours per night ({goal_minutes} mins)

### Machine Learning Model Predicted Sleep Quality:
{ml_score_text}

### User's Real MongoDB Sleep History:
{json.dumps(history_summary, indent=2)}

### Recent Logged Sleep Nights:
{json.dumps(recent_sample, indent=2)}

### Requirements:
1. Provide EXACTLY 4 recommendations.
2. Directly reference the user's ML predicted score, their goal ({goal_hrs}h), and their actual recorded numbers (efficiency, duration, or bedtime consistency).
3. Structure each recommendation with:
   - "id": a unique string (e.g. "ai_rec_1", "ai_rec_2", etc.)
   - "title": a concise, engaging title (under 8 words)
   - "explanation": a clear explanation of WHY this is recommended, citing their data
   - "triggered_by": the specific data point or ML result that triggered this
   - "action": a specific, actionable step the user can take today
   - "category": one of ["duration", "consistency", "quality", "recovery", "habits"]
   - "data_sufficient": boolean indicating whether historical data supports it
4. Return ONLY a valid JSON array of 4 objects. No markdown formatting around it, or valid ```json codeblock.
"""

    # Try Gemini models in order of priority (starting with 2.5 flash as requested)
    for model in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.4,
                "topP": 0.8,
                "maxOutputTokens": 1024,
            },
        }

        try:
            data = None
            if httpx is not None:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    res = await client.post(url, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                    else:
                        logger.warning(f"Gemini API model {model} returned status {res.status_code}: {res.text[:120]}")
            else:
                def _urllib_post():
                    req_data = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        url,
                        data=req_data,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=12) as response:
                        return json.loads(response.read().decode("utf-8"))

                data = await asyncio.to_thread(_urllib_post)

            if data:
                candidates = data.get("candidates", [])
                if candidates:
                    content_parts = candidates[0].get("content", {}).get("parts", [])
                    if content_parts:
                        raw_text = content_parts[0].get("text", "")
                        recs = clean_json_response(raw_text)
                        if len(recs) == 4:
                            logger.info(f"Successfully generated 4 recommendations using {model}")
                            return recs
                        elif len(recs) > 0:
                            return recs[:4]
        except Exception as e:
            logger.warning(f"Error calling Gemini model {model}: {e}")

    logger.info("Falling back to tailored recommendations based on ML score and MongoDB records.")
    return generate_dynamic_fallback_recommendations(
        user=user,
        goal_minutes=goal_minutes,
        analytics_7d=analytics_7d,
        analytics_30d=analytics_30d,
        consistency=consistency,
        trend=trend,
        prediction=prediction,
    )
