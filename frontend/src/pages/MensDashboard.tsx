import { Link } from "react-router-dom";
import {
    Dumbbell,
    Droplets,
    Moon,
    Utensils,
    Sparkles,
    CalendarDays,
    ArrowRight,
    Camera,
    Plus,
    Flame,
    ShieldCheck,
    CheckCircle2,
    Scissors,
    Sparkle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AppNavbar from "../components/AppNavbar";
import AICoachChat from "../components/AICoachChat";
import AnomalyAlertsCard from "../components/AnomalyAlertsCard";

export default function MensDashboard() {
    const { user } = useAuth();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const getFormattedDate = () => {
        const d = new Date();
        return d.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <div className="dashboard-page mens-theme">
            {/* Top Navigation Bar */}
            <AppNavbar theme="mens" />

            <main className="dashboard-content">
                {/* Hero Greeting Section */}
                <section className="dashboard-hero-card">
                    <div className="dashboard-hero-content">
                        <div className="dashboard-hero-badges">
                            <span className="dashboard-theme-pill">MEN'S HEALTH &amp; PERFORMANCE</span>
                            <span className="dashboard-date-pill">{getFormattedDate()}</span>
                        </div>

                        <h1 className="dashboard-hero-title">
                            {getGreeting()},{" "}
                            <span className="dashboard-hero-name">
                                {user?.name || "Member"}
                            </span>
                        </h1>

                        <p className="dashboard-hero-sub">
                            Your unified health control center. Track workouts with trained ML calorie estimation, scan meals with vision AI, and build disciplined recovery habits.
                        </p>

                        {/* Quick Action Buttons */}
                        <div className="dashboard-quick-actions">
                            <Link to="/shared/fitness" className="dashboard-action-btn primary">
                                <Plus size={16} />
                                <span>Record Workout</span>
                            </Link>

                            <Link to="/shared/nutrition" className="dashboard-action-btn secondary">
                                <Camera size={16} />
                                <span>Scan Meal Plate</span>
                            </Link>

                            <Link to="/shared/plan" className="dashboard-action-btn tertiary">
                                <CalendarDays size={16} />
                                <span>7-Day AI Plan</span>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Biometric Telemetry & Anomaly Alerts */}
                <AnomalyAlertsCard />

                {/* Health Features Grid */}
                <div className="dashboard-section-head">
                    <div>
                        <h2>Core Health &amp; Activity Hub</h2>
                        <p>Powered by machine learning models and clinical health guidelines.</p>
                    </div>
                </div>

                <div className="dashboard-hub-grid">
                    {/* Fitness & Strength Card */}
                    <Link to="/shared/fitness" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap fitness">
                                <Dumbbell size={24} />
                            </div>
                            <span className="dashboard-hub-badge ml">
                                <Flame size={12} /> ML Calorie Burn (R²: 0.96)
                            </span>
                        </div>
                        <h3>Fitness &amp; Strength</h3>
                        <p>
                            Track workouts, duration, and energy expenditure with the trained Kaggle Gym Exercise model.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Open workout tracker</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>

                    {/* Nutrition & Plate Scanner Card */}
                    <Link to="/shared/nutrition" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap nutrition">
                                <Utensils size={24} />
                            </div>
                            <span className="dashboard-hub-badge ai">
                                <Sparkles size={12} /> Gemini 2.5 Vision
                            </span>
                        </div>
                        <h3>AI Nutrition Scanner</h3>
                        <p>
                            Snap or upload meal photos for instant calorie, protein, and macronutrient breakdowns.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Scan &amp; log nutrition</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>

                    {/* Hydration Card */}
                    <Link to="/shared/hydration" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap hydration">
                                <Droplets size={24} />
                            </div>
                            <span className="dashboard-hub-badge smart">
                                <CheckCircle2 size={12} /> Target Tracking
                            </span>
                        </div>
                        <h3>Hydration Balance</h3>
                        <p>
                            Monitor water intake with 250ml/500ml quick logs, hourly progress, and hydration goal rings.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Log daily fluids</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>

                    {/* Sleep & Restorative Rest Card */}
                    <Link to="/shared/sleep" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap sleep">
                                <Moon size={24} />
                            </div>
                            <span className="dashboard-hub-badge ml">
                                <ShieldCheck size={12} /> Random Forest (R²: 0.98)
                            </span>
                        </div>
                        <h3>Sleep &amp; Recovery</h3>
                        <p>
                            Predict sleep quality scores, evaluate bedtime consistency, and receive circadian insights.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>View sleep metrics</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>

                    {/* Unified Wellness Insights Card */}
                    <Link to="/shared/wellness" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap wellness">
                                <Sparkles size={24} />
                            </div>
                            <span className="dashboard-hub-badge analytics">
                                <Sparkle size={12} /> Multi-Service Analytics
                            </span>
                        </div>
                        <h3>Wellness Insights</h3>
                        <p>
                            Correlate sleep debt, workout consistency, water intake, and daily nutrition in one view.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Explore correlations</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>

                    {/* 7-Day AI Plan Card */}
                    <Link to="/shared/plan" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap plan">
                                <CalendarDays size={24} />
                            </div>
                            <span className="dashboard-hub-badge ai">
                                <Sparkles size={12} /> Personalized Schedule
                            </span>
                        </div>
                        <h3>7-Day AI Health Plan</h3>
                        <p>
                            Personalized workout splits and meal plans tailored to your recorded health telemetry.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Generate &amp; view plan</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>
                </div>

                {/* Men's Grooming & Personal Care Section */}
                <section className="dashboard-personal-care-card">
                    <div className="dashboard-personal-care-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="dashboard-care-icon-bubble">
                                <Scissors size={20} />
                            </div>
                            <div>
                                <h3>Men's Grooming &amp; Daily Maintenance</h3>
                                <p>Essential daily habits for physical resilience, skin health, and clean grooming.</p>
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-care-tips-grid">
                        <div className="dashboard-care-tip-item">
                            <h4>Beard &amp; Skin Boundary</h4>
                            <p>Exfoliate twice weekly to prevent ingrown hairs and apply cold-pressed oil to anchor skin hydration.</p>
                        </div>
                        <div className="dashboard-care-tip-item">
                            <h4>Daily Barrier Defense</h4>
                            <p>Use broad-spectrum SPF 30+ daily and cleanse with gentle pH-balanced face wash post-workout.</p>
                        </div>
                        <div className="dashboard-care-tip-item">
                            <h4>Post-Workout Reset</h4>
                            <p>Rehydrate with electrolytes within 30 minutes and implement 5 minutes of restorative breathing to lower cortisol.</p>
                        </div>
                    </div>
                </section>
            </main>

            {/* AI Coach Floating Widget */}
            <AICoachChat />
        </div>
    );
}
