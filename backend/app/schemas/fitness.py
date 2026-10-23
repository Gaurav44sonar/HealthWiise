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
    notes: str | None = Field(default=None, max_length=500)


class WorkoutUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: WorkoutCategory | None = None
    workout_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    intensity: WorkoutIntensity | None = None
    notes: str | None = Field(default=None, max_length=500)


class FitnessGoalsUpdate(BaseModel):
    daily_active_minutes_goal: int | None = Field(default=None, ge=10, le=360)
    weekly_sessions_goal: int | None = Field(default=None, ge=1, le=14)
    weekly_active_minutes_goal: int | None = Field(default=None, ge=30, le=1800)
