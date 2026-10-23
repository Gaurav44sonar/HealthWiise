
import { Link } from "react-router-dom";
import { Dumbbell, Droplets, Moon, Utensils, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
export default function MensDashboard() {
    const { user, logout } = useAuth();

    return (
        <main className="dashboard-page mens-theme">
            <header className="dashboard-header">
                <Link className="dashboard-brand" to="/mens/dashboard">
                    HealthWiise
                </Link>
                <button className="secondary-button" onClick={logout}>
                    Sign out
                </button>
            </header>

            <section className="dashboard-content">
                <p className="eyebrow">MEN'S WELLNESS</p>
                <h1>Welcome, {user?.name}</h1>
                <p className="muted">
                    Build healthy routines, track your progress and take time to recover.
                </p>

                <div className="feature-grid">
                    <Link to="/shared/fitness" className="feature-card">
                        <Dumbbell />
                        <h2>Fitness & Strength</h2>
                        <p>Workouts, goals and recovery.</p>
                    </Link>

                    <Link to="/shared/nutrition" className="feature-card">
                        <Utensils />
                        <h2>Nutrition</h2>
                        <p>Meals and nutrition goals.</p>
                    </Link>

                    <Link to="/shared/hydration" className="feature-card">
                        <Droplets />
                        <h2>Hydration</h2>
                        <p>Keep track of your water intake.</p>
                    </Link>

                    <Link to="/shared/sleep" className="feature-card">
                        <Moon />
                        <h2>Sleep & Recovery</h2>
                        <p>Monitor rest and daily energy.</p>
                    </Link>

                    <Link to="/shared/wellness" className="feature-card">
                        <Sparkles />
                        <h2>Wellness Insights</h2>
                        <p>Unified habits, goals, weekly trends and cross-service insights.</p>
                    </Link>
                </div>

                <section className="dashboard-panel">
                    <h2>Men's Personal Care</h2>
                    <p>Hair care, beard care, skincare and grooming routines.</p>
                    <p className="muted">
                        Detailed tracking and recommendations will be implemented in a later phase.
                    </p>
                </section>
            </section>
        </main>
    );
}
