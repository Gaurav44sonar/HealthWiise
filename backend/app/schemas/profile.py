
from typing import Literal

from pydantic import BaseModel, Field


class DashboardPreferenceRequest(BaseModel):
    dashboard_type: Literal["mens", "womens"]


class ProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    dashboard_type: str | None = None
    onboarding_completed: bool = False


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
