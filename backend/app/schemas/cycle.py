from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

FlowLevel = Literal["spotting", "light", "moderate", "heavy"]
SymptomSeverity = Literal["mild", "moderate", "severe"]
MoodType = Literal["happy", "calm", "sensitive", "anxious", "irritable", "sad", "energetic", "exhausted", "other"]
EnergyLevel = Literal["low", "medium", "high"]


class SymptomItem(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    severity: SymptomSeverity = "mild"


class PeriodCreate(BaseModel):
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    flow_level: FlowLevel | None = None
    notes: str | None = Field(default=None, max_length=500)


class PeriodUpdate(BaseModel):
    start_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    flow_level: FlowLevel | None = None
    notes: str | None = Field(default=None, max_length=500)


class SymptomLogCreate(BaseModel):
    log_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    symptoms: list[SymptomItem] = Field(default_factory=list, max_length=20)
    mood: MoodType | None = None
    energy_level: EnergyLevel | None = None
    notes: str | None = Field(default=None, max_length=500)


class SymptomLogUpdate(BaseModel):
    symptoms: list[SymptomItem] | None = Field(default=None, max_length=20)
    mood: MoodType | None = None
    energy_level: EnergyLevel | None = None
    notes: str | None = Field(default=None, max_length=500)
