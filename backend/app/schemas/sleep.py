from datetime import datetime
from pydantic import BaseModel, Field


class SleepRecordCreate(BaseModel):
    sleep_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    bedtime: datetime
    wake_time: datetime
    awake_minutes: int = Field(default=0, ge=0, le=720)
    quality: int | None = Field(default=None, ge=1, le=5)
    restedness: int | None = Field(default=None, ge=1, le=5)
    notes: str | None = Field(default=None, max_length=500)


class SleepGoalRequest(BaseModel):
    goal_minutes: int = Field(default=480, ge=180, le=840)  # 3 hours to 14 hours
