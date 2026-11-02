import { useEffect, useState } from "react";
import { CalendarDays, Dumbbell, Loader2, Sparkles, Utensils } from "lucide-react";
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
    workout: { title: string; duration_minutes: number; intensity: string; exercises: string[] };
    meals: { breakfast: string; lunch: string; dinner: string; snack: string };
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
    ["lose_weight", "Lose weight"],
    ["build_muscle", "Build muscle"],
    ["stay_fit", "Stay fit"],
    ["improve_sleep", "Improve sleep & recovery"],
    ["reduce_stress", "Reduce stress"],
];
const EQUIPMENT = [
    ["gym", "Gym"],
    ["home_basic", "Basic home equipment"],
    ["none", "No equipment"],
];
const DIETS = [
    ["no_preference", "No preference"],
    ["vegetarian", "Vegetarian"],
    ["vegan", "Vegan"],
    ["high_protein", "High protein"],
    ["low_carb", "Low carb"],
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

    useEffect(() => {
        let active = true;
        api.get<PlanResponse>("/api/ai/plan")
            .then((res) => {
                if (!active) return;
                setPlan(res.data);
                if (res.data.request) setForm({ ...res.data.request, notes: res.data.request.notes ?? "" });
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
        } catch {
            setError("Could not generate the plan. Please try again.");
        } finally {
            setGenerating(false);
        }
    }

    return (
        <main className={`dashboard-page ${themeClass}`}>
            <AppNavbar theme={themeClass === "womens-theme" ? "womens" : "mens"} />

            <section className="dashboard-content">
                <p className="eyebrow">AI WEEKLY PLAN</p>
                <h1>Workout &amp; Meal Plan</h1>
                <p className="muted">
                    A 7-day plan tailored to your goal and your last 30 days of sleep, water, workouts and meals.
                </p>

                <section className="dashboard-panel">
                    <h2>
                        <Sparkles size={18} /> Your preferences
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                        <label>
                            Goal
                            <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
                                {GOALS.map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Workout days / week
                            <select
                                value={form.workout_days}
                                onChange={(e) => setForm({ ...form, workout_days: Number(e.target.value) })}
                            >
                                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Equipment
                            <select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })}>
                                {EQUIPMENT.map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Diet
                            <select value={form.diet} onChange={(e) => setForm({ ...form, diet: e.target.value })}>
                                {DIETS.map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label style={{ display: "block", marginTop: 14 }}>
                        Notes (optional)
                        <input
                            value={form.notes ?? ""}
                            maxLength={300}
                            placeholder="e.g. knee pain, no dairy, short on time"
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            style={{ width: "100%" }}
                        />
                    </label>
                    <button
                        className="primary-button"
                        style={{ marginTop: 16 }}
                        onClick={() => void generate()}
                        disabled={generating}
                    >
                        {generating ? (
                            <>
                                <Loader2 size={16} className="spin-icon" /> Generating (about 15s)…
                            </>
                        ) : plan?.has_plan ? (
                            "Regenerate my plan"
                        ) : (
                            "Generate my weekly plan"
                        )}
                    </button>
                    {error && (
                        <p role="alert" style={{ color: "#b3261e" }}>
                            {error}
                        </p>
                    )}
                </section>

                {loading && <p className="muted">Loading…</p>}

                {plan?.has_plan && plan.days && (
                    <>
                        <section className="dashboard-panel">
                            <h2>
                                <CalendarDays size={18} /> Summary
                            </h2>
                            <p>{plan.summary}</p>
                            <p className="muted" style={{ fontSize: "0.8rem" }}>
                                {plan.used_ai ? "Generated by Gemini AI" : "Rule-based plan (AI unavailable)"}
                                {plan.generated_at ? ` · ${new Date(plan.generated_at).toLocaleString()}` : ""}
                            </p>
                        </section>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                                gap: 16,
                                marginTop: 16,
                            }}
                        >
                            {plan.days.map((d) => (
                                <section key={d.day} className="dashboard-panel" style={{ margin: 0 }}>
                                    <h2>{d.day}</h2>
                                    <p>
                                        <Dumbbell size={15} /> <strong>{d.workout.title}</strong>
                                        <span className="muted">
                                            {" "}
                                            · {d.workout.duration_minutes} min · {d.workout.intensity}
                                        </span>
                                    </p>
                                    <ul style={{ margin: "0 0 10px 18px" }}>
                                        {d.workout.exercises.map((x, i) => (
                                            <li key={i}>{x}</li>
                                        ))}
                                    </ul>
                                    <p>
                                        <Utensils size={15} /> <strong>Meals</strong>
                                        {d.calorie_target > 0 && <span className="muted"> · ~{d.calorie_target} kcal</span>}
                                    </p>
                                    <ul style={{ margin: "0 0 10px 18px" }}>
                                        <li>
                                            <b>Breakfast:</b> {d.meals.breakfast}
                                        </li>
                                        <li>
                                            <b>Lunch:</b> {d.meals.lunch}
                                        </li>
                                        <li>
                                            <b>Dinner:</b> {d.meals.dinner}
                                        </li>
                                        <li>
                                            <b>Snack:</b> {d.meals.snack}
                                        </li>
                                    </ul>
                                    {d.tip && <p className="muted">Tip: {d.tip}</p>}
                                </section>
                            ))}
                        </div>
                        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 16 }}>
                            {plan.disclaimer}
                        </p>
                    </>
                )}
            </section>
        </main>
    );
}
