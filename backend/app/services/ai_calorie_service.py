import json
import logging
import math
import os
from typing import Any
import joblib
import pandas as pd

logger = logging.getLogger(__name__)

_model_pipeline = None
_model_metadata = None

# Category physiology scaling factors relative to gym endurance reference
# Based on ACSM (American College of Sports Medicine) Compendium
CATEGORY_PHYSIOLOGY_MULTIPLIER: dict[str, float] = {
    "running": 1.05,
    "sports": 1.00,
    "cardio": 0.95,
    "cycling": 0.88,
    "strength": 0.75,
    "other": 0.70,
    "walking": 0.45,
    "yoga": 0.35,
}
CATEGORY_TO_WORKOUT_TYPE: dict[str, str] = {
    "strength": "Strength",
    "running": "Cardio",
    "walking": "Cardio",
    "cycling": "Cardio",
    "cardio": "Cardio",
    "yoga": "Yoga",
    "sports": "HIIT",
    "other": "Cardio",
}

# Standard Compendium of Physical Activities METs (fallback & baseline calculation)
MET_LOOKUP: dict[str, dict[str, float]] = {
    "strength": {"light": 3.5, "moderate": 5.0, "vigorous": 6.5},
    "running": {"light": 7.0, "moderate": 9.8, "vigorous": 12.0},
    "walking": {"light": 2.8, "moderate": 3.8, "vigorous": 5.0},
    "cycling": {"light": 5.5, "moderate": 7.5, "vigorous": 10.0},
    "cardio": {"light": 6.0, "moderate": 8.0, "vigorous": 10.5},
    "yoga": {"light": 2.0, "moderate": 2.8, "vigorous": 4.0},
    "sports": {"light": 5.0, "moderate": 7.0, "vigorous": 9.5},
    "other": {"light": 3.5, "moderate": 5.0, "vigorous": 7.0},
}


def get_model_paths() -> tuple[str, str]:
    """Resolve paths to calorie burn model artifact and metadata."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    primary_pipeline = os.path.join(base_dir, "models", "calorie_burn_model.joblib")
    primary_meta = os.path.join(base_dir, "models", "calorie_burn_model_metadata.json")

    if os.path.exists(primary_pipeline) and os.path.exists(primary_meta):
        return primary_pipeline, primary_meta

    project_root = os.path.dirname(base_dir)
    fallback_pipeline = os.path.join(project_root, "Model Training", "calorie_burn_model.joblib")
    fallback_meta = os.path.join(project_root, "Model Training", "calorie_burn_model_metadata.json")

    return fallback_pipeline, fallback_meta


def load_calorie_model():
    """Load and cache the trained GradientBoosting calorie burn pipeline and metadata."""
    global _model_pipeline, _model_metadata
    if _model_pipeline is not None and _model_metadata is not None:
        return _model_pipeline, _model_metadata

    pipeline_path, meta_path = get_model_paths()

    if not os.path.exists(pipeline_path) or not os.path.exists(meta_path):
        logger.warning(
            "Calorie burn model files not found at %s. Will use scientific MET formula fallback.",
            pipeline_path,
        )
        return None, None

    try:
        # Compatibility across sklearn versions (e.g. 1.5.x vs 1.9+)
        try:
            import sklearn.compose._column_transformer as ct
            if not hasattr(ct, "_RemainderColsList"):
                class _RemainderColsList(list):
                    pass
                ct._RemainderColsList = _RemainderColsList
        except Exception:
            pass

        import warnings
        from sklearn.exceptions import InconsistentVersionWarning
        warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
        
        _model_pipeline = joblib.load(pipeline_path)
        with open(meta_path, "r", encoding="utf-8") as f:
            _model_metadata = json.load(f)
        logger.info(
            "Loaded calorie burn model successfully: %s from %s",
            _model_metadata.get("model_name"),
            _model_metadata.get("data_source"),
        )
        return _model_pipeline, _model_metadata
    except Exception as exc:
        logger.warning("Error loading calorie burn model artifact: %s", exc)
        return None, None


def calculate_met_fallback(
    category: str,
    duration_minutes: int,
    intensity: str,
    weight_kg: float,
) -> int:
    """Calculate baseline calories burned using standard exercise physiology MET formula."""
    cat_key = category.lower() if category.lower() in MET_LOOKUP else "cardio"
    int_key = intensity.lower() if intensity.lower() in ["light", "moderate", "vigorous"] else "moderate"
    met = MET_LOOKUP.get(cat_key, {}).get(int_key, 6.0)

    # Formula: Calories = MET * weight_kg * (duration_minutes / 60)
    burned = met * weight_kg * (duration_minutes / 60.0)
    return max(10, int(round(burned)))


def predict_calorie_burn(
    category: str,
    duration_minutes: int,
    intensity: str = "moderate",
    age: int | None = None,
    gender: str | None = None,
    weight_kg: float | None = None,
    height_cm: float | None = None,
    avg_bpm: int | None = None,
    max_bpm: int | None = None,
) -> dict[str, Any]:
    """
    Estimate calories burned during a workout session.
    Uses the trained GradientBoostingRegressor on the Kaggle Gym Members Exercise Dataset.
    Falls back gracefully to scientific MET compendium if needed.
    """
    eff_cat = category.lower() if category else "cardio"
    eff_dur = max(1, int(duration_minutes))
    eff_int = intensity.lower() if intensity in ["light", "moderate", "vigorous"] else "moderate"

    eff_gender = "Female" if (gender and "fem" in str(gender).lower()) else "Male"
    eff_age = int(age) if (age and 14 <= age <= 100) else 30
    eff_weight = float(weight_kg) if (weight_kg and 35.0 <= weight_kg <= 250.0) else (64.0 if eff_gender == "Female" else 76.0)
    eff_height = float(height_cm) if (height_cm and 100.0 <= height_cm <= 230.0) else (164.0 if eff_gender == "Female" else 176.0)

    workout_type = CATEGORY_TO_WORKOUT_TYPE.get(eff_cat, "Cardio")

    pipeline, metadata = load_calorie_model()

    if pipeline is not None and metadata is not None:
        try:
            # Map intensity to intensity_ratio
            ratio_map = metadata.get("intensity_ratio_map", {"light": 0.727, "moderate": 0.796, "vigorous": 0.87})
            if avg_bpm and max_bpm and max_bpm > 0:
                intensity_ratio = round(avg_bpm / max_bpm, 3)
            else:
                intensity_ratio = ratio_map.get(eff_int, 0.796)

            # Special case for walking: lower intensity ratio slightly
            if eff_cat == "walking":
                intensity_ratio = max(0.55, intensity_ratio * 0.88)

            row = {
                "age": eff_age,
                "weight_kg": eff_weight,
                "height_cm": eff_height,
                "duration_min": float(eff_dur),
                "intensity_ratio": float(intensity_ratio),
                "gender": eff_gender,
                "workout_type": workout_type,
            }

            df_input = pd.DataFrame([row])
            raw_pred = pipeline.predict(df_input)[0]
            mult = CATEGORY_PHYSIOLOGY_MULTIPLIER.get(eff_cat, 0.85)
            calories_burned = max(15, int(round(raw_pred * mult)))

            burn_rate = round(calories_burned / eff_dur, 2)

            return {
                "calories_burned": calories_burned,
                "burn_rate_kcal_per_min": burn_rate,
                "workout_type_mapped": workout_type,
                "intensity_level": eff_int,
                "intensity_ratio": round(intensity_ratio, 3),
                "model_used": "GradientBoosting ML Model (Kaggle Gym Members Exercise Dataset)",
                "data_source": metadata.get("data_source", "Gym Members Exercise Dataset"),
                "is_ml_prediction": True,
                "evaluation_r2": metadata.get("test_metrics", {}).get("r2", 0.9602),
                "evaluation_mae": metadata.get("test_metrics", {}).get("mae_kcal", 41.66),
                "summary": (
                    f"Estimated {calories_burned} kcal burned across {eff_dur} mins of {eff_int} {category.capitalize()} "
                    f"({burn_rate} kcal/min) based on physiological profiles from the Gym Exercise Dataset."
                ),
            }
        except Exception as exc:
            logger.warning("Error running calorie burn ML prediction: %s", exc)

    # Fallback to MET formula
    fallback_cals = calculate_met_fallback(eff_cat, eff_dur, eff_int, eff_weight)
    burn_rate = round(fallback_cals / eff_dur, 2)
    return {
        "calories_burned": fallback_cals,
        "burn_rate_kcal_per_min": burn_rate,
        "workout_type_mapped": workout_type,
        "intensity_level": eff_int,
        "intensity_ratio": 0.75,
        "model_used": "Physiological MET Standard Compendium (Fallback)",
        "data_source": "Compendium of Physical Activities",
        "is_ml_prediction": False,
        "evaluation_r2": None,
        "evaluation_mae": None,
        "summary": (
            f"Estimated {fallback_cals} kcal burned ({burn_rate} kcal/min) based on physiological MET task standards."
        ),
    }
