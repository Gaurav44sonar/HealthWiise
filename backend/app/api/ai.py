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

router = APIRouter(prefix="/ai", tags=["AI & Machine Learning Insights"])

sleep_collection = database["sleep_records"]
users_collection = database["users"]
workouts_collection = database["workout_entries"]


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

    # 6. AI-Generated Personalized Recommendations (Gemini 2.5 Flash + ML + MongoDB Sleep History)
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
