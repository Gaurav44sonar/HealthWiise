import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Sparkles,
    ArrowLeft,
    RotateCw,
    Droplets,
    Utensils,
    Moon,
    Dumbbell,
    Target,
    AlertCircle,
    Calendar,
    ChevronRight,
    Info,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

interface ScoreComponent {
    name: string;
    pct: number;
    weight: number;
}

interface HabitScore {
    score: number;
    components: ScoreComponent[];
    calculation_note: string;
}

interface NutritionOverview {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    meal_count: number;
    calorie_goal: number | null;
}

interface HydrationOverview {
    consumed_ml: number;
    goal_ml: number;
    percentage: number;
    remaining_ml: number;
    is_completed: boolean;
}

interface SleepOverview {
    has_record: boolean;
    latest_date: string | null;
    duration_minutes: number;
    duration_hours: number;
    goal_minutes: number;
    goal_hours: number;
    percentage: number;
    quality: number | null;
    efficiency: number | null;
}

interface FitnessOverview {
    total_minutes_today: number;
    session_count_today: number;
    daily_goal_minutes: number;
    daily_percentage: number;
    weekly_sessions_count: number;
    weekly_sessions_goal: number;
}

interface DailyOverview {
    nutrition: NutritionOverview;
    hydration: HydrationOverview;
    sleep: SleepOverview;
    fitness: FitnessOverview;
}

interface GoalItem {
    id: string;
    category: string;
    title: string;
    type: string;
    current_value: number;
    target_value: number;
    unit: string;
    percentage: number;
    remaining: number;
    is_completed: boolean;
    has_data?: boolean;
}

interface DailyMatrixItem {
    date: string;
    day_name: string;
    water_ml: number;
    water_goal_reached: boolean;
    calories: number;
    meal_count: number;
    sleep_hours: number | null;
    sleep_efficiency: number | null;
    workout_minutes: number;
    workout_sessions: number;
    workout_goal_reached: boolean;
}

interface WellnessInsightItem {
    category: string;
    title: string;
    description: string;
}

interface WellnessSummaryResponse {
    date: string;
    habit_score: HabitScore;
    daily_overview: DailyOverview;
    goals_overview: GoalItem[];
    weekly_matrix: DailyMatrixItem[];
    insights: WellnessInsightItem[];
}

export default function WellnessInsights() {
    const { user } = useAuth();

    const isWomens = user?.dashboard_type === "womens";
    const themeClass = isWomens ? "womens-theme" : "mens-theme";
    const dashboardLink = isWomens ? "/womens/dashboard" : "/mens/dashboard";

    const [summary, setSummary] = useState<WellnessSummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [partialWarnings, setPartialWarnings] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");
        setPartialWarnings([]);

        try {
            const res = await api.get<WellnessSummaryResponse>("/api/wellness/summary");
            setSummary(res.data);
        } catch (err: unknown) {
            const response = (
                err as { response?: { status?: number; data?: { detail?: string } } }
            ).response;

            if (response?.status === 401) {
                setError("Your session has expired. Please sign in again.");
            } else {
                setError(
                    response?.data?.detail ||
                        "Unable to load wellness insights. Please verify your connection."
                );
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;

        async function fetchInitial() {
            try {
                const res = await api.get<WellnessSummaryResponse>("/api/wellness/summary");
                if (!active) return;
                setSummary(res.data);
            } catch (err: unknown) {
                if (!active) return;
                const response = (
                    err as { response?: { status?: number; data?: { detail?: string } } }
                ).response;

                if (response?.status === 401) {
                    setError("Your session has expired. Please sign in again.");
                } else {
                    setError(
                        response?.data?.detail ||
                            "Unable to load wellness insights. Please verify your connection."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        void fetchInitial();

        return () => {
            active = false;
        };
    }, []);

    const habitScore = summary?.habit_score;
    const daily = summary?.daily_overview;
    const goals = summary?.goals_overview ?? [];
    const matrix = summary?.weekly_matrix ?? [];
    const insights = summary?.insights ?? [];

    // Gauge circle calculation: r = 50, circ = 2 * PI * 50 = 314.16
    const gaugeRadius = 50;
    const gaugeCirc = 2 * Math.PI * gaugeRadius;
    const scoreVal = habitScore?.score ?? 0;
    const gaugeOffset = gaugeCirc - (Math.min(scoreVal, 100) / 100) * gaugeCirc;

    return (
        <main className={`wellness-page ${themeClass}`}>
            <div className="wellness-container">
                {/* Header */}
                <header className="wellness-topbar">
                    <div className="hydration-brand-group">
                        <Link className="dashboard-brand" to={dashboardLink}>
                            HealthWiise
                        </Link>
                    </div>

                    <Link to={dashboardLink} className="hydration-back-link">
                        <ArrowLeft size={16} /> Back to Dashboard
                    </Link>
                </header>

                <div className="wellness-title-section">
                    <p className="eyebrow">UNIFIED WELLNESS DASHBOARD</p>
                    <h1>Wellness Insights</h1>
                    <p className="muted">
                        An integrated overview of your nutrition, hydration, sleep, and physical activity habits.
                    </p>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="nutrition-error" role="alert" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                        <AlertCircle size={20} style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{error}</span>
                        <button
                            type="button"
                            className="hydration-secondary-btn"
                            onClick={() => void loadData()}
                            disabled={loading}
                            style={{ marginLeft: "auto" }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {partialWarnings.map((w, idx) => (
                    <div key={idx} className="nutrition-error" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <Info size={18} style={{ flexShrink: 0 }} />
                        <span>{w}</span>
                    </div>
                ))}

                {/* Habit Progress Score Card */}
                {loading && !summary ? (
                    <div className="wellness-score-card">
                        <div className="skeleton-line" style={{ width: "50%", margin: "10px 0" }} />
                        <div className="skeleton-line" style={{ width: "30%", margin: "10px 0" }} />
                    </div>
                ) : (
                    <section className="wellness-score-card">
                        <div className="wellness-score-left">
                            <div className="wellness-gauge-wrap" role="region" aria-label="Habit Progress Score">
                                <svg className="wellness-gauge-svg" viewBox="0 0 120 120">
                                    <circle className="wellness-gauge-bg" cx="60" cy="60" r={gaugeRadius} />
                                    <circle
                                        className="wellness-gauge-fill"
                                        cx="60"
                                        cy="60"
                                        r={gaugeRadius}
                                        strokeDasharray={gaugeCirc}
                                        strokeDashoffset={gaugeOffset}
                                    />
                                </svg>
                                <div className="wellness-gauge-inner">
                                    <span className="wellness-gauge-score">{scoreVal}%</span>
                                    <span className="wellness-gauge-sub">Habit Score</span>
                                </div>
                            </div>

                            <div className="wellness-score-info">
                                <h2>Habit Progress Overview</h2>
                                <p>
                                    Reflects progress across your configured daily and weekly goals: Hydration, Daily Movement, Weekly Sessions, and Sleep Duration.
                                </p>
                                <div className="wellness-score-pills">
                                    {habitScore?.components.map((c, i) => (
                                        <span key={i} className="wellness-score-pill">
                                            {c.name}: <strong>{c.pct}%</strong>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="hydration-secondary-btn"
                            onClick={() => void loadData()}
                            disabled={loading}
                            title="Refresh all wellness summaries"
                        >
                            <RotateCw size={14} className={loading ? "spin-animation" : ""} />
                            <span>{loading ? "Refreshing..." : "Refresh"}</span>
                        </button>
                    </section>
                )}

                {/* 4-Card Daily Overview Grid */}
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 14px", color: "var(--text)" }}>
                    Today's Service Overview
                </h2>
                <div className="wellness-services-grid">
                    {/* Nutrition Card */}
                    <div className="wellness-service-card">
                        <div>
                            <div className="wellness-service-head">
                                <h3>Nutrition</h3>
                                <div className="wellness-service-badge">
                                    <Utensils size={18} />
                                </div>
                            </div>

                            <div className="wellness-service-hero">
                                <div className="wellness-service-val">
                                    {daily?.nutrition.calories ?? 0} <small style={{ fontSize: 13, fontWeight: 550, color: "var(--muted)" }}>kcal</small>
                                </div>
                                <div className="wellness-service-sub">
                                    {daily?.nutrition.meal_count ?? 0} {daily?.nutrition.meal_count === 1 ? "meal" : "meals"} logged today
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--muted)", marginTop: 6, flexWrap: "wrap" }}>
                                <span>P: <strong>{daily?.nutrition.protein_g ?? 0}g</strong></span>
                                <span>•</span>
                                <span>C: <strong>{daily?.nutrition.carbs_g ?? 0}g</strong></span>
                                <span>•</span>
                                <span>F: <strong>{daily?.nutrition.fat_g ?? 0}g</strong></span>
                            </div>
                        </div>

                        <Link to="/shared/nutrition" className="wellness-service-link">
                            <span>Open Nutrition</span>
                            <ChevronRight size={15} />
                        </Link>
                    </div>

                    {/* Hydration Card */}
                    <div className="wellness-service-card">
                        <div>
                            <div className="wellness-service-head">
                                <h3>Hydration</h3>
                                <div className="wellness-service-badge">
                                    <Droplets size={18} />
                                </div>
                            </div>

                            <div className="wellness-service-hero">
                                <div className="wellness-service-val">
                                    {daily?.hydration.consumed_ml.toLocaleString() ?? 0} <small style={{ fontSize: 13, fontWeight: 550, color: "var(--muted)" }}>ml</small>
                                </div>
                                <div className="wellness-service-sub">
                                    {daily?.hydration.percentage ?? 0}% of {daily?.hydration.goal_ml.toLocaleString() ?? 2500} ml goal
                                </div>
                            </div>

                            <div className="sleep-progress-bar-wrap" style={{ height: 7, margin: "8px 0 4px" }}>
                                <div className="sleep-progress-bar-fill" style={{ width: `${Math.min(daily?.hydration.percentage ?? 0, 100)}%` }} />
                            </div>

                            <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 0" }}>
                                {daily?.hydration.is_completed
                                    ? "Goal reached! 🎉"
                                    : `${daily?.hydration.remaining_ml.toLocaleString()} ml remaining`}
                            </p>
                        </div>

                        <Link to="/shared/hydration" className="wellness-service-link">
                            <span>Open Hydration</span>
                            <ChevronRight size={15} />
                        </Link>
                    </div>

                    {/* Sleep & Recovery Card */}
                    <div className="wellness-service-card">
                        <div>
                            <div className="wellness-service-head">
                                <h3>Sleep &amp; Recovery</h3>
                                <div className="wellness-service-badge">
                                    <Moon size={18} />
                                </div>
                            </div>

                            <div className="wellness-service-hero">
                                {daily?.sleep.has_record ? (
                                    <>
                                        <div className="wellness-service-val">
                                            {daily.sleep.duration_hours} <small style={{ fontSize: 13, fontWeight: 550, color: "var(--muted)" }}>hrs</small>
                                        </div>
                                        <div className="wellness-service-sub">
                                            Night of {daily.sleep.latest_date} • {daily.sleep.percentage}% of goal
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="wellness-service-val" style={{ fontSize: 18, color: "var(--muted)" }}>
                                            No record
                                        </div>
                                        <div className="wellness-service-sub">Log sleep to track rest</div>
                                    </>
                                )}
                            </div>

                            {daily?.sleep.has_record && (
                                <div style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                                    <span>Eff: <strong>{daily.sleep.efficiency}%</strong></span>
                                    {daily.sleep.quality && (
                                        <>
                                            <span>•</span>
                                            <span style={{ color: "#b45309" }}>★ <strong>{daily.sleep.quality}/5</strong></span>
                                        </>
                                    )}
                                </div>
                            )}

                            <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Sparkles size={12} /> AI Sleep Model Active
                                </span>
                                <span style={{ fontSize: 11, color: "var(--muted)" }}>Insights Ready</span>
                            </div>
                        </div>

                        <Link to="/shared/sleep" className="wellness-service-link">
                            <span>Open Sleep &amp; AI Insights</span>
                            <ChevronRight size={15} />
                        </Link>
                    </div>

                    {/* Fitness & Activity Card */}
                    <div className="wellness-service-card">
                        <div>
                            <div className="wellness-service-head">
                                <h3>Fitness &amp; Activity</h3>
                                <div className="wellness-service-badge">
                                    <Dumbbell size={18} />
                                </div>
                            </div>

                            <div className="wellness-service-hero">
                                <div className="wellness-service-val">
                                    {daily?.fitness.total_minutes_today ?? 0} <small style={{ fontSize: 13, fontWeight: 550, color: "var(--muted)" }}>mins</small>
                                </div>
                                <div className="wellness-service-sub">
                                    {daily?.fitness.daily_percentage ?? 0}% of {daily?.fitness.daily_goal_minutes ?? 45}m daily target
                                </div>
                            </div>

                            <div className="sleep-progress-bar-wrap" style={{ height: 7, margin: "8px 0 4px" }}>
                                <div className="sleep-progress-bar-fill" style={{ width: `${Math.min(daily?.fitness.daily_percentage ?? 0, 100)}%` }} />
                            </div>

                            <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "4px 0 0" }}>
                                {daily?.fitness.weekly_sessions_count ?? 0} of {daily?.fitness.weekly_sessions_goal ?? 4} weekly sessions
                            </p>
                        </div>

                        <Link to="/shared/fitness" className="wellness-service-link">
                            <span>Open Fitness</span>
                            <ChevronRight size={15} />
                        </Link>
                    </div>
                </div>

                {/* Goals Overview Section */}
                <section className="fitness-card" style={{ marginBottom: 28 }}>
                    <div className="fitness-card-header">
                        <h2>
                            <Target size={22} /> Goal Completion Overview
                        </h2>
                        <span className="water-history-badge">
                            {goals.filter((g) => g.is_completed).length} of {goals.length} targets met
                        </span>
                    </div>

                    <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
                        Real-time status calculated from your configured daily and weekly targets:
                    </p>

                    <div className="wellness-goals-grid">
                        {goals.map((g) => (
                            <div key={g.id} className="wellness-goal-card">
                                <div className="wellness-goal-head">
                                    <span className="wellness-goal-title">{g.title}</span>
                                    <span className={`wellness-goal-pill ${g.is_completed ? "done" : "in-progress"}`}>
                                        {g.is_completed ? "Completed 🎉" : `${g.percentage}%`}
                                    </span>
                                </div>

                                <div className="wellness-goal-values">
                                    <div>
                                        <strong>{g.current_value.toLocaleString()}</strong> <small>{g.unit}</small>
                                    </div>
                                    <span>Target: {g.target_value.toLocaleString()} {g.unit}</span>
                                </div>

                                <div className="sleep-progress-bar-wrap" style={{ height: 8, margin: 0 }}>
                                    <div className="sleep-progress-bar-fill" style={{ width: `${Math.min(g.percentage, 100)}%` }} />
                                </div>

                                <div style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ textTransform: "capitalize" }}>{g.type} Goal</span>
                                    <span>{g.is_completed ? "Met" : `${g.remaining.toLocaleString()} ${g.unit} remaining`}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 7-Day Multi-Service Weekly Matrix */}
                <section className="fitness-card" style={{ marginBottom: 28 }}>
                    <div className="fitness-card-header">
                        <h2>
                            <Calendar size={22} /> 7-Day Multi-Service Activity Matrix
                        </h2>
                        <span className="water-history-badge">Last 7 days</span>
                    </div>

                    <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
                        Correlate hydration, nutrition intake, rest, and workout duration across the week:
                    </p>

                    <div className="wellness-table-wrap">
                        <table className="wellness-table" aria-label="7-day wellness activity matrix">
                            <thead>
                                <tr>
                                    <th>Day / Date</th>
                                    <th>Hydration (ml)</th>
                                    <th>Calories &amp; Meals</th>
                                    <th>Sleep Duration</th>
                                    <th>Workouts (mins)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrix.map((row) => (
                                    <tr key={row.date}>
                                        <td>
                                            <strong>{row.day_name}</strong>{" "}
                                            <small style={{ color: "var(--muted)" }}>({row.date.slice(5)})</small>
                                        </td>
                                        <td>
                                            <span className={`wellness-status-dot ${row.water_goal_reached ? "active" : "inactive"}`} />
                                            {row.water_ml > 0 ? `${row.water_ml.toLocaleString()} ml` : "—"}
                                        </td>
                                        <td>
                                            {row.calories > 0 ? (
                                                <span>
                                                    <strong>{row.calories.toLocaleString()}</strong> kcal ({row.meal_count} {row.meal_count === 1 ? "meal" : "meals"})
                                                </span>
                                            ) : (
                                                "—"
                                            )}
                                        </td>
                                        <td>
                                            {row.sleep_hours !== null ? (
                                                <span>
                                                    <strong>{row.sleep_hours}</strong> hrs{" "}
                                                    {row.sleep_efficiency ? <small style={{ color: "var(--muted)" }}>({row.sleep_efficiency}% eff)</small> : ""}
                                                </span>
                                            ) : (
                                                <span style={{ color: "var(--muted)" }}>No log</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`wellness-status-dot ${row.workout_goal_reached ? "active" : "inactive"}`} />
                                            {row.workout_minutes > 0 ? (
                                                <span>
                                                    <strong>{row.workout_minutes}</strong> mins ({row.workout_sessions} {row.workout_sessions === 1 ? "session" : "sessions"})
                                                </span>
                                            ) : (
                                                "—"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Personalized Insights Section */}
                <section className="fitness-card">
                    <div className="fitness-card-header">
                        <h2>
                            <Sparkles size={22} /> Cross-Service Wellness Insights
                        </h2>
                    </div>

                    <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
                        Observations derived from your verified activity, sleep, hydration, and nutrition data:
                    </p>

                    <div className="sleep-insights-grid">
                        {insights.map((ins, idx) => (
                            <div key={idx} className="sleep-insight-card">
                                <h4>
                                    {ins.category === "hydration" && <Droplets size={16} />}
                                    {ins.category === "sleep" && <Moon size={16} />}
                                    {ins.category === "fitness" && <Dumbbell size={16} />}
                                    {ins.category === "nutrition" && <Utensils size={16} />}
                                    {ins.category === "general" && <Sparkles size={16} />}
                                    <span>{ins.title}</span>
                                </h4>
                                <p>{ins.description}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
