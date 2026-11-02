from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

WorkoutCategory = Literal[
    "strength",
    "running",
    "walking",
    "cycling",
    "cardio",
    "yoga",
    "sports",
    "other",
]

WorkoutIntensity = Literal["light", "moderate", "vigorous"]


class WorkoutCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: WorkoutCategory
    workout_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    duration_minutes: int = Field(ge=1, le=1440)
    intensity: WorkoutIntensity | None = None
    calories_burned: int | None = Field(default=None, ge=0, le=10000, description="Estimated or user-specified calories burned")
    notes: str | None = Field(default=None, max_length=500)


class WorkoutUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: WorkoutCategory | None = None
    workout_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    intensity: WorkoutIntensity | None = None
    calories_burned: int | None = Field(default=None, ge=0, le=10000)
    notes: str | None = Field(default=None, max_length=500)


class FitnessGoalsUpdate(BaseModel):
    daily_active_minutes_goal: int | None = Field(default=None, ge=10, le=360)
    weekly_sessions_goal: int | None = Field(default=None, ge=1, le=14)
    weekly_active_minutes_goal: int | None = Field(default=None, ge=30, le=1800)


class CalorieBurnEstimateRequest(BaseModel):
    category: WorkoutCategory = Field(default="cardio", description="Activity category")
    duration_minutes: int = Field(default=45, ge=1, le=1440, description="Workout duration in minutes")
    intensity: WorkoutIntensity = Field(default="moderate", description="Exercise intensity level")
    age: int | None = Field(default=None, ge=14, le=100, description="User age")
    gender: Literal["Male", "Female"] | None = Field(default=None, description="Gender for metabolic rate")
    weight_kg: float | None = Field(default=None, ge=30.0, le=300.0, description="Body weight in kg")
    height_cm: float | None = Field(default=None, ge=100.0, le=250.0, description="Height in cm")
    avg_bpm: int | None = Field(default=None, ge=40, le=220, description="Average heart rate during workout")
    max_bpm: int | None = Field(default=None, ge=60, le=240, description="Maximum heart rate reached")


class CalorieBurnEstimateResponse(BaseModel):
    calories_burned: int = Field(..., ge=0, description="Predicted calories burned")
    burn_rate_kcal_per_min: float = Field(..., description="Burn rate in kcal per minute")
    workout_type_mapped: str = Field(..., description="Target model category mapped from exercise")
    intensity_level: str = Field(..., description="Intensity classification")
    intensity_ratio: float = Field(..., description="Heart rate intensity ratio used")
    model_used: str = Field(..., description="Model name or fallback reference")
    data_source: str = Field(..., description="Dataset name used for model training")
    is_ml_prediction: bool = Field(..., description="Whether prediction is from the ML pipeline")
    evaluation_r2: float | None = None
    evaluation_mae: float | None = None
    summary: str = Field(..., description="Nutritional & fitness takeaway description")
