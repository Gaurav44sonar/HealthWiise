import { Link } from "react-router-dom";
import {
    Flower2,
    Activity,
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
    HeartPulse,
    Sparkle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AppNavbar from "../components/AppNavbar";
import AICoachChat from "../components/AICoachChat";
import AnomalyAlertsCard from "../components/AnomalyAlertsCard";

export default function WomensDashboard() {
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
        <div className="dashboard-page womens-theme">
            {/* Top Navigation Bar */}
            <AppNavbar theme="womens" />

            <main className="dashboard-content">
                {/* Hero Greeting Section */}
                <section className="dashboard-hero-card">
                    <div className="dashboard-hero-content">
                        <div className="dashboard-hero-badges">
                            <span className="dashboard-theme-pill">WOMEN'S HEALTH &amp; WELL-BEING</span>
                            <span className="dashboard-date-pill">{getFormattedDate()}</span>
                        </div>

                        <h1 className="dashboard-hero-title">
                            {getGreeting()},{" "}
                            <span className="dashboard-hero-name">
                                {user?.name || "Member"}
                            </span>
                        </h1>

                        <p className="dashboard-hero-sub">
                            Your holistic health and cycle sanctuary. Sync workouts with your natural hormonal rhythm, scan meals with vision AI, and nurture everyday vitality.
                        </p>

                        {/* Quick Action Buttons */}
                        <div className="dashboard-quick-actions">
                            <Link to="/shared/cycle" className="dashboard-action-btn primary">
                                <Flower2 size={16} />
                                <span>Track Cycle</span>
                            </Link>

                            <Link to="/shared/nutrition" className="dashboard-action-btn secondary">
                                <Camera size={16} />
                                <span>Scan Meal Plate</span>
                            </Link>

                            <Link to="/shared/fitness" className="dashboard-action-btn secondary">
                                <Plus size={16} />
                                <span>Record Movement</span>
                            </Link>

                            <Link to="/shared/plan" className="dashboard-action-btn tertiary">
                                <CalendarDays size={16} />
                                <span>7-Day Cycle Plan</span>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Biometric Telemetry & Anomaly Alerts */}
                <AnomalyAlertsCard />

                {/* Health Features Grid */}
                <div className="dashboard-section-head">
                    <div>
                        <h2>Women's Health &amp; Activity Hub</h2>
                        <p>Intelligent cycle tracking, multimodal nutrition, and circadian rest.</p>
                    </div>
                </div>

                <div className="dashboard-hub-grid">
                    {/* Cycle Tracking Card */}
                    <Link to="/shared/cycle" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap cycle">
                                <Flower2 size={24} />
                            </div>
                            <span className="dashboard-hub-badge ml">
                                <HeartPulse size={12} /> FedCycle ML Model
                            </span>
                        </div>
                        <h3>Cycle Tracking &amp; Fertility</h3>
                        <p>
                            Predict upcoming period start dates, fertile windows, and log symptoms with machine learning.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Open cycle calendar</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>

                    {/* Fitness & Activity Card */}
                    <Link to="/shared/fitness" className="dashboard-hub-card">
                        <div className="dashboard-hub-top">
                            <div className="dashboard-hub-icon-wrap fitness">
                                <Activity size={24} />
                            </div>
                            <span className="dashboard-hub-badge ml">
                                <Flame size={12} /> ML Calorie Burn (R²: 0.96)
                            </span>
                        </div>
                        <h3>Movement &amp; Conditioning</h3>
                        <p>
                            Log yoga, cardio, and strength sessions with machine learning energy burn estimates.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Track workouts</span>
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
                            Photo-based meal analysis with itemized protein, iron, healthy fats, and macro balances.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Scan meal plate</span>
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
                        <h3>Hydration &amp; Electrolytes</h3>
                        <p>
                            Maintain fluid balance, track hourly milestones, and monitor daily hydration targets.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Log daily water</span>
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
                        <h3>Sleep &amp; Restorative Rest</h3>
                        <p>
                            Circadian rhythm consistency, sleep debt tracking, and AI-powered relaxation recommendations.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>View sleep recovery</span>
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
                                <Sparkle size={12} /> Holistic Analytics
                            </span>
                        </div>
                        <h3>Wellness Insights</h3>
                        <p>
                            Correlate cycle phases, sleep restorativeness, activity levels, and dietary habits in one place.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>Explore insights</span>
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
                                <Sparkles size={12} /> Cycle-Synced Plan
                            </span>
                        </div>
                        <h3>7-Day AI Plan</h3>
                        <p>
                            Adaptive 7-day workout and meal schedule calibrated to your current recovery phase.
                        </p>
                        <div className="dashboard-hub-footer">
                            <span>View personalized plan</span>
                            <ArrowRight size={15} />
                        </div>
                    </Link>
                </div>

                {/* Women's Self-Care & Restoration Section */}
                <section className="dashboard-personal-care-card">
                    <div className="dashboard-personal-care-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="dashboard-care-icon-bubble">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <h3>Women's Self-Care &amp; Hormonal Balance</h3>
                                <p>Harmonize your daily lifestyle, skin barrier, and energy levels with your cycle.</p>
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-care-tips-grid">
                        <div className="dashboard-care-tip-item">
                            <h4>Cycle-Synced Movement</h4>
                            <p>Channel high energy during follicular &amp; ovulatory phases with strength, and pivot to restorative yoga during luteal.</p>
                        </div>
                        <div className="dashboard-care-tip-item">
                            <h4>Skin Barrier &amp; Hydration</h4>
                            <p>Support natural elasticity with hyaluronic acid and ceramide moisturizers, paired with consistent water intake.</p>
                        </div>
                        <div className="dashboard-care-tip-item">
                            <h4>Evening Cortisol Wind-Down</h4>
                            <p>Incorporate magnesium-rich foods and 10 minutes of screen-free relaxation before bed to anchor deep sleep cycles.</p>
                        </div>
                    </div>
                </section>
            </main>

            {/* AI Coach Floating Widget */}
            <AICoachChat />
        </div>
    );
}
