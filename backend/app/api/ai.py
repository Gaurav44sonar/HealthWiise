import hashlib
import json
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import get_current_user
from app.db.database import database
from app.schemas.ai_sleep import (
    SleepQualityPredictionInput,
    SleepQualityPredictionResponse,
    AISleepInsightsResponse,
    SleepAnalytics7d,
    SleepAnalytics30d,
    ScheduleConsistency,
    DurationTrend,
)
from app.services.ai_sleep_service import (
    load_sleep_model,
    predict_sleep_quality_score,
    compute_bedtime_variance,
    generate_rule_recommendations,
)
from app.services.gemini_sleep_recommender import generate_gemini_sleep_recommendations
from app.services.anomaly_service import detect_anomalies
from app.schemas.ai_plan import PlanRequest, PlanResponse
from app.services.gemini_plan_service import generate_plan
from app.schemas.ai_coach import CoachChatRequest, CoachChatResponse
from app.services.gemini_coach_service import collect_user_data, chat_with_coach
from app.schemas.ai_nutrition import MealScanRequest, MealScanResponse
from app.services.gemini_nutrition_service import scan_meal_with_gemini
from app.schemas.fitness import CalorieBurnEstimateRequest, CalorieBurnEstimateResponse
from app.services.ai_calorie_service import predict_calorie_burn

router = APIRouter(prefix="/ai", tags=["AI & Machine Learning Insights"])

sleep_collection = database["sleep_records"]
users_collection = database["users"]
workouts_collection = database["workout_entries"]
sleep_insights_collection = database["sleep_insights"]
plans_collection = database["ai_plans"]


def user_filter(user: dict) -> dict:
    return {"user_id": str(user["_id"])}


@router.post(
    "/sleep-quality/predict",
    response_model=SleepQualityPredictionResponse,
    status_code=status.HTTP_200_OK,
)
async def predict_sleep_quality_endpoint(
    payload: SleepQualityPredictionInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate an estimated sleep quality score (scale 1 to 10) from demographic,
    lifestyle, and biometric indicators using the trained Scikit-learn Pipeline.
    """
    try:
        prediction_result = predict_sleep_quality_score(payload.model_dump())
        return prediction_result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sleep quality prediction failed: {str(e)}",
        )


@router.post(
    "/nutrition/scan",
    response_model=MealScanResponse,
    status_code=status.HTTP_200_OK,
)
async def scan_meal_endpoint(
    payload: MealScanRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Multimodal meal analysis using Gemini 2.5 Flash Vision & NLP.
    Takes an image (base64) or natural text description to estimate calories,
    macros, detected food items, and clinical health guidance.
    """
    if not payload.text_description and not payload.image_base64:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please provide either a meal photo or a text description to analyze.",
        )

    try:
        result = await scan_meal_with_gemini(
            text_description=payload.text_description,
            image_base64=payload.image_base64,
            mime_type=payload.mime_type,
        )
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI meal analysis failed: {str(exc)}",
        )


@router.post(
    "/coach/chat",
    response_model=CoachChatResponse,
    status_code=status.HTTP_200_OK,
)
async def coach_chat_endpoint(
    payload: CoachChatRequest,
    user: dict = Depends(get_current_user),
):
    """AI wellness coach: answers using the user's last 30 days of sleep, water, workouts and meals."""
    data = await collect_user_data(database, user)
    reply, used_ai = await chat_with_coach(
        data, payload.message, [m.model_dump() for m in payload.history]
    )
    return {"reply": reply, "used_ai": used_ai, "data_summary": data}


def _plan_doc_to_response(doc: dict | None) -> dict:
    if not doc or not doc.get("days"):
        return {"has_plan": False}
    return {
        "has_plan": True,
        "used_ai": doc.get("used_ai", False),
        "generated_at": doc["generated_at"].isoformat() if doc.get("generated_at") else None,
        "request": doc.get("request"),
        "summary": doc.get("summary", ""),
        "days": doc["days"],
    }


@router.get("/plan", response_model=PlanResponse)
async def get_saved_plan(user: dict = Depends(get_current_user)):
    """Return the user's saved weekly workout & meal plan (no Gemini call)."""
    return _plan_doc_to_response(await plans_collection.find_one(user_filter(user)))


@router.post("/plan/generate", response_model=PlanResponse)
async def generate_weekly_plan(
    payload: PlanRequest,
    user: dict = Depends(get_current_user),
):
    """Generate a 7-day workout & meal plan from the user's goals and last 30 days of data, then save it."""
    data = await collect_user_data(database, user)
    plan, used_ai = await generate_plan(payload, data)
    doc = {
        "request": payload.model_dump(),
        "summary": plan["summary"],
        "days": plan["days"],
        "used_ai": used_ai,
        "generated_at": datetime.now(timezone.utc),
    }
    await plans_collection.update_one(user_filter(user), {"$set": doc}, upsert=True)
    return _plan_doc_to_response(doc)


@router.get("/anomalies")
async def get_anomaly_alerts(user: dict = Depends(get_current_user)):
    """Detect unusual recent drops in sleep, water and activity versus the user's own history."""
    today = datetime.now().date()
    since_day = (today - timedelta(days=32)).isoformat()
    since_dt = datetime.now(timezone.utc) - timedelta(days=33)
    uid = user_filter(user)

    sleep = await sleep_collection.find({**uid, "sleep_date": {"$gte": since_day}}).to_list(length=100)
    workouts = await workouts_collection.find({**uid, "workout_date": {"$gte": since_day}}).to_list(length=300)
    water = await database["water_entries"].find({**uid, "recorded_at": {"$gte": since_dt}}).to_list(length=3000)

    daily: dict = {"sleep": {}, "water": {}, "activity": {}}
    for r in sleep:
        d = datetime.strptime(r["sleep_date"], "%Y-%m-%d").date()
        daily["sleep"][d] = daily["sleep"].get(d, 0.0) + r.get("sleep_duration_minutes", 0) / 60.0
    for w in workouts:
        d = datetime.strptime(w["workout_date"], "%Y-%m-%d").date()
        daily["activity"][d] = daily["activity"].get(d, 0.0) + float(w.get("duration_minutes", 0))
    for e in water:
        rec = e["recorded_at"]
        d = rec.date() if hasattr(rec, "date") else datetime.fromisoformat(str(rec)).date()
        daily["water"][d] = daily["water"].get(d, 0.0) + float(e.get("amount_ml", 0))

    return detect_anomalies(daily, today)


@router.get(
    "/sleep-insights",
    response_model=AISleepInsightsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_ai_sleep_insights(
    user: dict = Depends(get_current_user),
    # Optional biometric overrides for immediate ML prediction integration
    age: int | None = Query(default=None, ge=18, le=100),
    stress_level: int | None = Query(default=None, ge=1, le=10),
    heart_rate: int | None = Query(default=None, ge=40, le=120),
    daily_steps: int | None = Query(default=None, ge=1000, le=30000),
    systolic_bp: float | None = Query(default=None, ge=80.0, le=200.0),
    diastolic_bp: float | None = Query(default=None, ge=50.0, le=130.0),
    sleep_duration: float | None = Query(default=None, ge=3.0, le=14.0),
    occupation: str | None = Query(default=None, max_length=100),
    bmi_category: str | None = Query(default=None),
    refresh: bool = Query(default=False),
):
    """
    Unified AI Sleep Insights combining:
    1. Real user sleep history from MongoDB (7-day and 30-day analytics).
    2. Bedtime/wake-time variance and schedule consistency analysis.
    3. Multi-week duration trend comparison.
    4. Transparent, deterministic rule-based wellness recommendations.
    5. Machine-Learning Sleep Quality estimate (if biometrics provided or prefilled).
    """
    goal_minutes = user.get("sleep_goal_minutes", 480)

    # Fetch last 35 records sorted descending
    cursor = sleep_collection.find(user_filter(user)).sort([
        ("sleep_date", -1),
        ("bedtime", -1),
    ]).limit(35)
    records = await cursor.to_list(length=35)

    # 1. 7-Day Analytics
    records_7d = records[:7]
    total_7d = len(records_7d)

    durations_7d = [r.get("sleep_duration_minutes", 0) for r in records_7d]
    efficiencies_7d = [r.get("sleep_efficiency", 0.0) for r in records_7d if r.get("sleep_efficiency") is not None]
    qualities_7d = [r.get("quality") for r in records_7d if r.get("quality") is not None]

    avg_dur_mins_7d = int(round(sum(durations_7d) / total_7d)) if total_7d > 0 else None
    avg_dur_hrs_7d = round(avg_dur_mins_7d / 60.0, 1) if avg_dur_mins_7d is not None else None
    avg_eff_7d = round(sum(efficiencies_7d) / len(efficiencies_7d), 1) if efficiencies_7d else None
    avg_qual_7d = round(sum(qualities_7d) / len(qualities_7d), 1) if qualities_7d else None
    goal_rate_7d = (
        round((sum(1 for d in durations_7d if d >= goal_minutes) / total_7d) * 100, 1)
        if total_7d > 0
        else None
    )

    analytics_7d = {
        "total_logged_nights": total_7d,
        "avg_sleep_duration_hours": avg_dur_hrs_7d,
        "avg_sleep_duration_minutes": avg_dur_mins_7d,
        "goal_completion_rate": goal_rate_7d,
        "avg_sleep_efficiency": avg_eff_7d,
        "avg_quality": avg_qual_7d,
        "data_sufficient": total_7d >= 3,
    }

    # 2. 30-Day Analytics
    records_30d = records[:30]
    total_30d = len(records_30d)
    durations_30d = [r.get("sleep_duration_minutes", 0) for r in records_30d]
    avg_dur_mins_30d = int(round(sum(durations_30d) / total_30d)) if total_30d > 0 else None
    avg_dur_hrs_30d = round(avg_dur_mins_30d / 60.0, 1) if avg_dur_mins_30d is not None else None
    goal_rate_30d = (
        round((sum(1 for d in durations_30d if d >= goal_minutes) / total_30d) * 100, 1)
        if total_30d > 0
        else None
    )

    analytics_30d = {
        "total_logged_nights": total_30d,
        "avg_sleep_duration_hours": avg_dur_hrs_30d,
        "goal_completion_rate": goal_rate_30d,
        "data_sufficient": total_30d >= 7,
    }

    # 3. Schedule Consistency Analysis
    bt_var, wt_var, level, desc = compute_bedtime_variance(records_7d if total_7d >= 3 else records_30d)
    consistency = {
        "consistency_level": level,
        "bedtime_variance_minutes": bt_var,
        "wake_time_variance_minutes": wt_var,
        "description": desc,
    }

    # 4. Multi-Week Duration Trend
    trend_dir = "insufficient_data"
    trend_diff = None
    trend_desc = "Log at least 4 sleep sessions across different weeks to detect duration trends."

    if len(records) >= 6:
        recent_chunk = records[:4]
        prior_chunk = records[4:10]
        recent_avg = sum(r.get("sleep_duration_minutes", 0) for r in recent_chunk) / len(recent_chunk)
        prior_avg = sum(r.get("sleep_duration_minutes", 0) for r in prior_chunk) / len(prior_chunk)
        diff = int(recent_avg - prior_avg)
        trend_diff = diff

        if diff >= 20:
            trend_dir = "improving"
            trend_desc = f"Your average sleep duration is up by +{diff} minutes compared to prior recorded sessions."
        elif diff <= -20:
            trend_dir = "declining"
            trend_desc = f"Your average sleep duration decreased by {abs(diff)} minutes compared to prior recorded sessions."
        else:
            trend_dir = "stable"
            trend_desc = "Your sleep duration has remained steady (within ±20 minutes) across recorded weeks."

    duration_trend = {
        "direction": trend_dir,
        "diff_minutes": trend_diff,
        "description": trend_desc,
    }

    # 5. Check Model Availability & Optional ML Prediction
    model_available = False
    prediction_result = None
    try:
        load_sleep_model()
        model_available = True
    except Exception:
        model_available = False

    # Prefill available user inputs
    prefilled_inputs = {}
    if records:
        latest = records[0]
        latest_dur = latest.get("sleep_duration_minutes", 480) / 60.0
        prefilled_inputs["sleep_duration"] = round(latest_dur, 1)

    gender_str = "Male" if user.get("dashboard_type") == "mens" else "Female"
    prefilled_inputs["gender"] = gender_str

    # Check if complete inputs are available for ML prediction
    missing_inputs = []
    effective_sleep_duration = sleep_duration if sleep_duration is not None else prefilled_inputs.get("sleep_duration")

    req_fields = {
        "age": age,
        "sleep_duration": effective_sleep_duration,
        "physical_activity_level": 60,  # sensible wellness baseline or override
        "stress_level": stress_level,
        "heart_rate": heart_rate,
        "daily_steps": daily_steps,
        "systolic_bp": systolic_bp,
        "diastolic_bp": diastolic_bp,
        "gender": gender_str,
        "occupation": occupation or "Professional",
        "bmi_category": bmi_category or "Normal",
    }

    if age is None:
        missing_inputs.append("Age")
    if effective_sleep_duration is None:
        missing_inputs.append("Sleep Duration")
    if stress_level is None:
        missing_inputs.append("Stress Level")
    if heart_rate is None:
        missing_inputs.append("Resting Heart Rate")
    if systolic_bp is None or diastolic_bp is None:
        missing_inputs.append("Blood Pressure (Systolic & Diastolic)")

    if model_available and len(missing_inputs) == 0:
        try:
            prediction_result = predict_sleep_quality_score(req_fields)
        except Exception:
            prediction_result = None

    # 6. AI-Generated Personalized Recommendations, persisted per user in MongoDB.
    # Reused until the underlying sleep data / goal / ML score changes (or refresh=true).
    signature = hashlib.sha256(
        json.dumps(
            {
                "records": [
                    [str(r.get("_id")), r.get("sleep_duration_minutes"), r.get("quality"), r.get("sleep_efficiency")]
                    for r in records
                ],
                "goal": goal_minutes,
                "score": (prediction_result or {}).get("estimated_sleep_quality"),
            },
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()

    recommendations = None
    if not refresh:
        stored = await sleep_insights_collection.find_one(user_filter(user))
        if stored and stored.get("signature") == signature and stored.get("recommendations"):
            recommendations = stored["recommendations"]

    if recommendations is None:
        recommendations = await generate_gemini_sleep_recommendations(
            user=user,
            goal_minutes=goal_minutes,
            analytics_7d=analytics_7d,
            analytics_30d=analytics_30d,
            consistency=consistency,
            trend=duration_trend,
            prediction=prediction_result,
            recent_records=records,
        )
        await sleep_insights_collection.update_one(
            user_filter(user),
            {
                "$set": {
                    "recommendations": recommendations,
                    "signature": signature,
                    "generated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )

    return {
        "model_available": model_available,
        "prediction": prediction_result,
        "missing_prediction_inputs": missing_inputs,
        "user_prefilled_inputs": prefilled_inputs,
        "goal_minutes": goal_minutes,
        "analytics_7d": analytics_7d,
        "analytics_30d": analytics_30d,
        "schedule_consistency": consistency,
        "duration_trend": duration_trend,
        "recommendations": recommendations,
        "disclaimer": (
            "HealthWiise AI Sleep Insights combines real recorded sleep history with transparent, rule-based wellness guidelines "
            "and machine-learning estimations. It is purely educational and does not constitute medical diagnosis or clinical treatment."
        ),
    }


@router.post(
    "/fitness/calorie-burn",
    response_model=CalorieBurnEstimateResponse,
    status_code=status.HTTP_200_OK,
)
async def ai_fitness_calorie_burn(
    data: CalorieBurnEstimateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    ML Calorie Burn Estimator trained on Kaggle Gym Members Exercise Tracking dataset.
    """
    eff_gender = data.gender or ("Female" if current_user.get("dashboard_type") == "womens" else "Male")
    eff_age = data.age or current_user.get("age") or current_user.get("profile", {}).get("age", 30)
    eff_weight = data.weight_kg or current_user.get("weight_kg") or current_user.get("profile", {}).get("weight_kg")
    eff_height = data.height_cm or current_user.get("height_cm") or current_user.get("profile", {}).get("height_cm")

    pred = predict_calorie_burn(
        category=data.category,
        duration_minutes=data.duration_minutes,
        intensity=data.intensity,
        age=eff_age,
        gender=eff_gender,
        weight_kg=eff_weight,
        height_cm=eff_height,
        avg_bpm=data.avg_bpm,
        max_bpm=data.max_bpm,
    )
    return pred
