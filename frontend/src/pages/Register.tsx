
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../services/auth";

export default function Register() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            await registerUser({ name, email, password });
            navigate("/login", {
                replace: true,
                state: { message: "Account created. Please sign in." },
            });
        } catch (err: unknown) {
            const response = (
                err as { response?: { data?: { detail?: string } } }
            ).response;

            setError(
                response?.data?.detail ||
                "Could not create your account. Please try again."
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                <div className="brand-mark">H</div>
                <h1>Create your account</h1>
                <p className="muted">Start building healthier everyday habits.</p>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="name">Full name</label>
                    <input
                        id="name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        minLength={2}
                        maxLength={100}
                        required
                    />

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
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={12}
                        maxLength={128}
                        required
                    />

                    {error && <p className="error-message">{error}</p>}

                    <button type="submit" disabled={submitting}>
                        {submitting ? "Creating account..." : "Create account"}
                    </button>
                </form>

                <p className="auth-footer">
                    Already registered? <Link to="/login">Sign in</Link>
                </p>
            </section>
        </main>
    );
}
