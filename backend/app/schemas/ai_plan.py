from typing import Literal

from pydantic import BaseModel, Field


class PlanRequest(BaseModel):
    goal: Literal["lose_weight", "build_muscle", "stay_fit", "improve_sleep", "reduce_stress"] = "stay_fit"
    workout_days: int = Field(default=4, ge=1, le=7)
    equipment: Literal["gym", "home_basic", "none"] = "home_basic"
    diet: Literal["no_preference", "vegetarian", "vegan", "high_protein", "low_carb"] = "no_preference"
    notes: str | None = Field(default=None, max_length=300)


class PlanWorkout(BaseModel):
    title: str
    duration_minutes: int = 0
    intensity: str = "moderate"
    exercises: list[str] = Field(default_factory=list)


class PlanMeals(BaseModel):
    breakfast: str = ""
    lunch: str = ""
    dinner: str = ""
    snack: str = ""


class PlanDay(BaseModel):
    day: str
    workout: PlanWorkout
    meals: PlanMeals
    calorie_target: int = 0
    tip: str = ""


class PlanResponse(BaseModel):
    has_plan: bool
    used_ai: bool = False
    generated_at: str | None = None
    request: PlanRequest | None = None
    summary: str = ""
    days: list[PlanDay] = Field(default_factory=list)
    disclaimer: str = (
        "General wellness suggestions, not medical advice. Check with a doctor or dietitian "
        "before major changes to exercise or diet."
    )
