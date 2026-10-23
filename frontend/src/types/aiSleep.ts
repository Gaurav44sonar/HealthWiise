export interface MLPrediction {
    estimated_sleep_quality: number;
    scale?: string;
    model_name?: string;
    model_version?: string;
    model_type?: string;
    model_algorithm?: string;
    rating_category?: string;
    feature_impact_summary?: string;
    evaluation_mae?: number;
    evaluation_r2?: number;
    disclaimer?: string;
}

export interface SleepAnalytics7D {
    total_logged_nights: number;
    avg_sleep_duration_hours: number | null;
    avg_sleep_duration_minutes: number | null;
    avg_sleep_efficiency: number | null;
    avg_quality: number | null;
    goal_completion_rate: number | null;
    data_sufficient: boolean;
}

export interface SleepAnalytics30D {
    total_logged_nights: number;
    avg_sleep_duration_hours: number | null;
    goal_completion_rate: number | null;
    data_sufficient: boolean;
}

export interface ScheduleConsistency {
    consistency_level: "Consistent" | "Moderate" | "Irregular" | "Insufficient Data";
    bedtime_variance_minutes: number | null;
    wake_time_variance_minutes: number | null;
    description: string;
}

export interface DurationTrend {
    direction: "improving" | "declining" | "stable" | "insufficient_data";
    diff_minutes: number | null;
    description: string;
}

export interface RuleRecommendation {
    id: string;
    title: string;
    category: "duration" | "consistency" | "quality" | "goal" | "tracking" | "progress" | "recovery" | "achievement";
    explanation: string;
    action?: string;
    suggested_action?: string;
    triggered_by?: string;
    rule_triggered?: string;
    observation?: string;
    data_sufficient?: boolean;
    based_on_sufficient_data?: boolean;
}

export interface AISleepInsightsResponse {
    model_available: boolean;
    prediction: MLPrediction | null;
    missing_prediction_inputs: string[];
    user_prefilled_inputs: Record<string, unknown>;
    goal_minutes: number;
    analytics_7d: SleepAnalytics7D;
    analytics_30d: SleepAnalytics30D;
    schedule_consistency: ScheduleConsistency;
    duration_trend: DurationTrend;
    recommendations: RuleRecommendation[];
    disclaimer: string;
}

export interface PredictionFormInputs {
    age: number;
    sleep_duration: number;
    physical_activity_level: number;
    stress_level: number;
    heart_rate: number;
    daily_steps: number;
    systolic_bp: number;
    diastolic_bp: number;
    gender: "Male" | "Female";
    occupation: string;
    bmi_category: "Normal" | "Overweight" | "Obese";
}
