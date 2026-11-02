import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
    Utensils,
    Flame,
    Droplets,
    Sparkles,
    Plus,
    RotateCw,
    Clock,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    Coffee,
    Apple,
    HeartPulse,
} from "lucide-react";
import api from "../services/api";
import AIMealScannerCard from "../components/AIMealScannerCard";
import AppNavbar from "../components/AppNavbar";
import { useAuth } from "../context/AuthContext";

type Meal = {
    id: string;
    name: string;
    meal_type: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    recorded_at: string;
};

type Summary = {
    date: string;
    hydration: {
        consumed_ml: number;
        goal_ml: number;
        percentage: number;
    };
    nutrition: {
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        meal_count: number;
    };
};

export default function Nutrition() {
    const { user } = useAuth();
    const isWomens = user?.dashboard_type === "womens";
    const themeClass = isWomens ? "womens-theme" : "mens-theme";

    const [summary, setSummary] = useState<Summary | null>(null);
    const [meals, setMeals] = useState<Meal[]>([]);

    const [mealName, setMealName] = useState("");
    const [mealType, setMealType] = useState("breakfast");
    const [calories, setCalories] = useState("350");
    const [protein, setProtein] = useState("15");
    const [carbs, setCarbs] = useState("50");
    const [fat, setFat] = useState("10");
    const [goal, setGoal] = useState("2500");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [summaryResponse, mealsResponse] = await Promise.all([
                api.get<Summary>("/api/nutrition/summary"),
                api.get<{ entries: Meal[] }>("/api/nutrition/meals"),
            ]);

            setSummary(summaryResponse.data);
            setMeals(mealsResponse.data.entries);
            setGoal(String(summaryResponse.data.hydration.goal_ml));
        } catch (err: unknown) {
            const response = (
                err as {
                    response?: {
                        status?: number;
                        data?: { detail?: string };
                    };
                }
            ).response;

            setError(
                response?.status === 401
                    ? "Your session has expired. Please log in again."
                    : response?.data?.detail ||
                          "Unable to load nutrition data. Check that the backend is running."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    async function addWater(amount: number) {
        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.post("/api/nutrition/water", {
                amount_ml: amount,
            });

            setMessage(`${amount} ml of water recorded.`);
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not record water.");
        } finally {
            setSaving(false);
        }
    }

    async function saveGoal(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const goalValue = Number(goal);

        if (!Number.isInteger(goalValue) || goalValue < 1 || goalValue > 10000) {
            setError("Enter a whole-number hydration goal from 1 to 10000 ml.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.patch("/api/nutrition/hydration-goal", {
                goal_ml: goalValue,
            });

            setMessage("Hydration target updated successfully.");
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not update goal.");
        } finally {
            setSaving(false);
        }
    }

    async function addMeal(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const values = [calories, protein, carbs, fat].map(Number);

        if (
            values.some((value) => !Number.isFinite(value) || value < 0) ||
            Number(calories) > 10000 ||
            [protein, carbs, fat].some((value) => Number(value) > 1000)
        ) {
            setError("Please enter valid, non-negative nutrition values.");
            return;
        }

        if (!mealName.trim()) {
            setError("Please enter a meal name.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await api.post("/api/nutrition/meals", {
                name: mealName.trim(),
                meal_type: mealType,
                calories: Number(calories),
                protein_g: Number(protein),
                carbs_g: Number(carbs),
                fat_g: Number(fat),
            });

            setMealName("");
            setMessage("Meal recorded successfully.");
            await loadData();
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(response?.data?.detail || "Could not save meal.");
        } finally {
            setSaving(false);
        }
    }

    function handleFillFromScanner(scanned: {
        name: string;
        meal_type: string;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
    }) {
        setMealName(scanned.name);
        setMealType(scanned.meal_type);
        setCalories(String(scanned.calories));
        setProtein(String(scanned.protein_g));
        setCarbs(String(scanned.carbs_g));
        setFat(String(scanned.fat_g));
        setMessage(`AI Scanned meal "${scanned.name}" loaded into the form below.`);
        const element = document.getElementById("manual-meal-form");
        if (element) {
            element.scrollIntoView({ behavior: "smooth" });
        }
    }

    const getMealTypeIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case "breakfast":
                return Coffee;
            case "lunch":
                return Utensils;
            case "dinner":
                return Flame;
            default:
                return Apple;
        }
    };

    if (loading && !summary) {
        return (
            <div className={`nutrition-page-wrapper ${themeClass}`}>
                <AppNavbar theme={isWomens ? "womens" : "mens"} />
                <main className="nutrition-container">
                    <div className="nutrition-loading-state">
                        <RotateCw size={28} className="spin-animation" />
                        <p>Loading your nutrition and metabolic records…</p>
                    </div>
                </main>
            </div>
        );
    }

    const hydration = summary?.hydration;
    const nutrition = summary?.nutrition;

    return (
        <div className={`nutrition-page-wrapper ${themeClass}`}>
            {/* Universal Top Navigation */}
            <AppNavbar theme={isWomens ? "womens" : "mens"} />

            <main className="nutrition-container">
                {/* Title & Refresh Header */}
                <div className="nutrition-header">
                    <div>
                        <div className="nutrition-badges">
                            <span className="nutrition-badge-ai">
                                <Sparkles size={13} />
                                <span>GEMINI 2.5 VISION MULTIMODAL</span>
                            </span>
                            <span className="nutrition-badge-smart">
                                <HeartPulse size={13} />
                                <span>MACRONUTRIENT BALANCE</span>
                            </span>
                        </div>
                        <h1 className="nutrition-title">Nutrition &amp; Plate Scanner</h1>
                        <p className="nutrition-sub">
                            Log meals manually or scan food photos with vision AI to evaluate calories, macronutrients, and metabolic energy intake.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="nutrition-refresh-btn"
                        onClick={() => void loadData()}
                        disabled={saving}
                        title="Refresh Nutrition Data"
                    >
                        <RotateCw size={15} className={loading ? "spin-animation" : ""} />
                        <span>Refresh</span>
                    </button>
                </div>

                {/* Feedback Alerts */}
                {error && (
                    <div className="nutrition-alert error" role="alert">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                {message && (
                    <div className="nutrition-alert success" role="status">
                        <CheckCircle2 size={18} />
                        <span>{message}</span>
                    </div>
                )}

                {/* Executive Top KPI Metric Cards */}
                <div className="nutrition-kpi-grid">
                    {/* Calories */}
                    <div className="nutrition-kpi-card">
                        <div className="nutrition-kpi-icon-wrap calorie">
                            <Flame size={22} />
                        </div>
                        <div className="nutrition-kpi-info">
                            <span className="nutrition-kpi-label">Calories Logged Today</span>
                            <div className="nutrition-kpi-val calorie-val">
                                {nutrition?.calories ?? 0} <small>kcal</small>
                            </div>
                            <span className="nutrition-kpi-sub">
                                {nutrition?.meal_count ?? 0}{" "}
                                {nutrition?.meal_count === 1 ? "meal" : "meals"} recorded today
                            </span>
                        </div>
                    </div>

                    {/* Protein */}
                    <div className="nutrition-kpi-card">
                        <div className="nutrition-kpi-icon-wrap protein">
                            <Utensils size={22} />
                        </div>
                        <div className="nutrition-kpi-info">
                            <span className="nutrition-kpi-label">Protein</span>
                            <div className="nutrition-kpi-val">
                                {nutrition?.protein_g ?? 0} <small>g</small>
                            </div>
                            <span className="nutrition-kpi-sub">
                                Muscle synthesis &amp; recovery
                            </span>
                        </div>
                    </div>

                    {/* Carbs */}
                    <div className="nutrition-kpi-card">
                        <div className="nutrition-kpi-icon-wrap carbs">
                            <Apple size={22} />
                        </div>
                        <div className="nutrition-kpi-info">
                            <span className="nutrition-kpi-label">Carbohydrates</span>
                            <div className="nutrition-kpi-val">
                                {nutrition?.carbs_g ?? 0} <small>g</small>
                            </div>
                            <span className="nutrition-kpi-sub">
                                Glycogen replenishment &amp; energy
                            </span>
                        </div>
                    </div>

                    {/* Healthy Fats */}
                    <div className="nutrition-kpi-card">
                        <div className="nutrition-kpi-icon-wrap fat">
                            <Droplets size={22} />
                        </div>
                        <div className="nutrition-kpi-info">
                            <span className="nutrition-kpi-label">Healthy Fats</span>
                            <div className="nutrition-kpi-val">
                                {nutrition?.fat_g ?? 0} <small>g</small>
                            </div>
                            <span className="nutrition-kpi-sub">
                                Cellular &amp; hormonal balance
                            </span>
                        </div>
                    </div>
                </div>

                {/* Main 2-Column Nutrition Cockpit */}
                <div className="nutrition-grid-main">
                    {/* Left Column: AI Vision Scanner & Today's Meals */}
                    <div className="nutrition-col">
                        {/* Gemini Vision Plate Scanner Card */}
                        <AIMealScannerCard
                            onFillForm={handleFillFromScanner}
                            onMealLogged={loadData}
                        />

                        {/* Today's Meals List Card */}
                        <section className="nutrition-card">
                            <div className="nutrition-card-header">
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div className="nutrition-header-icon meals">
                                        <Clock size={19} />
                                    </div>
                                    <div>
                                        <h2>Today's Recorded Meals</h2>
                                        <p className="nutrition-card-sub">
                                            Itemized meals and macronutrient distributions for today.
                                        </p>
                                    </div>
                                </div>
                                <span className="nutrition-count-badge">
                                    {meals.length} {meals.length === 1 ? "meal" : "meals"}
                                </span>
                            </div>

                            {meals.length === 0 ? (
                                <div className="nutrition-empty-state">
                                    <Utensils size={36} className="nutrition-empty-icon" />
                                    <h3>No meals recorded today</h3>
                                    <p>
                                        Use the AI Plate Scanner above or enter a meal manually on the right to track your daily nutrients!
                                    </p>
                                </div>
                            ) : (
                                <div className="nutrition-meals-list">
                                    {meals.map((meal) => {
                                        const IconComp = getMealTypeIcon(meal.meal_type);
                                        return (
                                            <article className="nutrition-meal-item" key={meal.id}>
                                                <div className="nutrition-meal-left">
                                                    <div
                                                        className={`nutrition-meal-type-icon ${meal.meal_type.toLowerCase()}`}
                                                    >
                                                        <IconComp size={18} />
                                                    </div>
                                                    <div className="nutrition-meal-details">
                                                        <div className="nutrition-meal-title-row">
                                                            <h4>{meal.name}</h4>
                                                            <span className="nutrition-meal-type-pill">
                                                                {meal.meal_type}
                                                            </span>
                                                        </div>
                                                        <div className="nutrition-meal-meta">
                                                            <span className="nutrition-meal-time">
                                                                {new Date(meal.recorded_at).toLocaleTimeString(
                                                                    [],
                                                                    {
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                    }
                                                                )}
                                                            </span>
                                                            <span className="nutrition-meal-macros">
                                                                <strong>P:</strong> {meal.protein_g}g ·{" "}
                                                                <strong>C:</strong> {meal.carbs_g}g ·{" "}
                                                                <strong>F:</strong> {meal.fat_g}g
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="nutrition-meal-right">
                                                    <span className="nutrition-meal-kcal-badge">
                                                        <Flame size={13} />
                                                        <span>{meal.calories} kcal</span>
                                                    </span>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Right Column: Manual Logger & Hydration Quick Balance */}
                    <div className="nutrition-col">
                        {/* Manual Meal Entry Form Card */}
                        <section id="manual-meal-form" className="nutrition-card">
                            <div className="nutrition-card-header">
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div className="nutrition-header-icon log">
                                        <Plus size={19} />
                                    </div>
                                    <div>
                                        <h2>Log a Meal Manually</h2>
                                        <p className="nutrition-card-sub">
                                            Enter nutritional values directly from food packaging or personal recipes.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <form className="nutrition-form" onSubmit={addMeal}>
                                <div className="nutrition-form-group">
                                    <label htmlFor="meal-name">Meal Name</label>
                                    <input
                                        id="meal-name"
                                        type="text"
                                        className="nutrition-input"
                                        value={mealName}
                                        onChange={(e) => setMealName(e.target.value)}
                                        placeholder="e.g. Scrambled Eggs with Spinach & Toast"
                                        maxLength={120}
                                        required
                                        disabled={saving}
                                    />
                                </div>

                                <div className="nutrition-form-group">
                                    <label htmlFor="meal-type">Meal Type</label>
                                    <div className="nutrition-type-pills">
                                        {["breakfast", "lunch", "dinner", "snack"].map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                className={`nutrition-type-pill ${
                                                    mealType === t ? "active" : ""
                                                }`}
                                                onClick={() => setMealType(t)}
                                                disabled={saving}
                                            >
                                                {t.charAt(0).toUpperCase() + t.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Macros Grid */}
                                <div className="nutrition-macros-input-grid">
                                    <div className="nutrition-form-group">
                                        <label htmlFor="meal-calories">
                                            <Flame size={13} /> Calories (kcal)
                                        </label>
                                        <input
                                            id="meal-calories"
                                            type="number"
                                            min="0"
                                            max="10000"
                                            step="any"
                                            className="nutrition-input"
                                            value={calories}
                                            onChange={(e) => setCalories(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                    </div>

                                    <div className="nutrition-form-group">
                                        <label htmlFor="meal-protein">Protein (g)</label>
                                        <input
                                            id="meal-protein"
                                            type="number"
                                            min="0"
                                            max="1000"
                                            step="any"
                                            className="nutrition-input"
                                            value={protein}
                                            onChange={(e) => setProtein(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                    </div>

                                    <div className="nutrition-form-group">
                                        <label htmlFor="meal-carbs">Carbs (g)</label>
                                        <input
                                            id="meal-carbs"
                                            type="number"
                                            min="0"
                                            max="1000"
                                            step="any"
                                            className="nutrition-input"
                                            value={carbs}
                                            onChange={(e) => setCarbs(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                    </div>

                                    <div className="nutrition-form-group">
                                        <label htmlFor="meal-fat">Fat (g)</label>
                                        <input
                                            id="meal-fat"
                                            type="number"
                                            min="0"
                                            max="1000"
                                            step="any"
                                            className="nutrition-input"
                                            value={fat}
                                            onChange={(e) => setFat(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="nutrition-submit-button"
                                    disabled={saving}
                                >
                                    <Plus size={16} />
                                    <span>{saving ? "Recording..." : "Save Meal Entry"}</span>
                                </button>
                            </form>
                        </section>

                        {/* Hydration Quick Snapshot Card */}
                        <section className="nutrition-card hydration-snapshot-card">
                            <div className="nutrition-card-header">
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div className="nutrition-header-icon water">
                                        <Droplets size={19} />
                                    </div>
                                    <div>
                                        <h2>Daily Hydration Balance</h2>
                                        <p className="nutrition-card-sub">
                                            Fluid intake tracking synced with your daily hydration target.
                                        </p>
                                    </div>
                                </div>

                                <Link
                                    to="/shared/hydration"
                                    className="nutrition-tracker-link"
                                    title="Open Full Hydration Tracker"
                                >
                                    <span>Full Tracker</span>
                                    <ArrowRight size={14} />
                                </Link>
                            </div>

                            <div className="nutrition-hydration-body">
                                <div className="nutrition-hydration-metric-row">
                                    <div>
                                        <span className="nutrition-hydration-val">
                                            {(hydration?.consumed_ml ?? 0).toLocaleString()} <small>ml</small>
                                        </span>
                                        <span className="nutrition-hydration-goal">
                                            of {(hydration?.goal_ml ?? 2500).toLocaleString()} ml daily target
                                        </span>
                                    </div>
                                    <span className="nutrition-hydration-pct-badge">
                                        {hydration?.percentage ?? 0}%
                                    </span>
                                </div>

                                <div
                                    className="nutrition-progress-track"
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={hydration?.percentage ?? 0}
                                >
                                    <div
                                        className="nutrition-progress-fill"
                                        style={{
                                            width: `${Math.min(
                                                Math.max(hydration?.percentage ?? 0, 0),
                                                100
                                            )}%`,
                                        }}
                                    />
                                </div>

                                {/* Quick Add Buttons */}
                                <div className="nutrition-water-quick-btns">
                                    {[150, 250, 500].map((amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            className="nutrition-quick-water-btn"
                                            disabled={saving}
                                            onClick={() => void addWater(amount)}
                                        >
                                            <Droplets size={13} />
                                            <span>+{amount} ml</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Inline Goal Edit Form */}
                                <form className="nutrition-goal-inline-form" onSubmit={saveGoal}>
                                    <label htmlFor="hydration-goal-input">Adjust Daily Goal (ml):</label>
                                    <div className="nutrition-goal-input-wrap">
                                        <input
                                            id="hydration-goal-input"
                                            type="number"
                                            min="1"
                                            max="10000"
                                            step="1"
                                            className="nutrition-input-small"
                                            value={goal}
                                            onChange={(e) => setGoal(e.target.value)}
                                            required
                                            disabled={saving}
                                        />
                                        <button
                                            type="submit"
                                            className="nutrition-goal-save-btn"
                                            disabled={saving || !goal}
                                        >
                                            Save
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
