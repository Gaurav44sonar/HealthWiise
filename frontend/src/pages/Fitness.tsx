import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
    Dumbbell,
    ArrowLeft,
    RotateCw,
    Bike,
    HeartPulse,
    Footprints,
    Flame,
    Flower2,
    Trophy,
    Activity,
    Target,
    Clock,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    Edit3,
    Trash2,
    Plus,
    X,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

type WorkoutCategory =
    | "strength"
    | "running"
    | "walking"
    | "cycling"
    | "cardio"
    | "yoga"
    | "sports"
    | "other";

type WorkoutIntensity = "light" | "moderate" | "vigorous";

interface Workout {
    id: string;
    name: string;
    category: WorkoutCategory;
    category_label: string;
    workout_date: string;
    start_time: string | null;
    duration_minutes: number;
    intensity: WorkoutIntensity | null;
    notes: string | null;
    created_at: string;
}

interface FitnessGoals {
    daily_active_minutes_goal: number;
    weekly_sessions_goal: number;
    weekly_active_minutes_goal: number;
}

interface TodaySummary {
    date: string;
    total_minutes_today: number;
    session_count_today: number;
    daily_goal_minutes: number;
    daily_progress_percentage: number;
    daily_remaining_minutes: number;
    daily_goal_reached: boolean;
    most_recent_workout: Workout | null;
}

interface CategoryBreakdownItem {
    category: WorkoutCategory;
    label: string;
    total_minutes: number;
    session_count: number;
    percentage: number;
}

interface DailyChartItem {
    date: string;
    day_name: string;
    minutes: number;
    session_count: number;
    goal_reached: boolean;
}

interface WeeklyAnalytics {
    start_date: string;
    end_date: string;
    total_minutes: number;
    total_hours: number;
    session_count: number;
    avg_duration_minutes: number;
    sessions_goal: number;
    sessions_progress_percentage: number;
    sessions_remaining: number;
    sessions_goal_reached: boolean;
    minutes_goal: number;
    minutes_progress_percentage: number;
    minutes_remaining: number;
    minutes_goal_reached: boolean;
    category_breakdown: CategoryBreakdownItem[];
    daily_breakdown: DailyChartItem[];
}

interface FitnessInsight {
    type: string;
    title: string;
    description: string;
}

interface FitnessSummaryResponse {
    goals: FitnessGoals;
    today: TodaySummary;
    weekly: WeeklyAnalytics;
    insights: FitnessInsight[];
}

const CATEGORIES: { id: WorkoutCategory; label: string; icon: typeof Dumbbell }[] = [
    { id: "strength", label: "Strength", icon: Dumbbell },
    { id: "running", label: "Running", icon: Flame },
    { id: "walking", label: "Walking", icon: Footprints },
    { id: "cycling", label: "Cycling", icon: Bike },
    { id: "cardio", label: "Cardio", icon: HeartPulse },
    { id: "yoga", label: "Yoga & Stretch", icon: Flower2 },
    { id: "sports", label: "Sports", icon: Trophy },
    { id: "other", label: "Other", icon: Activity },
];

export default function Fitness() {
    const { user } = useAuth();

    const isWomens = user?.dashboard_type === "womens";
    const themeClass = isWomens ? "womens-theme" : "mens-theme";
    const dashboardLink = isWomens ? "/womens/dashboard" : "/mens/dashboard";

    const [summary, setSummary] = useState<FitnessSummaryResponse | null>(null);
    const [workouts, setWorkouts] = useState<Workout[]>([]);
    const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>("all");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    // Goal Editing state
    const [isEditingGoals, setIsEditingGoals] = useState(false);
    const [dailyMinGoalInput, setDailyMinGoalInput] = useState("45");
    const [weeklySessGoalInput, setWeeklySessGoalInput] = useState("4");
    const [weeklyMinGoalInput, setWeeklyMinGoalInput] = useState("180");

    // Workout Form state
    const getTodayDate = () => new Date().toISOString().split("T")[0];

    const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
    const [workoutName, setWorkoutName] = useState("Strength Training");
    const [category, setCategory] = useState<WorkoutCategory>("strength");
    const [workoutDate, setWorkoutDate] = useState(getTodayDate);
    const [startTime, setStartTime] = useState("");
    const [durationMinutes, setDurationMinutes] = useState("45");
    const [intensity, setIntensity] = useState<WorkoutIntensity | null>("moderate");
    const [notes, setNotes] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [sumRes, listRes] = await Promise.all([
                api.get<FitnessSummaryResponse>("/api/fitness/summary"),
                api.get<Workout[]>("/api/fitness/workouts"),
            ]);

            setSummary(sumRes.data);
            setWorkouts(listRes.data);

            setDailyMinGoalInput(String(sumRes.data.goals.daily_active_minutes_goal));
            setWeeklySessGoalInput(String(sumRes.data.goals.weekly_sessions_goal));
            setWeeklyMinGoalInput(String(sumRes.data.goals.weekly_active_minutes_goal));
        } catch (err: unknown) {
            const response = (
                err as { response?: { status?: number; data?: { detail?: string } } }
            ).response;

            if (response?.status === 401) {
                setError("Your session has expired. Please sign in again.");
            } else {
                setError(
                    response?.data?.detail ||
                        "Unable to load fitness and activity data. Please verify your connection."
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
                const [sumRes, listRes] = await Promise.all([
                    api.get<FitnessSummaryResponse>("/api/fitness/summary"),
                    api.get<Workout[]>("/api/fitness/workouts"),
                ]);

                if (!active) return;
                setSummary(sumRes.data);
                setWorkouts(listRes.data);

                setDailyMinGoalInput(String(sumRes.data.goals.daily_active_minutes_goal));
                setWeeklySessGoalInput(String(sumRes.data.goals.weekly_sessions_goal));
                setWeeklyMinGoalInput(String(sumRes.data.goals.weekly_active_minutes_goal));
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
                            "Unable to load fitness and activity data. Please verify your connection."
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

    function handleSelectCategory(cat: WorkoutCategory) {
        setCategory(cat);
        // If user hasn't typed a custom workout name, set default title
        const defaultNames: Record<WorkoutCategory, string> = {
            strength: "Strength Training",
            running: "Outdoor Run",
            walking: "Brisk Walk",
            cycling: "Cycling Session",
            cardio: "Cardio Conditioning",
            yoga: "Yoga & Flexibility",
            sports: "Sports Game",
            other: "Movement Session",
        };
        if (
            !workoutName.trim() ||
            Object.values(defaultNames).includes(workoutName)
        ) {
            setWorkoutName(defaultNames[cat]);
        }
    }

    function startEditWorkout(w: Workout) {
        setEditingWorkoutId(w.id);
        setWorkoutName(w.name);
        setCategory(w.category);
        setWorkoutDate(w.workout_date);
        setStartTime(w.start_time || "");
        setDurationMinutes(String(w.duration_minutes));
        setIntensity(w.intensity);
        setNotes(w.notes || "");
        window.scrollTo({ top: 350, behavior: "smooth" });
    }

    function cancelEdit() {
        setEditingWorkoutId(null);
        setWorkoutName("Strength Training");
        setCategory("strength");
        setWorkoutDate(getTodayDate());
        setStartTime("");
        setDurationMinutes("45");
        setIntensity("moderate");
        setNotes("");
    }

    async function handleWorkoutSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (saving) return;

        const dur = parseInt(durationMinutes, 10);
        if (!workoutName.trim()) {
            setError("Please enter an activity name.");
            return;
        }

        if (isNaN(dur) || dur < 1 || dur > 1440) {
            setError("Workout duration must be between 1 and 1,440 minutes.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        const payload = {
            name: workoutName.trim(),
            category,
            workout_date: workoutDate,
            start_time: startTime.trim() || null,
            duration_minutes: dur,
            intensity,
            notes: notes.trim() || null,
        };

        try {
            if (editingWorkoutId) {
                await api.put(`/api/fitness/workouts/${editingWorkoutId}`, payload);
                setMessage("Workout updated successfully!");
                cancelEdit();
            } else {
                await api.post("/api/fitness/workouts", payload);
                setMessage("Workout recorded successfully!");
                setNotes("");
            }
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not save workout record.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteWorkout(id: string) {
        if (saving) return;
        if (!window.confirm("Are you sure you want to delete this workout?")) return;

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.delete(`/api/fitness/workouts/${id}`);
            setMessage("Workout removed from history.");
            if (editingWorkoutId === id) cancelEdit();
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not delete workout.");
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveGoals(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (saving) return;

        const dailyMins = parseInt(dailyMinGoalInput, 10);
        const weeklySess = parseInt(weeklySessGoalInput, 10);
        const weeklyMins = parseInt(weeklyMinGoalInput, 10);

        if (isNaN(dailyMins) || dailyMins < 10 || dailyMins > 360) {
            setError("Daily active minutes goal must be between 10 and 360 minutes.");
            return;
        }
        if (isNaN(weeklySess) || weeklySess < 1 || weeklySess > 14) {
            setError("Weekly sessions goal must be between 1 and 14 sessions.");
            return;
        }
        if (isNaN(weeklyMins) || weeklyMins < 30 || weeklyMins > 1800) {
            setError("Weekly active minutes goal must be between 30 and 1,800 minutes.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.patch("/api/fitness/goals", {
                daily_active_minutes_goal: dailyMins,
                weekly_sessions_goal: weeklySess,
                weekly_active_minutes_goal: weeklyMins,
            });
            setMessage("Fitness & activity goals updated!");
            setIsEditingGoals(false);
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not update goals.");
        } finally {
            setSaving(false);
        }
    }

    // Filter workouts for display
    const filteredWorkouts = workouts.filter((w) => {
        if (selectedFilterCategory === "all") return true;
        return w.category === selectedFilterCategory;
    });

    const today = summary?.today;
    const weekly = summary?.weekly;
    const goals = summary?.goals;
    const insights = summary?.insights ?? [];

    const getCategoryIcon = (cat: WorkoutCategory) => {
        const found = CATEGORIES.find((c) => c.id === cat);
        return found ? found.icon : Activity;
    };

    return (
        <main className={`fitness-page ${themeClass}`}>
            <div className="fitness-container">
                {/* Topbar */}
                <header className="fitness-topbar">
                    <div className="hydration-brand-group">
                        <Link className="dashboard-brand" to={dashboardLink}>
                            HealthWiise
                        </Link>
                    </div>

                    <Link to={dashboardLink} className="hydration-back-link">
                        <ArrowLeft size={16} /> Back to Dashboard
                    </Link>
                </header>

                <div className="fitness-title-section">
                    <p className="eyebrow">MOVEMENT &amp; CONDITIONING</p>
                    <h1>Fitness &amp; Activity</h1>
                    <p className="muted">Build strength, stay active, and track your daily movement journey.</p>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="nutrition-error" role="alert" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <AlertCircle size={20} style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{error}</span>
                        <button
                            type="button"
                            className="hydration-secondary-btn"
                            onClick={() => void loadData()}
                            disabled={loading || saving}
                            style={{ marginLeft: "auto" }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {message && (
                    <div className="nutrition-success" role="status" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
                        <span>{message}</span>
                    </div>
                )}

                {/* Main 2-Column Layout */}
                <div className="fitness-grid-main">
                    {/* Left Column: Today's Summary, Goals, Weekly Stats */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {/* Today's Activity Card */}
                        <section className="fitness-card">
                            <div className="fitness-card-header">
                                <h2>
                                    <Activity size={22} /> Today's Movement
                                </h2>
                                <button
                                    type="button"
                                    className="hydration-secondary-btn"
                                    onClick={() => void loadData()}
                                    disabled={loading || saving}
                                >
                                    <RotateCw size={14} className={loading ? "spin-animation" : ""} />
                                    <span>{loading ? "Refreshing..." : "Refresh"}</span>
                                </button>
                            </div>

                            {loading && !summary ? (
                                <div style={{ padding: 20 }}>
                                    <div className="skeleton-line" style={{ width: "40%", margin: "0 auto 12px" }} />
                                    <div className="skeleton-line" style={{ width: "70%", margin: "0 auto" }} />
                                </div>
                            ) : (
                                <div className="fitness-hero-stat">
                                    <span className="sleep-badge" style={{ fontSize: 13, padding: "5px 12px" }}>
                                        {today?.session_count_today ?? 0} {today?.session_count_today === 1 ? "workout" : "workouts"} recorded today
                                    </span>

                                    <div className="fitness-hero-val">
                                        {today?.total_minutes_today ?? 0} <small style={{ fontSize: 24, fontWeight: 600 }}>mins</small>
                                    </div>

                                    <div className="fitness-hero-sub">
                                        Daily Target: {today?.daily_goal_minutes ?? 45} mins ({today?.daily_progress_percentage ?? 0}% achieved)
                                    </div>

                                    <div className="sleep-progress-bar-wrap" role="progressbar" aria-valuenow={today?.daily_progress_percentage ?? 0} aria-valuemin={0} aria-valuemax={100}>
                                        <div className="sleep-progress-bar-fill" style={{ width: `${Math.min(today?.daily_progress_percentage ?? 0, 100)}%` }} />
                                    </div>

                                    {today?.daily_goal_reached ? (
                                        <div className="hydration-goal-badge" style={{ marginTop: 8 }}>
                                            <CheckCircle2 size={16} />
                                            <span>Daily Target Met! Excellent work staying active today.</span>
                                        </div>
                                    ) : (
                                        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                                            {today?.daily_remaining_minutes ?? 0} mins remaining to meet today's goal
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Configured Activity Goals Section */}
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                                <div className="fitness-card-header" style={{ marginBottom: 10 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 750, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                                        <Target size={18} style={{ color: "var(--primary)" }} /> Activity Goals &amp; Progress
                                    </h3>
                                    {!isEditingGoals && (
                                        <button
                                            type="button"
                                            className="hydration-secondary-btn"
                                            onClick={() => setIsEditingGoals(true)}
                                            disabled={loading || saving}
                                        >
                                            Edit Goals
                                        </button>
                                    )}
                                </div>

                                {isEditingGoals ? (
                                    <form onSubmit={(e) => void handleSaveGoals(e)} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                                            <div className="sleep-form-group">
                                                <label style={{ fontSize: 12 }}>Daily Mins</label>
                                                <input
                                                    type="number"
                                                    min="10"
                                                    max="360"
                                                    className="sleep-input"
                                                    value={dailyMinGoalInput}
                                                    onChange={(e) => setDailyMinGoalInput(e.target.value)}
                                                    required
                                                    disabled={saving}
                                                />
                                            </div>

                                            <div className="sleep-form-group">
                                                <label style={{ fontSize: 12 }}>Weekly Sessions</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="14"
                                                    className="sleep-input"
                                                    value={weeklySessGoalInput}
                                                    onChange={(e) => setWeeklySessGoalInput(e.target.value)}
                                                    required
                                                    disabled={saving}
                                                />
                                            </div>

                                            <div className="sleep-form-group">
                                                <label style={{ fontSize: 12 }}>Weekly Mins</label>
                                                <input
                                                    type="number"
                                                    min="30"
                                                    max="1800"
                                                    className="sleep-input"
                                                    value={weeklyMinGoalInput}
                                                    onChange={(e) => setWeeklyMinGoalInput(e.target.value)}
                                                    required
                                                    disabled={saving}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="submit" className="hydration-action-btn" disabled={saving}>
                                                {saving ? "Saving..." : "Save Goals"}
                                            </button>
                                            <button
                                                type="button"
                                                className="hydration-secondary-btn"
                                                onClick={() => setIsEditingGoals(false)}
                                                disabled={saving}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="fitness-goals-row">
                                        <div className="fitness-goal-tile">
                                            <div className="fitness-goal-title">Daily Duration</div>
                                            <div className="fitness-goal-val">
                                                {today?.total_minutes_today ?? 0} <small>/ {goals?.daily_active_minutes_goal ?? 45}m</small>
                                            </div>
                                            <div className="fitness-goal-status">
                                                {today?.daily_goal_reached ? "Goal reached 🎉" : `${today?.daily_remaining_minutes ?? 0}m left`}
                                            </div>
                                        </div>

                                        <div className="fitness-goal-tile">
                                            <div className="fitness-goal-title">Weekly Sessions</div>
                                            <div className="fitness-goal-val">
                                                {weekly?.session_count ?? 0} <small>/ {goals?.weekly_sessions_goal ?? 4}</small>
                                            </div>
                                            <div className="fitness-goal-status">
                                                {weekly?.sessions_goal_reached ? "Goal reached 🎉" : `${weekly?.sessions_remaining ?? 0} to go`}
                                            </div>
                                        </div>

                                        <div className="fitness-goal-tile">
                                            <div className="fitness-goal-title">Weekly Duration</div>
                                            <div className="fitness-goal-val">
                                                {weekly?.total_minutes ?? 0} <small>/ {goals?.weekly_active_minutes_goal ?? 180}m</small>
                                            </div>
                                            <div className="fitness-goal-status">
                                                {weekly?.minutes_goal_reached ? "Goal reached 🎉" : `${weekly?.minutes_remaining ?? 0}m left`}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Weekly Statistics & Category Breakdown */}
                        <section className="fitness-card">
                            <div className="fitness-card-header">
                                <h2>
                                    <Flame size={22} /> Weekly Overview &amp; Trends
                                </h2>
                                <span className="water-history-badge">
                                    {weekly?.total_hours ?? 0} hrs total
                                </span>
                            </div>

                            <div className="sleep-metrics-grid" style={{ marginTop: 6 }}>
                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Weekly Active</div>
                                    <div className="sleep-metric-val">{weekly?.total_minutes ?? 0}m</div>
                                    <div className="sleep-metric-hint">{weekly?.total_hours ?? 0} hours</div>
                                </div>

                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Sessions</div>
                                    <div className="sleep-metric-val">{weekly?.session_count ?? 0}</div>
                                    <div className="sleep-metric-hint">Workouts logged</div>
                                </div>

                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Avg Session</div>
                                    <div className="sleep-metric-val">{weekly?.avg_duration_minutes ?? 0}m</div>
                                    <div className="sleep-metric-hint">Per workout</div>
                                </div>

                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Weekly Goal</div>
                                    <div className="sleep-metric-val">{weekly?.minutes_progress_percentage ?? 0}%</div>
                                    <div className="sleep-metric-hint">Target progress</div>
                                </div>
                            </div>

                            {/* 7-Day Movement Bar Chart */}
                            {weekly?.daily_breakdown && weekly.daily_breakdown.length > 0 && (
                                <div className="sleep-chart-section">
                                    <h3 style={{ fontSize: 14, fontWeight: 750, color: "var(--text)", margin: "0 0 4px" }}>
                                        Daily Workout Minutes vs. Daily Goal ({goals?.daily_active_minutes_goal ?? 45}m)
                                    </h3>
                                    <div className="sleep-chart-bars">
                                        {weekly.daily_breakdown.map((item) => {
                                            const maxRef = Math.max((goals?.daily_active_minutes_goal ?? 45) * 1.5, 90);
                                            const heightPct = Math.min((item.minutes / maxRef) * 100, 100);

                                            return (
                                                <div key={item.date} className="sleep-chart-col">
                                                    <span className="sleep-chart-val">{item.minutes > 0 ? `${item.minutes}m` : "—"}</span>
                                                    <div
                                                        className={`sleep-bar-pillar ${item.goal_reached ? "goal-met" : ""}`}
                                                        style={{ height: `${Math.max(heightPct, 8)}%` }}
                                                        title={`${item.date} (${item.day_name}): ${item.minutes} mins (${item.session_count} workouts)`}
                                                    />
                                                    <span className="sleep-chart-label">{item.day_name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Category Breakdown */}
                            {weekly?.category_breakdown && weekly.category_breakdown.length > 0 && (
                                <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 750, color: "var(--text)", margin: "0 0 10px" }}>
                                        Activity Category Breakdown
                                    </h3>
                                    <div className="fitness-cat-breakdown">
                                        {weekly.category_breakdown.map((catItem) => {
                                            const IconComp = getCategoryIcon(catItem.category);
                                            return (
                                                <div key={catItem.category} className="fitness-cat-row">
                                                    <div className="fitness-cat-row-label">
                                                        <IconComp size={16} style={{ color: "var(--primary)" }} />
                                                        <span>{catItem.label}</span>
                                                    </div>
                                                    <div className="fitness-cat-bar-bg">
                                                        <div className="fitness-cat-bar-fill" style={{ width: `${catItem.percentage}%` }} />
                                                    </div>
                                                    <span style={{ fontSize: 12.5, fontWeight: 750, color: "var(--text)", minWidth: 65, textAlign: "right" }}>
                                                        {catItem.total_minutes}m ({catItem.percentage}%)
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Personalized Insights */}
                            <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                                <h3 style={{ fontSize: 15, fontWeight: 750, color: "var(--text)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                                    <Sparkles size={18} style={{ color: "var(--primary)" }} /> Personalized Movement Insights
                                </h3>
                                <div className="sleep-insights-grid">
                                    {insights.map((ins, idx) => (
                                        <div key={idx} className="sleep-insight-card">
                                            <h4>{ins.title}</h4>
                                            <p>{ins.description}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right Column: Workout Logging Form & Workout History */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {/* Workout Logging / Edit Form Card */}
                        <section className="fitness-card">
                            <div className="fitness-card-header">
                                <h2>
                                    <Dumbbell size={22} />
                                    {editingWorkoutId ? "Edit Workout Session" : "Record Workout"}
                                </h2>
                                {editingWorkoutId && (
                                    <button
                                        type="button"
                                        className="hydration-secondary-btn"
                                        onClick={cancelEdit}
                                        style={{ fontSize: 12 }}
                                    >
                                        <X size={14} /> Cancel
                                    </button>
                                )}
                            </div>

                            <form onSubmit={(e) => void handleWorkoutSubmit(e)} className="sleep-form">
                                {/* Category Picker */}
                                <div className="sleep-form-group">
                                    <label>Select Activity Category</label>
                                    <div className="fitness-cat-grid">
                                        {CATEGORIES.map((c) => {
                                            const IconC = c.icon;
                                            const isSelected = category === c.id;
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    className={`fitness-cat-btn ${isSelected ? "selected" : ""}`}
                                                    onClick={() => handleSelectCategory(c.id)}
                                                    disabled={saving}
                                                >
                                                    <IconC />
                                                    <span>{c.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="workout-name">Activity / Workout Name</label>
                                    <input
                                        id="workout-name"
                                        type="text"
                                        className="sleep-input"
                                        value={workoutName}
                                        onChange={(e) => setWorkoutName(e.target.value)}
                                        placeholder="e.g. Leg Day, 5K Run, Vinyasa Flow"
                                        required
                                        disabled={saving}
                                    />
                                </div>

                                <div className="sleep-form-row">
                                    <div className="sleep-form-group">
                                        <label htmlFor="workout-date">Workout Date</label>
                                        <input
                                            id="workout-date"
                                            type="date"
                                            className="sleep-input"
                                            value={workoutDate}
                                            onChange={(e) => setWorkoutDate(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                    </div>

                                    <div className="sleep-form-group">
                                        <label htmlFor="start-time">Start Time (Optional)</label>
                                        <input
                                            id="start-time"
                                            type="time"
                                            className="sleep-input"
                                            value={startTime}
                                            onChange={(e) => setStartTime(e.target.value)}
                                            disabled={saving}
                                        />
                                    </div>
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="duration-mins">Duration (Minutes)</label>
                                    <input
                                        id="duration-mins"
                                        type="number"
                                        min="1"
                                        max="1440"
                                        className="sleep-input"
                                        value={durationMinutes}
                                        onChange={(e) => setDurationMinutes(e.target.value)}
                                        placeholder="e.g. 45"
                                        required
                                        disabled={saving}
                                    />
                                </div>

                                {/* Intensity Selector */}
                                <div className="sleep-form-group">
                                    <label>Intensity</label>
                                    <div className="fitness-intensity-row">
                                        {(["light", "moderate", "vigorous"] as WorkoutIntensity[]).map((lvl) => (
                                            <button
                                                key={lvl}
                                                type="button"
                                                className={`fitness-intensity-btn ${intensity === lvl ? "selected" : ""}`}
                                                onClick={() => setIntensity(lvl)}
                                                disabled={saving}
                                            >
                                                {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="workout-notes">Workout Notes &amp; Highlights (Optional)</label>
                                    <textarea
                                        id="workout-notes"
                                        className="sleep-textarea"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="e.g. Felt strong on squats, finished with stretching..."
                                        disabled={saving}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="hydration-action-btn"
                                    disabled={saving || !workoutName.trim()}
                                    style={{ width: "100%", marginTop: 4 }}
                                >
                                    {editingWorkoutId ? (
                                        <>
                                            <Edit3 size={16} />
                                            <span>{saving ? "Updating..." : "Update Workout"}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Plus size={16} />
                                            <span>{saving ? "Recording..." : "Save Workout Session"}</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </section>

                        {/* Workout History Card with Filter */}
                        <section className="fitness-card">
                            <div className="fitness-card-header">
                                <h2>
                                    <Clock size={20} /> Workout History
                                </h2>
                                <span className="water-history-badge">
                                    {filteredWorkouts.length} {filteredWorkouts.length === 1 ? "entry" : "entries"}
                                </span>
                            </div>

                            {/* Category Filter Pills */}
                            <div className="fitness-filter-bar">
                                <button
                                    type="button"
                                    className={`fitness-filter-pill ${selectedFilterCategory === "all" ? "active" : ""}`}
                                    onClick={() => setSelectedFilterCategory("all")}
                                >
                                    All ({workouts.length})
                                </button>
                                {CATEGORIES.map((cat) => {
                                    const count = workouts.filter((w) => w.category === cat.id).length;
                                    if (count === 0) return null;
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            className={`fitness-filter-pill ${selectedFilterCategory === cat.id ? "active" : ""}`}
                                            onClick={() => setSelectedFilterCategory(cat.id)}
                                        >
                                            {cat.label} ({count})
                                        </button>
                                    );
                                })}
                            </div>

                            {filteredWorkouts.length === 0 ? (
                                <div className="water-empty-state">
                                    <Dumbbell className="water-empty-icon" />
                                    <h3>No workouts found</h3>
                                    <p>
                                        {selectedFilterCategory === "all"
                                            ? "Record your first workout session using the form above to begin tracking your activity history!"
                                            : "No workouts recorded for this category yet."}
                                    </p>
                                </div>
                            ) : (
                                <div className="fitness-history-list" tabIndex={0} aria-label="Workout history list">
                                    {filteredWorkouts.map((w) => {
                                        const IconComp = getCategoryIcon(w.category);
                                        return (
                                            <div key={w.id} className="fitness-history-item">
                                                <div className="fitness-history-left">
                                                    <div className="fitness-history-icon" aria-hidden="true">
                                                        <IconComp size={22} />
                                                    </div>
                                                    <div className="fitness-history-details">
                                                        <h4>{w.name}</h4>
                                                        <p>
                                                            {w.workout_date} {w.start_time ? `• ${w.start_time}` : ""} • {w.duration_minutes} mins
                                                        </p>
                                                        <div className="fitness-history-tags">
                                                            <span className="sleep-badge">{w.category_label}</span>
                                                            {w.intensity && (
                                                                <span
                                                                    className="sleep-badge"
                                                                    style={{
                                                                        textTransform: "capitalize",
                                                                        color:
                                                                            w.intensity === "vigorous"
                                                                                ? "#b42318"
                                                                                : w.intensity === "moderate"
                                                                                ? "#b45309"
                                                                                : "var(--muted)",
                                                                    }}
                                                                >
                                                                    {w.intensity}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {w.notes && (
                                                            <p style={{ marginTop: 4, fontStyle: "italic", color: "var(--muted)", fontSize: 12 }}>
                                                                "{w.notes}"
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="fitness-action-btns">
                                                    <button
                                                        type="button"
                                                        className="fitness-icon-btn"
                                                        onClick={() => startEditWorkout(w)}
                                                        disabled={saving}
                                                        title="Edit workout"
                                                        aria-label={`Edit ${w.name}`}
                                                    >
                                                        <Edit3 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="fitness-icon-btn delete"
                                                        onClick={() => void handleDeleteWorkout(w.id)}
                                                        disabled={saving}
                                                        title="Delete workout"
                                                        aria-label={`Delete ${w.name}`}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
