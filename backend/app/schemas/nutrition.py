
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class WaterEntryRequest(BaseModel):
    amount_ml: int = Field(gt=0, le=5000)
    recorded_at: datetime | None = None


class MealEntryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    meal_type: Literal[
        "breakfast", "lunch", "dinner", "snack"
    ]
    calories: float = Field(ge=0, le=10000)
    protein_g: float = Field(default=0, ge=0, le=1000)
    carbs_g: float = Field(default=0, ge=0, le=1000)
    fat_g: float = Field(default=0, ge=0, le=1000)
    recorded_at: datetime | None = None


class HydrationGoalRequest(BaseModel):
    goal_ml: int = Field(gt=0, le=10000)
