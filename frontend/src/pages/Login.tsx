
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            const user = await login({ email, password });

            if (!user.onboarding_completed || !user.dashboard_type) {
                navigate("/onboarding", { replace: true });
            } else {
                navigate(
                    user.dashboard_type === "mens"
                        ? "/mens/dashboard"
                        : "/womens/dashboard",
                    { replace: true }
                );
            }
        } catch {
            setError("Login failed. Check your email and password.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                <div className="brand-mark">H</div>
                <h1>Welcome back</h1>
                <p className="muted">Your health journey continues here.</p>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="email">Email address</label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    {error && <p className="error-message">{error}</p>}

                    <button type="submit" disabled={submitting}>
                        {submitting ? "Signing in..." : "Sign in"}
                    </button>
                </form>

                <p className="auth-footer">
                    New to HealthWiise? <Link to="/register">Create an account</Link>
                </p>
            </section>
        </main>
    );
}
