import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
    Droplets,
    ArrowLeft,
    Plus,
    RotateCw,
    Trophy,
    GlassWater,
    CheckCircle2,
    AlertCircle,
    Calendar,
    Target,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

interface WaterEntry {
    id: string;
    amount_ml: number;
    recorded_at: string;
}

interface WaterEntriesResponse {
    date: string;
    total_ml: number;
    entries: WaterEntry[];
}

interface HydrationSummary {
    consumed_ml: number;
    goal_ml: number;
    percentage: number;
}

interface SummaryResponse {
    date: string;
    hydration: HydrationSummary;
}

export default function Hydration() {
    const { user } = useAuth();

    const isWomens = user?.dashboard_type === "womens";
    const themeClass = isWomens ? "womens-theme" : "mens-theme";
    const dashboardLink = isWomens ? "/womens/dashboard" : "/mens/dashboard";

    const [summary, setSummary] = useState<HydrationSummary | null>(null);
    const [entries, setEntries] = useState<WaterEntry[]>([]);
    const [totalWaterToday, setTotalWaterToday] = useState(0);

    const [customAmount, setCustomAmount] = useState("");
    const [goalInput, setGoalInput] = useState("2500");
    const [isEditingGoal, setIsEditingGoal] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [summaryRes, waterRes] = await Promise.all([
                api.get<SummaryResponse>("/api/nutrition/summary"),
                api.get<WaterEntriesResponse>("/api/nutrition/water"),
            ]);

            setSummary(summaryRes.data.hydration);
            setGoalInput(String(summaryRes.data.hydration.goal_ml || 2500));
            setEntries(waterRes.data.entries || []);
            setTotalWaterToday(waterRes.data.total_ml ?? summaryRes.data.hydration.consumed_ml ?? 0);
        } catch (err: unknown) {
            const response = (
                err as { response?: { status?: number; data?: { detail?: string } } }
            ).response;

            if (response?.status === 401) {
                setError("Your session has expired. Please sign in again.");
            } else {
                setError(
                    response?.data?.detail ||
                        "Unable to load hydration data. Please verify your connection or try again."
                );
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;

        async function fetchInitialData() {
            try {
                const [summaryRes, waterRes] = await Promise.all([
                    api.get<SummaryResponse>("/api/nutrition/summary"),
                    api.get<WaterEntriesResponse>("/api/nutrition/water"),
                ]);

                if (!active) return;
                setSummary(summaryRes.data.hydration);
                setGoalInput(String(summaryRes.data.hydration.goal_ml || 2500));
                setEntries(waterRes.data.entries || []);
                setTotalWaterToday(waterRes.data.total_ml ?? summaryRes.data.hydration.consumed_ml ?? 0);
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
                            "Unable to load hydration data. Please verify your connection or try again."
                    );
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        void fetchInitialData();

        return () => {
            active = false;
        };
    }, []);

    async function handleAddWater(amount: number) {
        if (saving) return;

        if (!Number.isInteger(amount) || amount <= 0 || amount > 5000) {
            setError("Please enter a valid water amount between 1 and 5,000 ml.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.post("/api/nutrition/water", {
                amount_ml: amount,
            });

            setMessage(`Added ${amount} ml of water!`);
            setCustomAmount("");
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not record water consumption.");
        } finally {
            setSaving(false);
        }
    }

    async function handleCustomSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const parsed = Number(customAmount);

        if (!customAmount.trim() || isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 5000) {
            setError("Please enter a whole number between 1 and 5,000 ml.");
            return;
        }

        await handleAddWater(parsed);
    }

    async function handleSaveGoal(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (saving) return;

        const parsedGoal = Number(goalInput);

        if (!goalInput.trim() || isNaN(parsedGoal) || !Number.isInteger(parsedGoal) || parsedGoal < 1 || parsedGoal > 10000) {
            setError("Daily hydration goal must be a whole number between 1 and 10,000 ml.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.patch("/api/nutrition/hydration-goal", {
                goal_ml: parsedGoal,
            });

            setMessage("Daily hydration goal updated successfully!");
            setIsEditingGoal(false);
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not update your daily hydration goal.");
        } finally {
            setSaving(false);
        }
    }

    function formatTime(isoString: string): string {
        try {
            const parsedIso = isoString.endsWith("Z") || isoString.includes("+")
                ? isoString
                : `${isoString}Z`;
            const date = new Date(parsedIso);
            return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        } catch {
            return "Earlier today";
        }
    }

    const consumed = summary?.consumed_ml ?? totalWaterToday;
    const goal = summary?.goal_ml ?? 2500;
    const percentage = summary?.percentage ?? (goal > 0 ? Math.round(Math.min((consumed / goal) * 100, 100) * 10) / 10 : 0);
    const remaining = Math.max(goal - consumed, 0);
    const isGoalReached = consumed >= goal && goal > 0;

    // SVG circular calculation: radius = 80, stroke circumference = 2 * PI * 80 ~= 502.65
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const progressOffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

    return (
        <main className={`hydration-page ${themeClass}`}>
            <div className="hydration-container">
                {/* Header Section */}
                <header className="hydration-topbar">
                    <div className="hydration-brand-group">
                        <Link className="dashboard-brand" to={dashboardLink}>
                            HealthWiise
                        </Link>
                    </div>

                    <Link to={dashboardLink} className="hydration-back-link">
                        <ArrowLeft size={16} /> Back to Dashboard
                    </Link>
                </header>

                <div className="hydration-title-section">
                    <p className="eyebrow">DAILY HYDRATION</p>
                    <h1>Hydration Tracker</h1>
                    <p className="muted">Stay hydrated, one glass at a time.</p>
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

                {/* Main Content Grid */}
                <div className="hydration-grid">
                    {/* Left Column: Summary & Progress */}
                    <section className="hydration-card hydration-summary-card">
                        <div className="hydration-card-header" style={{ width: "100%" }}>
                            <h2>
                                <Droplets size={22} /> Today's Progress
                            </h2>
                            <button
                                type="button"
                                className="hydration-secondary-btn"
                                onClick={() => void loadData()}
                                disabled={loading || saving}
                                title="Refresh hydration data"
                            >
                                <RotateCw size={14} className={loading ? "spin-animation" : ""} />
                                <span>{loading ? "Refreshing..." : "Refresh"}</span>
                            </button>
                        </div>

                        {loading && !summary ? (
                            <div style={{ width: "100%", padding: 20 }}>
                                <div className="skeleton-circle" />
                                <div className="skeleton-line" style={{ width: "60%", margin: "0 auto" }} />
                                <div className="skeleton-line" style={{ width: "40%", margin: "8px auto" }} />
                            </div>
                        ) : (
                            <>
                                {/* Circular Progress Indicator */}
                                <div className="hydration-circle-wrapper" role="region" aria-label="Hydration progress circle">
                                    <svg className="hydration-circle-svg" viewBox="0 0 190 190">
                                        <circle
                                            className="hydration-circle-bg"
                                            cx="95"
                                            cy="95"
                                            r={radius}
                                        />
                                        <circle
                                            className="hydration-circle-progress"
                                            cx="95"
                                            cy="95"
                                            r={radius}
                                            strokeDasharray={circumference}
                                            strokeDashoffset={progressOffset}
                                        />
                                    </svg>
                                    <div className="hydration-circle-inner">
                                        {isGoalReached ? (
                                            <Trophy size={28} style={{ color: "var(--primary)", marginBottom: 4 }} />
                                        ) : (
                                            <Droplets size={26} style={{ color: "var(--primary)", marginBottom: 4 }} />
                                        )}
                                        <span className="hydration-circle-percent">{percentage}%</span>
                                        <span className="hydration-circle-label">of daily goal</span>
                                    </div>
                                </div>

                                {isGoalReached && (
                                    <div className="hydration-goal-badge">
                                        <CheckCircle2 size={16} />
                                        <span>Daily Goal Achieved! Great job staying hydrated today.</span>
                                    </div>
                                )}

                                {/* Today's Stats Row */}
                                <div className="hydration-stats-row">
                                    <div className="hydration-stat-pill">
                                        <div className="hydration-stat-label">Consumed</div>
                                        <div className="hydration-stat-val">{consumed.toLocaleString()} ml</div>
                                        <div className="hydration-stat-sub">{(consumed / 1000).toFixed(2)} L</div>
                                    </div>

                                    <div className="hydration-stat-pill">
                                        <div className="hydration-stat-label">Daily Goal</div>
                                        <div className="hydration-stat-val">{goal.toLocaleString()} ml</div>
                                        <div className="hydration-stat-sub">{(goal / 1000).toFixed(2)} L</div>
                                    </div>

                                    <div className="hydration-stat-pill">
                                        <div className="hydration-stat-label">Remaining</div>
                                        <div className="hydration-stat-val">
                                            {isGoalReached ? "0 ml" : `${remaining.toLocaleString()} ml`}
                                        </div>
                                        <div className="hydration-stat-sub">
                                            {isGoalReached ? "Goal met 🎉" : `${(remaining / 1000).toFixed(2)} L`}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Daily Goal Settings */}
                        <div className="goal-section" style={{ width: "100%" }}>
                            <div className="hydration-card-header" style={{ marginBottom: 8 }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                                    <Target size={18} style={{ color: "var(--primary)" }} /> Daily Goal Settings
                                </h3>
                                {!isEditingGoal && (
                                    <button
                                        type="button"
                                        className="hydration-secondary-btn"
                                        onClick={() => {
                                            setGoalInput(String(goal));
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
                                        className="goal-edit-input"
                                        min={1}
                                        max={10000}
                                        value={goalInput}
                                        onChange={(e) => setGoalInput(e.target.value)}
                                        placeholder="e.g. 2500"
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
                                        <h3>{goal.toLocaleString()} ml <small style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>({(goal / 1000).toFixed(2)} L)</small></h3>
                                        <p>Custom daily target persisted in your profile.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Right Column: Quick Add & Water History */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {/* Quick Add Water Card */}
                        <section className="hydration-card">
                            <div className="hydration-card-header">
                                <h2>
                                    <GlassWater size={22} /> Quick Add Water
                                </h2>
                            </div>

                            <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
                                Select a standard portion to quickly log your water intake:
                            </p>

                            <div className="quick-add-grid">
                                <button
                                    type="button"
                                    className="quick-add-btn"
                                    onClick={() => void handleAddWater(150)}
                                    disabled={saving || loading}
                                >
                                    <GlassWater size={22} />
                                    <span className="amount-label">+150 ml</span>
                                    <span className="desc-label">Small Glass</span>
                                </button>

                                <button
                                    type="button"
                                    className="quick-add-btn"
                                    onClick={() => void handleAddWater(250)}
                                    disabled={saving || loading}
                                >
                                    <GlassWater size={24} />
                                    <span className="amount-label">+250 ml</span>
                                    <span className="desc-label">Standard Cup</span>
                                </button>

                                <button
                                    type="button"
                                    className="quick-add-btn"
                                    onClick={() => void handleAddWater(350)}
                                    disabled={saving || loading}
                                >
                                    <Droplets size={24} />
                                    <span className="amount-label">+350 ml</span>
                                    <span className="desc-label">Mug / Flask</span>
                                </button>

                                <button
                                    type="button"
                                    className="quick-add-btn"
                                    onClick={() => void handleAddWater(500)}
                                    disabled={saving || loading}
                                >
                                    <Droplets size={26} />
                                    <span className="amount-label">+500 ml</span>
                                    <span className="desc-label">Water Bottle</span>
                                </button>
                            </div>

                            {/* Custom Amount Field */}
                            <div className="custom-add-container">
                                <label htmlFor="custom-water-amount" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                                    Or enter a custom amount (ml):
                                </label>
                                <form onSubmit={(e) => void handleCustomSubmit(e)} className="custom-add-form">
                                    <input
                                        id="custom-water-amount"
                                        type="number"
                                        min={1}
                                        max={5000}
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="Amount in ml (e.g. 400)"
                                        disabled={saving || loading}
                                    />
                                    <button
                                        type="submit"
                                        className="hydration-action-btn"
                                        disabled={saving || loading || !customAmount.trim()}
                                    >
                                        <Plus size={16} />
                                        <span>{saving ? "Adding..." : "Add Water"}</span>
                                    </button>
                                </form>
                            </div>
                        </section>

                        {/* Today's Water History Card */}
                        <section className="hydration-card">
                            <div className="hydration-card-header">
                                <h2>
                                    <Calendar size={20} /> Today's History
                                </h2>
                                <span className="water-history-badge">
                                    {entries.length} {entries.length === 1 ? "entry" : "entries"} &bull; {totalWaterToday} ml
                                </span>
                            </div>

                            {loading && entries.length === 0 ? (
                                <div style={{ padding: 16 }}>
                                    <div className="skeleton-line" />
                                    <div className="skeleton-line" />
                                    <div className="skeleton-line" />
                                </div>
                            ) : entries.length === 0 ? (
                                <div className="water-empty-state">
                                    <Droplets className="water-empty-icon" />
                                    <h3>No water logged yet today</h3>
                                    <p>Start your day with a fresh glass of water. Quick add an amount above to begin tracking!</p>
                                </div>
                            ) : (
                                <div className="water-history-list" tabIndex={0} aria-label="List of water logs for today">
                                    {entries.map((entry) => (
                                        <div key={entry.id} className="water-history-item">
                                            <div className="water-history-left">
                                                <div className="water-history-icon" aria-hidden="true">
                                                    <Droplets size={18} />
                                                </div>
                                                <div className="water-history-details">
                                                    <h4>+{entry.amount_ml} ml</h4>
                                                    <span>{formatTime(entry.recorded_at)}</span>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--muted)" }}>
                                                {(entry.amount_ml / 1000).toFixed(2)} L
                                            </span>
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
