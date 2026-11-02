import { useEffect, useState } from "react";
import {
    CalendarDays,
    Dumbbell,
    Loader2,
    Sparkles,
    Utensils,
    Target,
    SlidersHorizontal,
    Coffee,
    Apple,
    Flame,
    Clock,
    RotateCw,
    ShieldAlert,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Info,
} from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import AppNavbar from "../components/AppNavbar";

interface PlanRequest {
    goal: string;
    workout_days: number;
    equipment: string;
    diet: string;
    notes?: string | null;
}

interface PlanDay {
    day: string;
    workout: {
        title: string;
        duration_minutes: number;
        intensity: string;
        exercises: string[];
    };
    meals: {
        breakfast: string;
        lunch: string;
        dinner: string;
        snack: string;
    };
    calorie_target: number;
    tip: string;
}

interface PlanResponse {
    has_plan: boolean;
    used_ai?: boolean;
    generated_at?: string | null;
    request?: PlanRequest | null;
    summary?: string;
    days?: PlanDay[];
    disclaimer?: string;
}

const GOALS = [
    ["lose_weight", "Lose Weight & Fat"],
    ["build_muscle", "Build Muscle & Hypertrophy"],
    ["stay_fit", "General Fitness & Conditioning"],
    ["improve_sleep", "Improve Sleep & Recovery"],
    ["reduce_stress", "Reduce Stress & Cortisol Balance"],
];

const EQUIPMENT = [
    ["gym", "Full Commercial Gym"],
    ["home_basic", "Basic Home Equipment (Dumbbells/Bands)"],
    ["none", "Bodyweight / Calisthenics Only"],
];

const DIETS = [
    ["no_preference", "No Preference / Balanced Macro"],
    ["high_protein", "High Protein (Athletic Performance)"],
    ["vegetarian", "Vegetarian"],
    ["vegan", "Plant-Based / Vegan"],
    ["low_carb", "Low Carb / Ketogenic"],
];

export default function WeeklyPlan() {
    const { user } = useAuth();
    const isWomens = user?.dashboard_type === "womens";
    const themeClass = isWomens ? "womens-theme" : "mens-theme";

    const [form, setForm] = useState<PlanRequest>({
        goal: "stay_fit",
        workout_days: 4,
        equipment: "home_basic",
        diet: "no_preference",
        notes: "",
    });

    const [plan, setPlan] = useState<PlanResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState("");

    // Accordion state: by default Day 1 (index 0) is expanded
    const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({ 0: true });

    const toggleDay = (idx: number) => {
        setExpandedDays((prev) => ({
            ...prev,
            [idx]: !prev[idx],
        }));
    };

    const expandAll = (count: number) => {
        const all: Record<number, boolean> = {};
        for (let i = 0; i < count; i++) {
            all[i] = true;
        }
        setExpandedDays(all);
    };

    const collapseAll = () => {
        setExpandedDays({});
    };

    useEffect(() => {
        let active = true;
        api.get<PlanResponse>("/api/ai/plan")
            .then((res) => {
                if (!active) return;
                setPlan(res.data);
                if (res.data.request) {
                    setForm({
                        ...res.data.request,
                        notes: res.data.request.notes ?? "",
                    });
                }
            })
            .catch(() => active && setError("Could not load your saved plan."))
            .finally(() => active && setLoading(false));

        return () => {
            active = false;
        };
    }, []);

    async function generate() {
        setGenerating(true);
        setError("");
        try {
            const res = await api.post<PlanResponse>(
                "/api/ai/plan/generate",
                { ...form, notes: form.notes?.trim() || null },
                { timeout: 60000 }
            );
            setPlan(res.data);
            // Open Day 1 on fresh generation
            setExpandedDays({ 0: true });
        } catch {
            setError("Could not generate the plan. Please check your connection and try again.");
        } finally {
            setGenerating(false);
        }
    }

    const allExpanded =
        plan?.days &&
        plan.days.length > 0 &&
        plan.days.every((_, i) => Boolean(expandedDays[i]));

    return (
        <main className={`dashboard-page ${themeClass} plan-page`}>
            {/* Universal Top Navigation */}
            <AppNavbar theme={isWomens ? "womens" : "mens"} />

            <section className="dashboard-content plan-content">
                {/* Hero Header */}
                <div className="plan-hero-header">
                    <div className="plan-hero-badges">
                        <span className="plan-badge-ai">
                            <Sparkles size={13} />
                            <span>HealthWiise AI</span>
                        </span>
                        <span className="plan-badge-clinical">
                            <CheckCircle2 size={13} />
                            <span>CIRCADIAN &amp; TELEMETRY-ALIGNED</span>
                        </span>
                    </div>

                    <h1 className="plan-hero-title">7-Day Personalized Health Plan</h1>
                    <p className="plan-hero-sub">
                        Adaptive workout splits and nutrient-dense meal plans synchronized with your recent sleep debt, daily hydration targets, and physical recovery capacity.
                    </p>
                </div>

                {/* Preferences Form Section */}
                <section className="plan-preferences-card">
                    <div className="plan-preferences-header">
                        <div className="plan-card-icon-bubble">
                            <SlidersHorizontal size={20} />
                        </div>
                        <div>
                            <h2>Personalize Your Blueprint</h2>
                            <p>Configure training frequency, equipment access, and dietary targets.</p>
                        </div>
                    </div>

                    <div className="plan-form-grid">
                        {/* Primary Goal */}
                        <div className="plan-form-group">
                            <label className="plan-form-label">
                                <Target size={15} />
                                <span>Primary Goal</span>
                            </label>
                            <div className="plan-select-wrap">
                                <select
                                    className="plan-select"
                                    value={form.goal}
                                    onChange={(e) => setForm({ ...form, goal: e.target.value })}
                                >
                                    {GOALS.map(([v, l]) => (
                                        <option key={v} value={v}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="plan-select-chevron" />
                            </div>
                        </div>

                        {/* Workout Days */}
                        <div className="plan-form-group">
                            <label className="plan-form-label">
                                <CalendarDays size={15} />
                                <span>Training Frequency</span>
                            </label>
                            <div className="plan-select-wrap">
                                <select
                                    className="plan-select"
                                    value={form.workout_days}
                                    onChange={(e) =>
                                        setForm({ ...form, workout_days: Number(e.target.value) })
                                    }
                                >
                                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                                        <option key={n} value={n}>
                                            {n} day{n > 1 ? "s" : ""} per week
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="plan-select-chevron" />
                            </div>
                        </div>

                        {/* Equipment */}
                        <div className="plan-form-group">
                            <label className="plan-form-label">
                                <Dumbbell size={15} />
                                <span>Equipment Access</span>
                            </label>
                            <div className="plan-select-wrap">
                                <select
                                    className="plan-select"
                                    value={form.equipment}
                                    onChange={(e) =>
                                        setForm({ ...form, equipment: e.target.value })
                                    }
                                >
                                    {EQUIPMENT.map(([v, l]) => (
                                        <option key={v} value={v}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="plan-select-chevron" />
                            </div>
                        </div>

                        {/* Diet */}
                        <div className="plan-form-group">
                            <label className="plan-form-label">
                                <Utensils size={15} />
                                <span>Dietary Blueprint</span>
                            </label>
                            <div className="plan-select-wrap">
                                <select
                                    className="plan-select"
                                    value={form.diet}
                                    onChange={(e) => setForm({ ...form, diet: e.target.value })}
                                >
                                    {DIETS.map(([v, l]) => (
                                        <option key={v} value={v}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="plan-select-chevron" />
                            </div>
                        </div>
                    </div>

                    {/* Notes Input */}
                    <div className="plan-notes-group">
                        <label className="plan-form-label">
                            <Info size={15} />
                            <span>Special Preferences or Medical Guidance (optional)</span>
                        </label>
                        <input
                            type="text"
                            className="plan-notes-input"
                            value={form.notes ?? ""}
                            maxLength={300}
                            placeholder="e.g. knee sensitivity, avoid dairy, prioritize core strength, 45-min lunch breaks"
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        />
                    </div>

                    {/* Action Button & Error */}
                    <div className="plan-action-bar">
                        <button
                            type="button"
                            className="plan-generate-button"
                            onClick={() => void generate()}
                            disabled={generating}
                        >
                            {generating ? (
                                <>
                                    <Loader2 size={18} className="spin-icon" />
                                    <span>Synthesizing Adaptive Plan (~15s)…</span>
                                </>
                            ) : plan?.has_plan ? (
                                <>
                                    <RotateCw size={17} />
                                    <span>Regenerate My 7-Day Plan</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={17} />
                                    <span>Generate My 7-Day Health Plan</span>
                                </>
                            )}
                        </button>

                        {error && (
                            <div className="plan-error-alert" role="alert">
                                <ShieldAlert size={18} />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>
                </section>

                {/* Loading State */}
                {loading && (
                    <div className="plan-loading-state">
                        <Loader2 size={28} className="spin-icon" />
                        <p>Retrieving your saved health plan and recent biometric history…</p>
                    </div>
                )}

                {/* Generated Plan Section */}
                {plan?.has_plan && plan.days && (
                    <section className="plan-output-section">
                        {/* Executive Summary Card */}
                        <div className="plan-summary-card">
                            <div className="plan-summary-top">
                                <div className="plan-summary-title-wrap">
                                    <div className="plan-summary-icon">
                                        <CalendarDays size={20} />
                                    </div>
                                    <div>
                                        <h2>Plan Strategy &amp; Clinical Overview</h2>
                                        <span className="plan-summary-status">
                                            {plan.used_ai
                                                ? "Calibrated by Gemini 2.5 Flash AI"
                                                : "Rule-Based Clinical Baseline"}
                                            {plan.generated_at
                                                ? ` · ${new Date(plan.generated_at).toLocaleDateString("en-US", {
                                                      month: "short",
                                                      day: "numeric",
                                                      year: "numeric",
                                                      hour: "2-digit",
                                                      minute: "2-digit",
                                                  })}`
                                                : ""}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <p className="plan-summary-text">{plan.summary}</p>
                        </div>

                        {/* Schedule Header with Expand/Collapse All Buttons */}
                        <div className="plan-schedule-header">
                            <div>
                                <h2>Daily Schedule &amp; Execution</h2>
                                <p>Click any day to view its workout split, exercises, and meal plan.</p>
                            </div>

                            <div className="plan-accordion-controls">
                                {allExpanded ? (
                                    <button
                                        type="button"
                                        className="plan-control-btn"
                                        onClick={collapseAll}
                                    >
                                        <ChevronUp size={15} />
                                        <span>Collapse All</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="plan-control-btn"
                                        onClick={() => expandAll(plan.days!.length)}
                                    >
                                        <ChevronDown size={15} />
                                        <span>Expand All</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Interactive Accordion List */}
                        <div className="plan-days-accordion">
                            {plan.days.map((d, index) => {
                                const isExpanded = Boolean(expandedDays[index]);
                                return (
                                    <article
                                        key={d.day || index}
                                        className={`plan-accordion-item ${isExpanded ? "expanded" : ""}`}
                                    >
                                        {/* Day Row Header Trigger */}
                                        <button
                                            type="button"
                                            className="plan-accordion-trigger"
                                            onClick={() => toggleDay(index)}
                                            aria-expanded={isExpanded}
                                        >
                                            <div className="plan-accordion-left">
                                                <span className="plan-day-number-badge">
                                                    Day {index + 1}
                                                </span>
                                                <h3 className="plan-accordion-day-title">{d.day}</h3>

                                                {/* Compact Workout Preview Chip */}
                                                <div className="plan-accordion-preview-pill">
                                                    <Dumbbell size={13} />
                                                    <span>{d.workout.title}</span>
                                                    <span className="plan-accordion-duration">
                                                        ({d.workout.duration_minutes}m)
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="plan-accordion-right">
                                                {d.calorie_target > 0 && (
                                                    <div
                                                        className="plan-day-calorie-pill"
                                                        title="Daily Calorie Budget"
                                                    >
                                                        <Flame size={14} />
                                                        <span>
                                                            ~{d.calorie_target.toLocaleString()} kcal
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="plan-accordion-chevron-bubble">
                                                    {isExpanded ? (
                                                        <ChevronUp size={18} />
                                                    ) : (
                                                        <ChevronDown size={18} />
                                                    )}
                                                </div>
                                            </div>
                                        </button>

                                        {/* Expandable Content Body */}
                                        {isExpanded && (
                                            <div className="plan-accordion-body">
                                                <div className="plan-accordion-body-grid">
                                                    {/* Workout Block */}
                                                    <div className="plan-day-workout-block">
                                                        <div className="plan-block-heading">
                                                            <div className="plan-block-icon workout">
                                                                <Dumbbell size={16} />
                                                            </div>
                                                            <div className="plan-block-title-group">
                                                                <h4>{d.workout.title}</h4>
                                                                <div className="plan-workout-meta-badges">
                                                                    <span className="plan-meta-badge">
                                                                        <Clock size={12} />
                                                                        <span>
                                                                            {d.workout.duration_minutes} min
                                                                        </span>
                                                                    </span>
                                                                    <span
                                                                        className={`plan-meta-badge intensity ${d.workout.intensity?.toLowerCase()}`}
                                                                    >
                                                                        <span>{d.workout.intensity}</span>
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {d.workout.exercises &&
                                                            d.workout.exercises.length > 0 && (
                                                                <div className="plan-exercises-list">
                                                                    {d.workout.exercises.map(
                                                                        (ex, exIdx) => (
                                                                            <div
                                                                                key={exIdx}
                                                                                className="plan-exercise-pill"
                                                                            >
                                                                                <span className="plan-exercise-bullet">
                                                                                    ✓
                                                                                </span>
                                                                                <span>{ex}</span>
                                                                            </div>
                                                                        )
                                                                    )}
                                                                </div>
                                                            )}
                                                    </div>

                                                    {/* Nutrition Architecture Block */}
                                                    <div className="plan-day-meals-block">
                                                        <div className="plan-block-heading">
                                                            <div className="plan-block-icon meals">
                                                                <Utensils size={16} />
                                                            </div>
                                                            <div className="plan-block-title-group">
                                                                <h4>Nutrition Architecture</h4>
                                                            </div>
                                                        </div>

                                                        <div className="plan-meals-list">
                                                            {/* Breakfast */}
                                                            <div className="plan-meal-item">
                                                                <div className="plan-meal-label-pill breakfast">
                                                                    <Coffee size={13} />
                                                                    <span>Breakfast</span>
                                                                </div>
                                                                <p className="plan-meal-desc">
                                                                    {d.meals.breakfast}
                                                                </p>
                                                            </div>

                                                            {/* Lunch */}
                                                            <div className="plan-meal-item">
                                                                <div className="plan-meal-label-pill lunch">
                                                                    <Utensils size={13} />
                                                                    <span>Lunch</span>
                                                                </div>
                                                                <p className="plan-meal-desc">
                                                                    {d.meals.lunch}
                                                                </p>
                                                            </div>

                                                            {/* Dinner */}
                                                            <div className="plan-meal-item">
                                                                <div className="plan-meal-label-pill dinner">
                                                                    <Flame size={13} />
                                                                    <span>Dinner</span>
                                                                </div>
                                                                <p className="plan-meal-desc">
                                                                    {d.meals.dinner}
                                                                </p>
                                                            </div>

                                                            {/* Snack */}
                                                            <div className="plan-meal-item">
                                                                <div className="plan-meal-label-pill snack">
                                                                    <Apple size={13} />
                                                                    <span>Snack</span>
                                                                </div>
                                                                <p className="plan-meal-desc">
                                                                    {d.meals.snack}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Recovery Coach Tip */}
                                                {d.tip && (
                                                    <div className="plan-day-tip-box">
                                                        <div className="plan-tip-icon-wrap">
                                                            <Sparkles size={15} />
                                                        </div>
                                                        <div className="plan-tip-content">
                                                            <strong>Recovery &amp; Circadian Tip</strong>
                                                            <p>{d.tip}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>

                        {/* Medical / Coaching Disclaimer */}
                        {plan.disclaimer && (
                            <div className="plan-disclaimer-card">
                                <Info size={18} className="plan-disclaimer-icon" />
                                <p>{plan.disclaimer}</p>
                            </div>
                        )}
                    </section>
                )}
            </section>
        </main>
    );
}
