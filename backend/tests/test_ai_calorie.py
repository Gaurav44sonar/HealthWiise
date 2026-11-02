import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.ai_calorie_service import (
    load_calorie_model,
    predict_calorie_burn,
    calculate_met_fallback,
    CATEGORY_TO_WORKOUT_TYPE,
)


def test_calorie_model_loading_and_metadata():
    pipeline, meta = load_calorie_model()
    assert pipeline is not None, "Model pipeline should be loaded"
    assert meta is not None, "Metadata should be loaded"
    assert "Gym Members Exercise Dataset" in meta["data_source"]
    assert meta["n_rows"] == 973
    assert meta["test_metrics"]["r2"] > 0.90


def test_predict_calorie_burn_ml():
    # Test Cardio
    res_cardio = predict_calorie_burn(
        category="cardio",
        duration_minutes=45,
        intensity="moderate",
        gender="Male",
        age=28,
        weight_kg=75.0,
        height_cm=178.0,
    )
    assert res_cardio["is_ml_prediction"] is True
    assert res_cardio["calories_burned"] > 300
    assert res_cardio["burn_rate_kcal_per_min"] > 5.0
    assert "Gym Members Exercise Dataset" in res_cardio["data_source"]

    # Test Strength
    res_strength = predict_calorie_burn(
        category="strength",
        duration_minutes=45,
        intensity="vigorous",
        gender="Female",
        age=32,
        weight_kg=62.0,
        height_cm=165.0,
    )
    assert res_strength["is_ml_prediction"] is True
    assert res_strength["calories_burned"] > 200

    # Test Yoga (lower burn rate)
    res_yoga = predict_calorie_burn(
        category="yoga",
        duration_minutes=45,
        intensity="light",
        gender="Female",
    )
    assert res_yoga["calories_burned"] < res_cardio["calories_burned"]


def test_calculate_met_fallback():
    cals = calculate_met_fallback("running", 30, "moderate", 70.0)
    assert cals > 200
    cals_walk = calculate_met_fallback("walking", 30, "light", 70.0)
    assert cals_walk < cals


if __name__ == "__main__":
    test_calorie_model_loading_and_metadata()
    test_predict_calorie_burn_ml()
    test_calculate_met_fallback()
    print("All calorie model tests passed successfully!")


