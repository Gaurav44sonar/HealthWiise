import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
    Moon,
    ArrowLeft,
    Clock,
    Sparkles,
    Star,
    Target,
    RotateCw,
    TrendingUp,
    AlertCircle,
    CheckCircle2,
    Trash2,
    Activity,
    Plus,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import AISleepInsightsCard from "../components/AISleepInsightsCard";
import type { AISleepInsightsResponse } from "../types/aiSleep";

interface SleepRecord {
    id: string;
    sleep_date: string;
    bedtime: string;
    wake_time: string;
    time_in_bed_minutes: number;
    awake_minutes: number;
    sleep_duration_minutes: number;
    sleep_efficiency: number;
    quality: number | null;
    restedness: number | null;
    notes: string | null;
    created_at: string;
}

interface WeeklyAnalytics {
    total_logged_nights: number;
    avg_sleep_duration_minutes: number;
    avg_sleep_duration_hours: number;
    avg_sleep_efficiency: number;
    avg_quality: number | null;
    avg_restedness: number | null;
    goal_achievement_rate: number;
}

interface SleepInsight {
    type: string;
    title: string;
    description: string;
}

interface SleepSummaryResponse {
    goal_minutes: number;
    latest_record: SleepRecord | null;
    goal_progress_percentage: number;
    weekly_analytics: WeeklyAnalytics;
    recent_entries: SleepRecord[];
    insights: SleepInsight[];
}

export default function Sleep() {
    const { user } = useAuth();

    const isWomens = user?.dashboard_type === "womens";
    const themeClass = isWomens ? "womens-theme" : "mens-theme";
    const dashboardLink = isWomens ? "/womens/dashboard" : "/mens/dashboard";

    const [summary, setSummary] = useState<SleepSummaryResponse | null>(null);
    const [aiInsights, setAiInsights] = useState<AISleepInsightsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [aiLoading, setAiLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [aiError, setAiError] = useState("");
    const [message, setMessage] = useState("");

    // Goal editing state
    const [isEditingGoal, setIsEditingGoal] = useState(false);
    const [goalHoursInput, setGoalHoursInput] = useState("8.0");

    // Form inputs
    const getYesterdayDate = () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split("T")[0];
    };

    const [sleepDate, setSleepDate] = useState(getYesterdayDate);
    const [bedtimeTime, setBedtimeTime] = useState("22:30");
    const [bedtimeAfterMidnight, setBedtimeAfterMidnight] = useState(false);
    const [wakeTime, setWakeTime] = useState("06:30");
    const [awakeMinutes, setAwakeMinutes] = useState("0");
    const [quality, setQuality] = useState<number | null>(4);
    const [restedness, setRestedness] = useState<number | null>(4);
    const [notes, setNotes] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setAiLoading(true);
        setError("");
        setAiError("");

        try {
            const [summaryRes, aiRes] = await Promise.allSettled([
                api.get<SleepSummaryResponse>("/api/sleep/summary"),
                api.get<AISleepInsightsResponse>("/api/ai/sleep-insights"),
            ]);

            if (summaryRes.status === "fulfilled") {
                setSummary(summaryRes.value.data);
                setGoalHoursInput((summaryRes.value.data.goal_minutes / 60).toFixed(1));
            } else {
                const response = (
                    summaryRes.reason as { response?: { status?: number; data?: { detail?: string } } }
                ).response;

                if (response?.status === 401) {
                    setError("Your session has expired. Please sign in again.");
                } else {
                    setError(
                        response?.data?.detail ||
                            "Unable to load sleep and recovery data. Please check your connection."
                    );
                }
            }

            if (aiRes.status === "fulfilled") {
                setAiInsights(aiRes.value.data);
            } else {
                setAiError("Unable to load AI sleep insights. Please retry.");
            }
        } finally {
            setLoading(false);
            setAiLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;

        async function fetchInitial() {
            try {
                const [summaryRes, aiRes] = await Promise.allSettled([
                    api.get<SleepSummaryResponse>("/api/sleep/summary"),
                    api.get<AISleepInsightsResponse>("/api/ai/sleep-insights"),
                ]);

                if (!active) return;

                if (summaryRes.status === "fulfilled") {
                    setSummary(summaryRes.value.data);
                    setGoalHoursInput((summaryRes.value.data.goal_minutes / 60).toFixed(1));
                }
                if (aiRes.status === "fulfilled") {
                    setAiInsights(aiRes.value.data);
                }
            } catch {
                if (!active) return;
            } finally {
                if (active) {
                    setLoading(false);
                    setAiLoading(false);
                }
            }
        }

        void fetchInitial();

        return () => {
            active = false;
        };
    }, []);

    // Live preview calculation helper
    function calculatePreview() {
        if (!sleepDate || !bedtimeTime || !wakeTime) return null;

        try {
            // Wake date is the morning of the day after sleepDate, or same day if slept after midnight
            const sleepD = new Date(sleepDate);
            const wakeD = new Date(sleepDate);
            wakeD.setDate(wakeD.getDate() + 1);

            const [bH, bM] = bedtimeTime.split(":").map(Number);
            const [wH, wM] = wakeTime.split(":").map(Number);

            const bedtimeDate = new Date(bedtimeAfterMidnight ? wakeD : sleepD);
            bedtimeDate.setHours(bH, bM, 0, 0);

            const wakeDateObj = new Date(wakeD);
            wakeDateObj.setHours(wH, wM, 0, 0);

            const diffMins = Math.round((wakeDateObj.getTime() - bedtimeDate.getTime()) / (1000 * 60));
            const awake = Math.max(Number(awakeMinutes) || 0, 0);

            if (diffMins <= 0 || diffMins > 1440) return null;
            if (awake >= diffMins) return null;

            const sleepDuration = diffMins - awake;
            const efficiency = Math.round((sleepDuration / diffMins) * 1000) / 10;

            const bedHours = Math.floor(diffMins / 60);
            const bedRemainingMins = diffMins % 60;

            const sleepHours = Math.floor(sleepDuration / 60);
            const sleepRemainingMins = sleepDuration % 60;

            return {
                timeInBedStr: `${bedHours}h ${bedRemainingMins > 0 ? `${bedRemainingMins}m` : ""}`,
                sleepDurationStr: `${sleepHours}h ${sleepRemainingMins > 0 ? `${sleepRemainingMins}m` : ""}`,
                efficiency,
            };
        } catch {
            return null;
        }
    }

    const preview = calculatePreview();

    async function handleLogSleep(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (saving) return;

        setError("");
        setMessage("");

        const sleepD = new Date(sleepDate);
        const wakeD = new Date(sleepDate);
        wakeD.setDate(wakeD.getDate() + 1);

        const [bH, bM] = bedtimeTime.split(":").map(Number);
        const [wH, wM] = wakeTime.split(":").map(Number);

        const bedtimeDate = new Date(bedtimeAfterMidnight ? wakeD : sleepD);
        bedtimeDate.setHours(bH, bM, 0, 0);

        const wakeDateObj = new Date(wakeD);
        wakeDateObj.setHours(wH, wM, 0, 0);

        if (wakeDateObj <= bedtimeDate) {
            setError("Wake time must be later than bedtime.");
            return;
        }

        const awake = Number(awakeMinutes) || 0;
        const diffMins = (wakeDateObj.getTime() - bedtimeDate.getTime()) / (1000 * 60);

        if (awake >= diffMins) {
            setError("Time spent awake cannot exceed time in bed.");
            return;
        }

        setSaving(true);

        try {
            await api.post("/api/sleep/records", {
                sleep_date: sleepDate,
                bedtime: bedtimeDate.toISOString(),
                wake_time: wakeDateObj.toISOString(),
                awake_minutes: awake,
                quality,
                restedness,
                notes: notes.trim() || null,
            });

            setMessage("Sleep record saved successfully!");
            setNotes("");
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not record sleep.");
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveGoal(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (saving) return;

        const hours = parseFloat(goalHoursInput);
        if (isNaN(hours) || hours < 3 || hours > 14) {
            setError("Please enter a sleep goal between 3 and 14 hours.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            const goalMinutes = Math.round(hours * 60);
            await api.patch("/api/sleep/goal", { goal_minutes: goalMinutes });
            setMessage("Daily sleep goal updated!");
            setIsEditingGoal(false);
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not update sleep goal.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteRecord(id: string) {
        if (saving) return;
        if (!window.confirm("Are you sure you want to delete this sleep entry?")) return;

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.delete(`/api/sleep/records/${id}`);
            setMessage("Sleep entry removed.");
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not delete sleep record.");
        } finally {
            setSaving(false);
        }
    }

    function formatTime(isoString: string): string {
        try {
            const parsed = isoString.endsWith("Z") || isoString.includes("+") ? isoString : `${isoString}Z`;
            return new Date(parsed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        } catch {
            return "";
        }
    }

    function formatDuration(minutes: number): string {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m > 0 ? `${m}m` : ""}`.trim();
    }

    const goalMins = summary?.goal_minutes ?? 480;
    const latest = summary?.latest_record;
    const latestDuration = latest?.sleep_duration_minutes ?? 0;
    const goalPercentage = summary?.goal_progress_percentage ?? 0;
    const analytics = summary?.weekly_analytics;
    const recentEntries = summary?.recent_entries ?? [];
    const insights = summary?.insights ?? [];

    const restedLabels: Record<number, string> = {
        1: "Exhausted",
        2: "Tired",
        3: "Neutral",
        4: "Refreshed",
        5: "Energized",
    };

    return (
        <main className={`sleep-page ${themeClass}`}>
            <div className="sleep-container">
                {/* Header */}
                <header className="sleep-topbar">
                    <div className="hydration-brand-group">
                        <Link className="dashboard-brand" to={dashboardLink}>
                            HealthWiise
                        </Link>
                    </div>

                    <Link to={dashboardLink} className="hydration-back-link">
                        <ArrowLeft size={16} /> Back to Dashboard
                    </Link>
                </header>

                <div className="sleep-title-section">
                    <p className="eyebrow">REST &amp; RECOVERY</p>
                    <h1>Sleep &amp; Recovery Tracker</h1>
                    <p className="muted">Monitor restorative rest, understand sleep patterns, and optimize recovery.</p>
                </div>

                {/* Feedback Alerts */}
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

                {/* Main 2-Column Grid */}
                <div className="sleep-grid-main">
                    {/* Left Column: Latest Sleep & Weekly Analytics */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {/* Latest Sleep & Goal Card */}
                        <section className="sleep-card">
                            <div className="sleep-card-header">
                                <h2>
                                    <Moon size={22} /> Latest Sleep Summary
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
                            ) : latest ? (
                                <div className="sleep-hero-section">
                                    <span className="sleep-badge" style={{ fontSize: 13, padding: "5px 12px" }}>
                                        {latest.sleep_date} • {formatTime(latest.bedtime)} → {formatTime(latest.wake_time)}
                                    </span>

                                    <div className="sleep-hero-duration">
                                        {formatDuration(latestDuration)}
                                    </div>

                                    <div className="sleep-hero-sub">
                                        Goal: {formatDuration(goalMins)} ({goalPercentage}% achieved)
                                    </div>

                                    <div className="sleep-progress-bar-wrap" role="progressbar" aria-valuenow={goalPercentage} aria-valuemin={0} aria-valuemax={100}>
                                        <div className="sleep-progress-bar-fill" style={{ width: `${Math.min(goalPercentage, 100)}%` }} />
                                    </div>

                                    {latestDuration >= goalMins ? (
                                        <div className="hydration-goal-badge" style={{ marginTop: 12 }}>
                                            <CheckCircle2 size={16} />
                                            <span>Target Reached! Restorative sleep goal met.</span>
                                        </div>
                                    ) : (
                                        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                                            {formatDuration(goalMins - latestDuration)} short of daily goal
                                        </p>
                                    )}

                                    {/* Breakdown Metrics */}
                                    <div className="sleep-metrics-grid">
                                        <div className="sleep-metric-tile">
                                            <div className="sleep-metric-title">Time in Bed</div>
                                            <div className="sleep-metric-val">{formatDuration(latest.time_in_bed_minutes)}</div>
                                            <div className="sleep-metric-hint">Total rest period</div>
                                        </div>

                                        <div className="sleep-metric-tile">
                                            <div className="sleep-metric-title">Efficiency</div>
                                            <div className="sleep-metric-val">{latest.sleep_efficiency}%</div>
                                            <div className="sleep-metric-hint">{latest.awake_minutes}m awake</div>
                                        </div>

                                        <div className="sleep-metric-tile">
                                            <div className="sleep-metric-title">Quality</div>
                                            <div className="sleep-metric-val" style={{ color: "#eab308" }}>
                                                {latest.quality ? "★".repeat(latest.quality) : "N/A"}
                                            </div>
                                            <div className="sleep-metric-hint">{latest.quality ? `${latest.quality} of 5` : "Unrated"}</div>
                                        </div>

                                        <div className="sleep-metric-tile">
                                            <div className="sleep-metric-title">Restedness</div>
                                            <div className="sleep-metric-val" style={{ fontSize: 15 }}>
                                                {latest.restedness ? restedLabels[latest.restedness] : "N/A"}
                                            </div>
                                            <div className="sleep-metric-hint">{latest.restedness ? `${latest.restedness}/5` : "Unrated"}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="water-empty-state">
                                    <Moon className="water-empty-icon" />
                                    <h3>No sleep records logged yet</h3>
                                    <p>Log your sleep in the form on the right to start seeing your sleep metrics and restorative progress!</p>
                                </div>
                            )}

                            {/* Sleep Goal Setting Header/Display */}
                            <div className="goal-section" style={{ width: "100%", marginTop: 16 }}>
                                <div className="hydration-card-header" style={{ marginBottom: 6 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                                        <Target size={18} style={{ color: "var(--primary)" }} /> Sleep Duration Goal
                                    </h3>
                                    {!isEditingGoal && (
                                        <button
                                            type="button"
                                            className="hydration-secondary-btn"
                                            onClick={() => {
                                                setGoalHoursInput((goalMins / 60).toFixed(1));
                                                setIsEditingGoal(true);
                                            }}
                                            disabled={loading || saving}
                                        >
                                            Edit Goal
                                        </button>
                                    )}
                                </div>

                                {isEditingGoal ? (
                                    <form onSubmit={(e) => void handleSaveGoal(e)} className="goal-edit-form">
                                        <input
                                            type="number"
                                            step="0.5"
                                            className="goal-edit-input"
                                            min="3"
                                            max="14"
                                            value={goalHoursInput}
                                            onChange={(e) => setGoalHoursInput(e.target.value)}
                                            placeholder="e.g. 8.0"
                                            required
                                            disabled={saving}
                                        />
                                        <button type="submit" className="hydration-action-btn" disabled={saving}>
                                            {saving ? "Saving..." : "Save Goal"}
                                        </button>
                                        <button
                                            type="button"
                                            className="hydration-secondary-btn"
                                            onClick={() => setIsEditingGoal(false)}
                                            disabled={saving}
                                        >
                                            Cancel
                                        </button>
                                    </form>
                                ) : (
                                    <div className="goal-display-box">
                                        <div className="goal-display-info">
                                            <h3>{(goalMins / 60).toFixed(1)} hours <small style={{ fontSize: 13, color: "var(--muted)" }}>({goalMins} minutes)</small></h3>
                                            <p>Target duration used for daily wellness calculations.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* AI Sleep Insights Card */}
                        <AISleepInsightsCard
                            insights={aiInsights}
                            loading={aiLoading}
                            error={aiError}
                            onRefresh={() => void loadData()}
                            themeClass={themeClass}
                        />

                        {/* Weekly Analytics & Chart Card */}
                        <section className="sleep-card">
                            <div className="sleep-card-header">
                                <h2>
                                    <TrendingUp size={22} /> Weekly Analytics &amp; Patterns
                                </h2>
                                <span className="water-history-badge">
                                    {analytics?.total_logged_nights ?? 0} nights logged
                                </span>
                            </div>

                            <div className="sleep-metrics-grid" style={{ marginTop: 8 }}>
                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Avg Duration</div>
                                    <div className="sleep-metric-val">{analytics?.avg_sleep_duration_hours ?? 0}h</div>
                                    <div className="sleep-metric-hint">Per night</div>
                                </div>

                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Avg Efficiency</div>
                                    <div className="sleep-metric-val">{analytics?.avg_sleep_efficiency ?? 0}%</div>
                                    <div className="sleep-metric-hint">Rest ratio</div>
                                </div>

                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Avg Quality</div>
                                    <div className="sleep-metric-val" style={{ color: "#eab308" }}>
                                        {analytics?.avg_quality ? `★ ${analytics.avg_quality}` : "—"}
                                    </div>
                                    <div className="sleep-metric-hint">Out of 5</div>
                                </div>

                                <div className="sleep-metric-tile">
                                    <div className="sleep-metric-title">Goal Success</div>
                                    <div className="sleep-metric-val">{analytics?.goal_achievement_rate ?? 0}%</div>
                                    <div className="sleep-metric-hint">Of recent nights</div>
                                </div>
                            </div>

                            {/* 7-Night Visual Bar Chart */}
                            {recentEntries.length > 0 && (
                                <div className="sleep-chart-section">
                                    <h3 style={{ fontSize: 14, fontWeight: 750, color: "var(--text)", margin: "0 0 4px" }}>
                                        Recent Night Patterns vs. Goal ({(goalMins / 60).toFixed(1)}h)
                                    </h3>
                                    <div className="sleep-chart-bars">
                                        {recentEntries.slice(0, 7).reverse().map((entry) => {
                                            const durationH = entry.sleep_duration_minutes / 60;
                                            const maxRefH = Math.max((goalMins / 60) * 1.3, 10);
                                            const heightPercent = Math.min((durationH / maxRefH) * 100, 100);
                                            const isGoalMet = entry.sleep_duration_minutes >= goalMins;

                                            return (
                                                <div key={entry.id} className="sleep-chart-col">
                                                    <span className="sleep-chart-val">{durationH.toFixed(1)}h</span>
                                                    <div
                                                        className={`sleep-bar-pillar ${isGoalMet ? "goal-met" : ""}`}
                                                        style={{ height: `${Math.max(heightPercent, 12)}%` }}
                                                        title={`${entry.sleep_date}: ${durationH.toFixed(1)} hrs (${isGoalMet ? "Goal met" : "Below goal"})`}
                                                    />
                                                    <span className="sleep-chart-label">
                                                        {entry.sleep_date.slice(5)}
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
                                    <Sparkles size={18} style={{ color: "var(--primary)" }} /> Personalized Wellness Insights
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

                    {/* Right Column: Log Sleep Form & History */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {/* Sleep Logging Form Card */}
                        <section className="sleep-card">
                            <div className="sleep-card-header">
                                <h2>
                                    <Clock size={22} /> Record Sleep Session
                                </h2>
                            </div>

                            <form onSubmit={(e) => void handleLogSleep(e)} className="sleep-form">
                                <div className="sleep-form-group">
                                    <label htmlFor="sleep-date">Sleep Date (Night of)</label>
                                    <input
                                        id="sleep-date"
                                        type="date"
                                        className="sleep-input"
                                        value={sleepDate}
                                        onChange={(e) => setSleepDate(e.target.value)}
                                        required
                                        disabled={saving}
                                    />
                                </div>

                                <div className="sleep-form-row">
                                    <div className="sleep-form-group">
                                        <label htmlFor="bedtime-time">Bedtime</label>
                                        <input
                                            id="bedtime-time"
                                            type="time"
                                            className="sleep-input"
                                            value={bedtimeTime}
                                            onChange={(e) => setBedtimeTime(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                    </div>

                                    <div className="sleep-form-group">
                                        <label htmlFor="wake-time">Wake-Up Time</label>
                                        <input
                                            id="wake-time"
                                            type="time"
                                            className="sleep-input"
                                            value={wakeTime}
                                            onChange={(e) => setWakeTime(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input
                                        id="midnight-check"
                                        type="checkbox"
                                        checked={bedtimeAfterMidnight}
                                        onChange={(e) => setBedtimeAfterMidnight(e.target.checked)}
                                        disabled={saving}
                                        style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
                                    />
                                    <label htmlFor="midnight-check" style={{ fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
                                        Went to bed after midnight (e.g., 1:00 AM)
                                    </label>
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="awake-mins">Time Awake During Night (minutes)</label>
                                    <input
                                        id="awake-mins"
                                        type="number"
                                        min="0"
                                        max="360"
                                        className="sleep-input"
                                        value={awakeMinutes}
                                        onChange={(e) => setAwakeMinutes(e.target.value)}
                                        placeholder="0"
                                        disabled={saving}
                                    />
                                </div>

                                {/* Live Auto-calculation Preview */}
                                {preview && (
                                    <div className="sleep-calc-preview">
                                        <span>In bed: <strong>{preview.timeInBedStr}</strong></span>
                                        <span>Sleep: <strong>{preview.sleepDurationStr}</strong></span>
                                        <span>Efficiency: <strong>{preview.efficiency}%</strong></span>
                                    </div>
                                )}

                                {/* Sleep Quality Rating (1 to 5) */}
                                <div className="sleep-form-group">
                                    <label>Sleep Quality Rating</label>
                                    <div className="sleep-rating-stars">
                                        {[1, 2, 3, 4, 5].map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                className={`sleep-star-btn ${(quality ?? 0) >= s ? "active" : ""}`}
                                                onClick={() => setQuality(s)}
                                                disabled={saving}
                                                title={`${s} star`}
                                            >
                                                <Star size={24} fill={(quality ?? 0) >= s ? "#eab308" : "none"} />
                                            </button>
                                        ))}
                                        <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 6 }}>
                                            {quality ? `${quality}/5` : "Select"}
                                        </span>
                                    </div>
                                </div>

                                {/* Restedness Upon Waking (1 to 5) */}
                                <div className="sleep-form-group">
                                    <label>Restedness Upon Waking</label>
                                    <div className="sleep-rested-pills">
                                        {[1, 2, 3, 4, 5].map((r) => (
                                            <button
                                                key={r}
                                                type="button"
                                                className={`sleep-rested-pill ${restedness === r ? "selected" : ""}`}
                                                onClick={() => setRestedness(r)}
                                                disabled={saving}
                                            >
                                                {restedLabels[r]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="sleep-form-group">
                                    <label htmlFor="sleep-notes">Notes &amp; Recovery Factors (Optional)</label>
                                    <textarea
                                        id="sleep-notes"
                                        className="sleep-textarea"
                                        placeholder="e.g. Evening reading, herbal tea, cool room..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        disabled={saving}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="hydration-action-btn"
                                    disabled={saving || !preview}
                                    style={{ width: "100%", marginTop: 4 }}
                                >
                                    <Plus size={16} />
                                    <span>{saving ? "Saving Record..." : "Log Sleep Session"}</span>
                                </button>
                            </form>
                        </section>

                        {/* Recent Sleep History List */}
                        <section className="sleep-card">
                            <div className="sleep-card-header">
                                <h2>
                                    <Activity size={20} /> Sleep History
                                </h2>
                                <span className="water-history-badge">
                                    {recentEntries.length} {recentEntries.length === 1 ? "record" : "records"}
                                </span>
                            </div>

                            {recentEntries.length === 0 ? (
                                <div className="water-empty-state">
                                    <Clock className="water-empty-icon" />
                                    <h3>No sleep history yet</h3>
                                    <p>Your logged sleep sessions will appear here with duration, efficiency, and ratings.</p>
                                </div>
                            ) : (
                                <div className="sleep-history-list" tabIndex={0} aria-label="Recent sleep history list">
                                    {recentEntries.map((record) => (
                                        <div key={record.id} className="sleep-history-item">
                                            <div className="sleep-history-main">
                                                <div className="sleep-history-icon" aria-hidden="true">
                                                    <Moon size={20} />
                                                </div>
                                                <div className="sleep-history-info">
                                                    <h4>
                                                        {formatDuration(record.sleep_duration_minutes)}{" "}
                                                        <small style={{ fontSize: 13, fontWeight: 550, color: "var(--muted)" }}>
                                                            ({record.sleep_date})
                                                        </small>
                                                    </h4>
                                                    <p>
                                                        {formatTime(record.bedtime)} → {formatTime(record.wake_time)} • {record.sleep_efficiency}% eff
                                                    </p>
                                                    <div className="sleep-history-badges">
                                                        {record.quality && (
                                                            <span className="sleep-badge" style={{ color: "#b45309" }}>
                                                                ★ {record.quality}/5
                                                            </span>
                                                        )}
                                                        {record.restedness && (
                                                            <span className="sleep-badge">
                                                                {restedLabels[record.restedness]}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {record.notes && (
                                                        <p style={{ marginTop: 4, fontStyle: "italic", color: "var(--muted)", fontSize: 12 }}>
                                                            "{record.notes}"
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className="sleep-delete-btn"
                                                onClick={() => void handleDeleteRecord(record.id)}
                                                disabled={saving}
                                                title="Delete this sleep record"
                                                aria-label={`Delete record for ${record.sleep_date}`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}
