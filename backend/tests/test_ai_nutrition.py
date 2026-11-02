from app.services.gemini_nutrition_service import (
    fallback_scan_estimation,
    FOOD_DATABASE_HEURISTICS,
)
from app.schemas.ai_nutrition import MealScanResponse, DetectedFoodItem


def test_fallback_scan_estimation_breakfast():
    res = fallback_scan_estimation("2 eggs with avocado and whole wheat toast")
    assert res["calories"] > 0
    assert res["protein_g"] > 0
    assert res["carbs_g"] >= 0
    assert res["fat_g"] > 0
    assert len(res["items_detected"]) >= 2
    assert res["meal_type"] == "breakfast"
    assert res["confidence"] == "estimated"

    # Validate against Pydantic schema
    validated = MealScanResponse(**res)
    assert validated.calories == res["calories"]


def test_fallback_scan_estimation_lunch_high_protein():
    res = fallback_scan_estimation("Grilled chicken with brown rice and salad")
    assert res["protein_g"] >= 30
    assert res["meal_type"] in ["lunch", "dinner"]
    assert res["health_score"] >= 7

    validated = MealScanResponse(**res)
    assert len(validated.items_detected) >= 2


def test_fallback_scan_estimation_indian_diet():
    res = fallback_scan_estimation("2 roti with dal and fresh paneer")
    assert res["calories"] >= 300
    assert res["protein_g"] >= 20
    assert any("paneer" in item["name"].lower() for item in res["items_detected"])

    validated = MealScanResponse(**res)
    assert validated.calories > 0


def test_fallback_scan_estimation_empty_or_unknown():
    res = fallback_scan_estimation("")
    assert res["calories"] > 0
    assert res["protein_g"] > 0
    assert len(res["items_detected"]) > 0

    validated = MealScanResponse(**res)
    assert validated.health_score >= 1
