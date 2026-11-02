from typing import Any, Literal
from pydantic import BaseModel, Field


class MealScanRequest(BaseModel):
    text_description: str | None = Field(
        default=None,
        description="Natural language description of the meal (e.g., '1 bowl of oatmeal with banana and honey')",
    )
    image_base64: str | None = Field(
        default=None,
        description="Base64-encoded image data without data URI prefix (e.g., /9j/4AAQSkZJRg...)",
    )
    mime_type: str = Field(
        default="image/jpeg",
        description="MIME type of the uploaded image (e.g., 'image/jpeg', 'image/png')",
    )


class DetectedFoodItem(BaseModel):
    name: str = Field(..., description="Name of the food item detected")
    portion: str = Field(default="1 serving", description="Estimated portion size")
    calories: int = Field(default=0, ge=0, description="Estimated calories")
    protein_g: float = Field(default=0.0, ge=0.0, description="Estimated protein in grams")
    carbs_g: float = Field(default=0.0, ge=0.0, description="Estimated carbs in grams")
    fat_g: float = Field(default=0.0, ge=0.0, description="Estimated fat in grams")


class MealScanResponse(BaseModel):
    name: str = Field(..., description="Identified meal name")
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = Field(
        default="lunch", description="Suggested meal category"
    )
    calories: int = Field(..., ge=0, description="Total estimated calories")
    protein_g: float = Field(..., ge=0.0, description="Total protein in grams")
    carbs_g: float = Field(..., ge=0.0, description="Total carbohydrates in grams")
    fat_g: float = Field(..., ge=0.0, description="Total fat in grams")
    fiber_g: float = Field(default=0.0, ge=0.0, description="Total dietary fiber in grams")
    health_score: int = Field(
        default=7, ge=1, le=10, description="Nutritional quality score from 1 to 10"
    )
    analysis: str = Field(
        ..., description="Professional nutritional summary and health takeaway"
    )
    items_detected: list[DetectedFoodItem] = Field(
        default_factory=list, description="Itemized breakdown of detected ingredients"
    )
    confidence: Literal["high", "medium", "estimated"] = Field(
        default="high", description="Estimation confidence level"
    )
    model_used: str = Field(
        default="gemini-2.5-flash", description="AI model that analyzed this meal"
    )

