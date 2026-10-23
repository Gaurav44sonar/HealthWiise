
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { saveDashboardPreference } from "../services/profile";

export default function Onboarding() {
    const { refreshProfile } = useAuth();
    const navigate = useNavigate();

    const [choice, setChoice] = useState<"mens" | "womens" | "">("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleContinue() {
        if (!choice) {
            setError("Please select a wellness experience.");
            return;
        }

        setSaving(true);
        setError("");

        try {
            await saveDashboardPreference(choice);

            // Mark onboarding as complete in the backend.
            // This requires the backend update described below.
            const user = await refreshProfile();

            if (!user.onboarding_completed) {
                setError(
                    "Your preference was saved, but onboarding is not complete yet. Check the backend update."
                );
                return;
            }

            navigate(
                choice === "mens" ? "/mens/dashboard" : "/womens/dashboard",
                { replace: true }
            );
        } catch {
            setError("Could not save your preference. Please try again.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card onboarding-card">
                <h1>Choose your wellness experience</h1>
                <p className="muted">
                    Select the dashboard that best matches the services you want.
                    Shared wellness tools are available in both experiences.
                </p>

                <button
                    type="button"
                    className={`choice-card ${choice === "mens" ? "selected" : ""}`}
                    onClick={() => setChoice("mens")}
                    aria-pressed={choice === "mens"}
                >
                    <strong>Men's Wellness</strong>
                    <span>Fitness, grooming, recovery and more</span>
                </button>

                <button
                    type="button"
                    className={`choice-card ${choice === "womens" ? "selected" : ""}`}
                    onClick={() => setChoice("womens")}
                    aria-pressed={choice === "womens"}
                >
                    <strong>Women's Wellness</strong>
                    <span>Cycle tracking, self-care, fitness and more</span>
                </button>

                {error && <p className="error-message">{error}</p>}

                <button
                    type="button"
                    onClick={handleContinue}
                    disabled={saving || !choice}
                >
                    {saving ? "Saving..." : "Continue"}
                </button>
            </section>
        </main>
    );
}
