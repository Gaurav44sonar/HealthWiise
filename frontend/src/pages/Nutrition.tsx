
import { useCallback, useEffect, useState, type FormEvent } from "react";
import api from "../services/api";

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

            setMessage(`${amount} ml of water added.`);
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

            setMessage("Hydration goal updated.");
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

    if (loading) {
        return (
            <main className="nutrition-page">
                <p className="nutrition-muted">Loading your wellness data...</p>
            </main>
        );
    }

    const hydration = summary?.hydration;
    const nutrition = summary?.nutrition;

    return (
        <main className="nutrition-page">
            <header className="nutrition-heading">
                <div>
                    <span className="nutrition-eyebrow">YOUR DAILY WELLNESS</span>
                    <h1>Nutrition &amp; Hydration</h1>
                    <p className="nutrition-muted">
                        Build healthy habits, one day at a time.
                    </p>
                </div>

                <button
                    type="button"
                    className="nutrition-secondary"
                    onClick={() => void loadData()}
                    disabled={saving}
                >
                    Refresh
                </button>
            </header>

            {error && (
                <div className="nutrition-error" role="alert">
                    {error}
                </div>
            )}

            {message && (
                <div className="nutrition-success" role="status">
                    {message}
                </div>
            )}

            <section className="nutrition-stats">
                <article className="nutrition-card hydration-card">
                    <span className="nutrition-icon" aria-hidden="true">
                        💧
                    </span>

                    <p className="nutrition-muted">Water consumed</p>

                    <h2>
                        {hydration?.consumed_ml ?? 0} <small>ml</small>
                    </h2>

                    <div
                        className="nutrition-progress"
                        role="progressbar"
                        aria-label="Daily hydration goal"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={hydration?.percentage ?? 0}
                    >
                        <div
                            style={{
                                width: `${Math.min(
                                    Math.max(hydration?.percentage ?? 0, 0),
                                    100
                                )}%`,
                            }}
                        />
                    </div>

                    <p className="nutrition-muted">
                        {hydration?.percentage ?? 0}% of{" "}
                        {hydration?.goal_ml ?? 2500} ml goal
                    </p>

                    <div className="water-buttons">
                        {[150, 250, 500].map((amount) => (
                            <button
                                key={amount}
                                type="button"
                                className="nutrition-secondary"
                                disabled={saving}
                                onClick={() => void addWater(amount)}
                            >
                                +{amount} ml
                            </button>
                        ))}
                    </div>

                    <form className="nutrition-inline-form" onSubmit={saveGoal}>
                        <label htmlFor="hydration-goal">Daily goal (ml)</label>

                        <input
                            id="hydration-goal"
                            type="number"
                            min="1"
                            max="10000"
                            step="1"
                            value={goal}
                            onChange={(event) => setGoal(event.target.value)}
                            required
                        />

                        <button type="submit" disabled={saving || !goal}>
                            Save
                        </button>
                    </form>
                </article>

                <article className="nutrition-card">
                    <span className="nutrition-icon" aria-hidden="true">
                        🍎
                    </span>

                    <p className="nutrition-muted">Calories logged</p>

                    <h2>
                        {nutrition?.calories ?? 0} <small>kcal</small>
                    </h2>

                    <p className="nutrition-muted">
                        {nutrition?.meal_count ?? 0} meals recorded today
                    </p>

                    <div className="macro-list">
                        <p>
                            Protein <strong>{nutrition?.protein_g ?? 0} g</strong>
                        </p>
                        <p>
                            Carbohydrates <strong>{nutrition?.carbs_g ?? 0} g</strong>
                        </p>
                        <p>
                            Fat <strong>{nutrition?.fat_g ?? 0} g</strong>
                        </p>
                    </div>
                </article>
            </section>

            <section className="nutrition-card nutrition-meal-section">
                <h2>Log a meal</h2>

                <p className="nutrition-muted">
                    Enter the nutritional values from your meal or food label.
                </p>

                <form className="nutrition-meal-form" onSubmit={addMeal}>
                    <label>
                        Meal name
                        <input
                            value={mealName}
                            onChange={(event) => setMealName(event.target.value)}
                            placeholder="e.g. Oats and milk"
                            maxLength={120}
                            required
                        />
                    </label>

                    <label>
                        Meal type
                        <select
                            value={mealType}
                            onChange={(event) => setMealType(event.target.value)}
                        >
                            <option value="breakfast">Breakfast</option>
                            <option value="lunch">Lunch</option>
                            <option value="dinner">Dinner</option>
                            <option value="snack">Snack</option>
                        </select>
                    </label>

                    <label>
                        Calories (kcal)
                        <input
                            type="number"
                            min="0"
                            max="10000"
                            step="any"
                            value={calories}
                            onChange={(event) => setCalories(event.target.value)}
                            required
                        />
                    </label>

                    <label>
                        Protein (g)
                        <input
                            type="number"
                            min="0"
                            max="1000"
                            step="any"
                            value={protein}
                            onChange={(event) => setProtein(event.target.value)}
                            required
                        />
                    </label>

                    <label>
                        Carbohydrates (g)
                        <input
                            type="number"
                            min="0"
                            max="1000"
                            step="any"
                            value={carbs}
                            onChange={(event) => setCarbs(event.target.value)}
                            required
                        />
                    </label>

                    <label>
                        Fat (g)
                        <input
                            type="number"
                            min="0"
                            max="1000"
                            step="any"
                            value={fat}
                            onChange={(event) => setFat(event.target.value)}
                            required
                        />
                    </label>

                    <button
                        type="submit"
                        className="nutrition-submit"
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Add meal"}
                    </button>
                </form>
            </section>

            <section className="nutrition-card nutrition-meal-section">
                <h2>Today's meals</h2>

                {meals.length === 0 ? (
                    <p className="nutrition-muted">
                        No meals recorded for today yet.
                    </p>
                ) : (
                    <div className="meal-list">
                        {meals.map((meal) => (
                            <article className="meal-row" key={meal.id}>
                                <div>
                                    <strong>{meal.name}</strong>

                                    <p className="nutrition-muted">
                                        {meal.meal_type.charAt(0).toUpperCase() +
                                            meal.meal_type.slice(1)}
                                        {" · "}
                                        {new Date(meal.recorded_at).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>

                                    <p className="nutrition-muted">
                                        P: {meal.protein_g} g · C: {meal.carbs_g} g · F:{" "}
                                        {meal.fat_g} g
                                    </p>
                                </div>

                                <strong>{meal.calories} kcal</strong>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
