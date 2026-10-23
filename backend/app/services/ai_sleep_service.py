import json
import math
import os
from datetime import datetime, timezone, timedelta
import joblib
import numpy as np
import pandas as pd

_model_pipeline = None
_model_metadata = None


def get_model_paths():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Primary: app/models/
    primary_pipeline = os.path.join(base_dir, "models", "sleep_quality_pipeline.joblib")
    primary_meta = os.path.join(base_dir, "models", "sleep_quality_model_metadata.json")

    if os.path.exists(primary_pipeline) and os.path.exists(primary_meta):
        return primary_pipeline, primary_meta

    # Fallback: Model Training/
    project_root = os.path.dirname(base_dir)
    fallback_pipeline = os.path.join(project_root, "Model Training", "sleep_quality_pipeline.joblib")
    fallback_meta = os.path.join(project_root, "Model Training", "sleep_quality_model_metadata.json")

    return fallback_pipeline, fallback_meta


def load_sleep_model():
    global _model_pipeline, _model_metadata
    if _model_pipeline is not None and _model_metadata is not None:
        return _model_pipeline, _model_metadata

    pipeline_path, meta_path = get_model_paths()

    if not os.path.exists(pipeline_path):
        raise FileNotFoundError(f"Model pipeline artifact not found at {pipeline_path}")
    if not os.path.exists(meta_path):
        raise FileNotFoundError(f"Model metadata artifact not found at {meta_path}")

    # Ensure backwards compatibility across scikit-learn versions (e.g. 1.5.x vs 1.9+)
    try:
        import sklearn.compose._column_transformer as ct
        if not hasattr(ct, "_RemainderColsList"):
            class _RemainderColsList(list):
                pass
            ct._RemainderColsList = _RemainderColsList
    except Exception:
        pass

    try:
        import warnings
        from sklearn.exceptions import InconsistentVersionWarning
        warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
    except Exception:
        pass

    _model_pipeline = joblib.load(pipeline_path)
    with open(meta_path, "r", encoding="utf-8") as f:
        _model_metadata = json.load(f)

    return _model_pipeline, _model_metadata


def predict_sleep_quality_score(inputs: dict) -> dict:
    pipeline, metadata = load_sleep_model()

    # Map input keys to exact training column names
    row = {
        "Age": int(inputs.get("age", 35)),
        "Sleep Duration": float(inputs.get("sleep_duration", 7.5)),
        "Physical Activity Level": int(inputs.get("physical_activity_level", 60)),
        "Stress Level": int(inputs.get("stress_level", 5)),
        "Heart Rate": int(inputs.get("heart_rate", 70)),
        "Daily Steps": int(inputs.get("daily_steps", 7000)),
        "Systolic_BP": float(inputs.get("systolic_bp", 120.0)),
        "Diastolic_BP": float(inputs.get("diastolic_bp", 80.0)),
        "Gender": str(inputs.get("gender", "Female")),
        "Occupation": str(inputs.get("occupation", "Engineer")),
        "BMI Category": str(inputs.get("bmi_category", "Normal")),
    }

    df_input = pd.DataFrame([row])
    raw_pred = pipeline.predict(df_input)[0]
    clipped_score = round(float(np.clip(raw_pred, 1.0, 10.0)), 2)

    # Summarize key feature impacts
    stress = row["Stress Level"]
    duration = row["Sleep Duration"]
    impact_items = []
    if stress <= 4:
        impact_items.append("low stress score reinforces recovery")
    elif stress >= 7:
        impact_items.append("elevated stress score dampens projected quality")

    if duration >= 7.5:
        impact_items.append("adequate duration supports deeper restorative phases")
    elif duration < 6.5:
        impact_items.append("sub-optimal duration limits recovery potential")

    summary_text = (
        f"Estimated from demographic and physiological inputs ({', '.join(impact_items)})."
        if impact_items
        else "Calculated using demographic, biometric, and daily habit metrics."
    )

    eval_metrics = metadata.get("evaluation_metrics", {}).get("test_metrics", {})
    r2_val = float(eval_metrics.get("r2", 0.9885))
    mae_val = float(eval_metrics.get("mae", 0.0397))

    if clipped_score >= 8.0:
        cat = "High Sleep Quality"
    elif clipped_score >= 6.5:
        cat = "Moderate Sleep Quality"
    else:
        cat = "Below Average Rest"

    return {
        "estimated_sleep_quality": clipped_score,
        "scale": "1 to 10",
        "model_name": metadata.get("model_name", "HealthWiise Sleep Quality Estimator"),
        "model_version": metadata.get("version", "1.0.0"),
        "model_type": metadata.get("model_type", "RandomForestRegressor Pipeline"),
        "feature_impact_summary": summary_text,
        "rating_category": cat,
        "evaluation_r2": r2_val,
        "evaluation_mae": mae_val,
        "disclaimer": (
            "This estimated score is an informational machine learning prediction based on public wellness dataset patterns. "
            "It is not a clinical assessment, diagnostic test, or medical advice."
        ),
    }


def compute_bedtime_variance(records: list[dict]) -> tuple[float | None, float | None, str, str]:
    if len(records) < 3:
        return None, None, "Insufficient Data", "Log at least 3 nights to calculate schedule consistency."

    bedtime_mins = []
    waketime_mins = []

    for r in records:
        bt = r.get("bedtime")
        wt = r.get("wake_time")

        if isinstance(bt, str):
            try:
                bt = datetime.fromisoformat(bt.replace("Z", "+00:00"))
            except ValueError:
                bt = None
        if isinstance(wt, str):
            try:
                wt = datetime.fromisoformat(wt.replace("Z", "+00:00"))
            except ValueError:
                wt = None

        if bt:
            # Shift midnight to continuous space: e.g. 22:00 = 22*60 = 1320, 01:00 = (24+1)*60 = 1500
            mins = bt.hour * 60 + bt.minute
            if bt.hour < 12:
                mins += 24 * 60
            bedtime_mins.append(mins)

        if wt:
            mins_w = wt.hour * 60 + wt.minute
            waketime_mins.append(mins_w)

    if len(bedtime_mins) < 3:
        return None, None, "Insufficient Data", "Log at least 3 nights with bedtime records to assess consistency."

    bt_std = float(round(np.std(bedtime_mins, ddof=1), 1))
    wt_std = float(round(np.std(waketime_mins, ddof=1), 1)) if len(waketime_mins) >= 3 else None

    if bt_std <= 45.0:
        level = "Consistent"
        desc = f"Great schedule regularity: your bedtime varies by only ±{bt_std} minutes across recent nights."
    elif bt_std <= 90.0:
        level = "Moderate"
        desc = f"Moderate schedule variation: your bedtime shifts by ±{bt_std} minutes."
    else:
        level = "Irregular"
        desc = f"Irregular schedule: your bedtime fluctuates by over ±{bt_std} minutes, which may disrupt circadian rhythm."

    return bt_std, wt_std, level, desc


def generate_rule_recommendations(
    records: list[dict],
    goal_minutes: int,
    analytics_7d: dict,
    analytics_30d: dict,
    consistency: dict,
    trend: dict,
    prediction: dict | None,
) -> list[dict]:
    recs = []

    total_7d = analytics_7d.get("total_logged_nights", 0)
    avg_dur_hrs = analytics_7d.get("avg_sleep_duration_hours")
    goal_hrs = goal_minutes / 60.0
    goal_rate_7d = analytics_7d.get("goal_completion_rate")
    avg_eff_7d = analytics_7d.get("avg_sleep_efficiency")
    consistency_level = consistency.get("consistency_level")

    # RULE D — Insufficient Records
    if total_7d < 3:
        recs.append({
            "id": "rule_d_insufficient_records",
            "title": "Log More Nights for Pattern Analysis",
            "explanation": f"You have recorded {total_7d} night{'s' if total_7d != 1 else ''} in the past week. Three or more entries are needed to detect reliable sleep trends.",
            "triggered_by": "Fewer than 3 sleep entries recorded in the last 7 days.",
            "action": "Continue logging your sleep sessions this week to unlock statistical schedule insights.",
            "category": "tracking",
            "data_sufficient": False,
        })
        return recs

    # RULE A — Sleep duration below goal
    if avg_dur_hrs is not None and avg_dur_hrs < (goal_hrs - 0.4):
        deficit_mins = int((goal_hrs - avg_dur_hrs) * 60)
        recs.append({
            "id": "rule_a_duration_below_goal",
            "title": "Sleep Duration Below Target",
            "explanation": f"Your 7-day average of {avg_dur_hrs}h is {deficit_mins} minutes below your target of {goal_hrs:.1f}h.",
            "triggered_by": f"7-day average duration ({avg_dur_hrs}h) is more than 25 minutes below configured target ({goal_hrs:.1f}h).",
            "action": "Aim to shift your evening wind-down routine 30 minutes earlier to gradually build restorative sleep buffer.",
            "category": "duration",
            "data_sufficient": True,
        })

    # RULE B — Irregular sleep schedule
    if consistency_level == "Irregular":
        bt_var = consistency.get("bedtime_variance_minutes")
        recs.append({
            "id": "rule_b_irregular_schedule",
            "title": "Stabilize Bedtime Consistency",
            "explanation": f"Your recorded bedtime varies by ±{bt_var} minutes across recent nights.",
            "triggered_by": f"Bedtime standard deviation ({bt_var} min) exceeds 90-minute threshold.",
            "action": "Anchor your circadian clock by going to sleep and waking up within the same 45-minute window each day.",
            "category": "consistency",
            "data_sufficient": True,
        })

    # RULE C — Improving sleep duration trend
    if trend.get("direction") == "improving":
        diff_m = trend.get("diff_minutes", 0)
        recs.append({
            "id": "rule_c_improving_trend",
            "title": "Positive Duration Momentum",
            "explanation": f"Your recent average sleep duration increased by {diff_m} minutes compared to prior nights.",
            "triggered_by": f"Duration increased by {diff_m} minutes between comparison periods.",
            "action": "Maintain your current bedtime routine and environmental habits that enabled this improvement.",
            "category": "progress",
            "data_sufficient": True,
        })

    # RULE G — Low Efficiency / Restlessness
    if avg_eff_7d is not None and avg_eff_7d < 85.0:
        recs.append({
            "id": "rule_g_restlessness",
            "title": "Optimize Sleep Efficiency",
            "explanation": f"Your 7-day average sleep efficiency is {avg_eff_7d}%, indicating noticeable wakefulness or restlessness in bed.",
            "triggered_by": f"7-day average sleep efficiency ({avg_eff_7d}%) is below the 85% healthy efficiency threshold.",
            "action": "Reserve the bed strictly for sleep, minimize screen blue-light 1 hour before bedtime, and keep the bedroom cool (65-68°F / 18-20°C).",
            "category": "recovery",
            "data_sufficient": True,
        })

    # RULE F — Stable Pattern & Goal Met
    if (goal_rate_7d is not None and goal_rate_7d >= 75.0) and (consistency_level in ("Consistent", "Moderate")):
        recs.append({
            "id": "rule_f_stable_pattern",
            "title": "Consistent Sleep Routine Achieved",
            "explanation": f"Outstanding consistency! You achieved your sleep duration goal on {goal_rate_7d}% of recent nights with a regular schedule.",
            "triggered_by": f"Goal completion rate ({goal_rate_7d}%) >= 75% alongside {consistency_level.lower()} schedule.",
            "action": "Protect this restorative routine by maintaining your regular wind-down schedule on weekends as well.",
            "category": "achievement",
            "data_sufficient": True,
        })

    return recs
