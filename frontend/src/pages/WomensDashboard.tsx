
import { Link } from "react-router-dom";
import { Flower2, Droplets, Moon, Utensils, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
export default function WomensDashboard() {
    const { user, logout } = useAuth();

    return (
        <main className="dashboard-page womens-theme">
            <header className="dashboard-header">
                <Link className="dashboard-brand" to="/womens/dashboard">
                    HealthWiise
                </Link>
                <button className="secondary-button" onClick={logout}>
                    Sign out
                </button>
            </header>

            <section className="dashboard-content">
                <p className="eyebrow">WOMEN'S WELLNESS</p>
                <h1>Welcome, {user?.name}</h1>
                <p className="muted">
                    Make space for movement, self-care, rest and everyday well-being.
                </p>

                <div className="feature-grid">
                    <Link to="/shared/cycle" className="feature-card">
                        <Flower2 />
                        <h2>Cycle Tracking</h2>
                        <p>Optional menstrual history and symptom records.</p>
                    </Link>

                    <Link to="/shared/fitness" className="feature-card">
                        <Flower2 />
                        <h2>Fitness & Activity</h2>
                        <p>Movement, workout goals and recovery.</p>
                    </Link>

                    <Link to="/shared/nutrition" className="feature-card">
                        <Utensils />
                        <h2>Nutrition</h2>
                        <p>Meals, hydration and nutrition goals.</p>
                    </Link>

                    <Link to="/shared/hydration" className="feature-card">
                        <Droplets />
                        <h2>Hydration</h2>
                        <p>Keep track of your water intake.</p>
                    </Link>

                    <Link to="/shared/sleep" className="feature-card">
                        <Moon />
                        <h2>Sleep & Well-being</h2>
                        <p>Sleep, energy and relaxation.</p>
                    </Link>

                    <Link to="/shared/wellness" className="feature-card">
                        <Sparkles />
                        <h2>Wellness Insights</h2>
                        <p>Unified habits, goals, weekly trends and cross-service insights.</p>
                    </Link>
                </div>

                <section className="dashboard-panel">
                    <h2>Self-Care</h2>
                    <p>Skincare, haircare, personal care and reminders.</p>
                    <p className="muted">
                        Detailed tracking and recommendations will be implemented in a later phase.
                    </p>
                </section>
            </section>
        </main>
    );
}
