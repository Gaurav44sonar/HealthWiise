from typing import Literal
from pydantic import BaseModel, Field

GenderType = Literal["Male", "Female", "Other"]
BMIType = Literal["Normal", "Overweight", "Obese"]


class SleepQualityPredictionInput(BaseModel):
    age: int = Field(default=35, ge=18, le=100, description="Age in years")
    sleep_duration: float = Field(default=7.5, ge=3.0, le=14.0, description="Sleep duration in hours")
    physical_activity_level: int = Field(default=60, ge=0, le=180, description="Minutes of physical activity per day")
    stress_level: int = Field(default=5, ge=1, le=10, description="Subjective stress level (1 to 10)")
    heart_rate: int = Field(default=70, ge=40, le=120, description="Resting heart rate in beats per minute")
    daily_steps: int = Field(default=7000, ge=1000, le=30000, description="Average daily step count")
    systolic_bp: float = Field(default=120.0, ge=80.0, le=200.0, description="Systolic blood pressure (mmHg)")
    diastolic_bp: float = Field(default=80.0, ge=50.0, le=130.0, description="Diastolic blood pressure (mmHg)")
    gender: GenderType = Field(default="Female", description="Gender identity")
    occupation: str = Field(default="Engineer", min_length=1, max_length=100, description="Primary occupation")
    bmi_category: BMIType = Field(default="Normal", description="BMI classification")


class SleepQualityPredictionResponse(BaseModel):
    estimated_sleep_quality: float = Field(description="Estimated sleep quality rating on 1 to 10 scale")
    scale: str = "1 to 10"
    model_name: str
    model_version: str
    model_type: str
    feature_impact_summary: str
    rating_category: str = "High Sleep Quality"
    evaluation_r2: float = 0.9885
    evaluation_mae: float = 0.0397
    disclaimer: str


class RuleRecommendation(BaseModel):
    id: str
    title: str
    explanation: str
    triggered_by: str
    action: str
    category: Literal["duration", "consistency", "progress", "tracking", "goal", "recovery", "achievement", "quality", "habits"]
    data_sufficient: bool


class ScheduleConsistency(BaseModel):
    consistency_level: Literal["Consistent", "Moderate", "Irregular", "Insufficient Data"]
    bedtime_variance_minutes: float | None = None
    wake_time_variance_minutes: float | None = None
    description: str


class DurationTrend(BaseModel):
    direction: Literal["improving", "declining", "stable", "insufficient_data"]
    diff_minutes: int | None = None
    description: str


class SleepAnalytics7d(BaseModel):
    total_logged_nights: int
    avg_sleep_duration_hours: float | None = None
    avg_sleep_duration_minutes: int | None = None
    goal_completion_rate: float | None = None
    avg_sleep_efficiency: float | None = None
    avg_quality: float | None = None
    data_sufficient: bool


class SleepAnalytics30d(BaseModel):
    total_logged_nights: int
    avg_sleep_duration_hours: float | None = None
    goal_completion_rate: float | None = None
    data_sufficient: bool


class AISleepInsightsResponse(BaseModel):
    model_available: bool
    prediction: SleepQualityPredictionResponse | None = None
    missing_prediction_inputs: list[str]
    user_prefilled_inputs: dict
    goal_minutes: int
    analytics_7d: SleepAnalytics7d
    analytics_30d: SleepAnalytics30d
    schedule_consistency: ScheduleConsistency
    duration_trend: DurationTrend
    recommendations: list[RuleRecommendation]
    disclaimer: str
