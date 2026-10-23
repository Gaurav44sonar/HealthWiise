import { useState, type FormEvent } from "react";
import {
    Sparkles,
    Brain,
    Clock,
    TrendingUp,
    TrendingDown,
    Minus,
    AlertCircle,
    CheckCircle2,
    Info,
    Sliders,
    X,
    ChevronDown,
    ChevronUp,
    ShieldCheck,
    Target,
} from "lucide-react";
import api from "../services/api";
import type {
    AISleepInsightsResponse,
    MLPrediction,
    PredictionFormInputs,
} from "../types/aiSleep";

interface AISleepInsightsCardProps {
    insights: AISleepInsightsResponse | null;
    loading: boolean;
    error?: string;
    onRefresh: () => void;
    themeClass: string;
}

export default function AISleepInsightsCard({
    insights,
    loading,
    error,
    onRefresh,
    themeClass,
}: AISleepInsightsCardProps) {
    const [showModal, setShowModal] = useState(false);
    const [modalSubmitting, setModalSubmitting] = useState(false);
    const [modalError, setModalError] = useState("");
    const [modalPrediction, setModalPrediction] = useState<MLPrediction | null>(null);
    const [expandedRecId, setExpandedRecId] = useState<string | null>(null);

    // Form inputs state for prediction simulator
    const defaultDuration =
        typeof insights?.user_prefilled_inputs?.sleep_duration === "number"
            ? (insights.user_prefilled_inputs.sleep_duration as number)
            : 7.5;

    const [formInputs, setFormInputs] = useState<PredictionFormInputs>({
        age: 32,
        sleep_duration: defaultDuration,
        physical_activity_level: 60,
        stress_level: 5,
        heart_rate: 68,
        daily_steps: 8000,
        systolic_bp: 120,
        diastolic_bp: 80,
        gender: themeClass.includes("womens") ? "Female" : "Male",
        occupation: "Engineer",
        bmi_category: "Normal",
    });

    const activePrediction = modalPrediction || insights?.prediction;

    const handleSimulateSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setModalSubmitting(true);
        setModalError("");

        try {
            const res = await api.post<MLPrediction>("/api/ai/sleep-quality/predict", {
                age: Number(formInputs.age),
                sleep_duration: Number(formInputs.sleep_duration),
                physical_activity_level: Number(formInputs.physical_activity_level),
                stress_level: Number(formInputs.stress_level),
                heart_rate: Number(formInputs.heart_rate),
                daily_steps: Number(formInputs.daily_steps),
                systolic_bp: Number(formInputs.systolic_bp),
                diastolic_bp: Number(formInputs.diastolic_bp),
                gender: formInputs.gender,
                occupation: formInputs.occupation,
                bmi_category: formInputs.bmi_category,
            });

            setModalPrediction(res.data);
        } catch (err: unknown) {
            const resErr = (err as { response?: { data?: { detail?: string | { msg?: string }[] } } })
                .response?.data?.detail;
            if (typeof resErr === "string") {
                setModalError(resErr);
            } else if (Array.isArray(resErr) && resErr.length > 0) {
                setModalError(resErr[0]?.msg || "Failed to predict sleep quality.");
            } else {
                setModalError("Unable to calculate prediction. Please verify your inputs.");
            }
        } finally {
            setModalSubmitting(false);
        }
    };

    const getScoreBadgeClass = (score: number) => {
        if (score >= 8.0) return "ai-score-high";
        if (score >= 6.0) return "ai-score-med";
        return "ai-score-low";
    };

    const getConsistencyBadgeClass = (level: string) => {
        if (level === "Consistent") return "ai-badge-consistent";
        if (level === "Moderate") return "ai-badge-moderate";
        if (level === "Irregular") return "ai-badge-irregular";
        return "ai-badge-neutral";
    };

    return (
        <section className={`sleep-card ai-sleep-insights-section ${themeClass}`}>
            {/* Header */}
            <div className="sleep-card-header ai-header-row">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="ai-icon-bubble">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                            AI Sleep Insights
                        </h2>
                        <span className="ai-status-pill">
                            <Brain size={12} />
                            {insights?.model_available
                                ? "Trained ML Model (Random Forest) & Rule Engine"
                                : "History & Rule-Based Analytics"}
                        </span>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        type="button"
                        className="hydration-action-btn ai-simulate-btn"
                        onClick={() => setShowModal(true)}
                    >
                        <Sliders size={14} />
                        <span>{activePrediction ? "Adjust Biometrics" : "Estimate Score with AI"}</span>
                    </button>
                </div>
            </div>

            {loading && !insights ? (
                <div style={{ padding: 24 }}>
                    <div className="skeleton-line" style={{ width: "50%", margin: "0 auto 12px" }} />
                    <div className="skeleton-line" style={{ width: "80%", margin: "0 auto" }} />
                </div>
            ) : error ? (
                <div className="nutrition-error" style={{ margin: 16 }}>
                    <AlertCircle size={18} />
                    <span>{error}</span>
                    <button
                        type="button"
                        className="hydration-secondary-btn"
                        onClick={onRefresh}
                        style={{ marginLeft: "auto" }}
                    >
                        Retry
                    </button>
                </div>
            ) : insights ? (
                <div className="ai-insights-content">
                    {/* Top Row: ML Score + Historical Consistency */}
                    <div className="ai-overview-grid">
                        {/* ML Prediction Score Card */}
                        <div className="ai-score-card">
                            <div className="ai-score-label">
                                <Brain size={15} />
                                <span>Estimated Sleep Quality (1–10)</span>
                            </div>

                            {activePrediction ? (
                                <div className="ai-score-display">
                                    <div className={`ai-score-number ${getScoreBadgeClass(activePrediction.estimated_sleep_quality ?? 7.5)}`}>
                                        {(activePrediction.estimated_sleep_quality ?? 0).toFixed(1)}
                                        <span className="ai-score-max">/10</span>
                                    </div>
                                    <div className="ai-score-meta">
                                        <span className="ai-rating-pill">
                                            {activePrediction.rating_category || ((activePrediction.estimated_sleep_quality ?? 0) >= 8 ? "High Sleep Quality" : "Moderate Rest")}
                                        </span>
                                        <p className="ai-score-algorithm">
                                            {activePrediction.model_algorithm || activePrediction.model_name || "Tuned Random Forest"} • R²: {(activePrediction.evaluation_r2 ?? 0.9885).toFixed(4)}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="ai-score-placeholder">
                                    <Info size={16} />
                                    <div>
                                        <strong>Biometrics Needed for ML Score</strong>
                                        <p>
                                            Provide your resting heart rate, blood pressure, and stress level to generate a tailored ML prediction.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="hydration-secondary-btn"
                                        onClick={() => setShowModal(true)}
                                        style={{ fontSize: 12, padding: "5px 10px" }}
                                    >
                                        Configure
                                    </button>
                                </div>
                            )}

                            <p className="ai-score-disclaimer">
                                <ShieldCheck size={12} />
                                Experimental wellness estimate. Not intended as medical diagnosis.
                            </p>
                        </div>

                        {/* Consistency & Schedule Health Card */}
                        <div className="ai-consistency-card">
                            <div className="ai-score-label">
                                <Clock size={15} />
                                <span>Schedule Consistency &amp; Rhythm</span>
                            </div>

                            <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "10px 0 6px" }}>
                                <span className={`ai-consistency-badge ${getConsistencyBadgeClass(insights.schedule_consistency.consistency_level)}`}>
                                    {insights.schedule_consistency.consistency_level}
                                </span>
                                {insights.schedule_consistency.bedtime_variance_minutes !== null && (
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                                        ±{insights.schedule_consistency.bedtime_variance_minutes}m variance
                                    </span>
                                )}
                            </div>

                            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 10px", lineHeight: 1.45 }}>
                                {insights.schedule_consistency.description}
                            </p>

                            {/* Duration Trend */}
                            <div className="ai-trend-pill">
                                {insights.duration_trend.direction === "improving" ? (
                                    <TrendingUp size={15} style={{ color: "#16a34a" }} />
                                ) : insights.duration_trend.direction === "declining" ? (
                                    <TrendingDown size={15} style={{ color: "#e11d48" }} />
                                ) : (
                                    <Minus size={15} style={{ color: "var(--muted)" }} />
                                )}
                                <span>{insights.duration_trend.description}</span>
                            </div>
                        </div>
                    </div>

                    {/* Analytics Summary Bar */}
                    <div className="ai-analytics-strip">
                        <div className="ai-stat-item">
                            <span className="ai-stat-label">7-Day Avg Sleep</span>
                            <span className="ai-stat-val">
                                {insights.analytics_7d.avg_sleep_duration_hours !== null
                                    ? `${insights.analytics_7d.avg_sleep_duration_hours}h`
                                    : "—"}
                            </span>
                            <span className="ai-stat-sub">
                                {insights.analytics_7d.total_logged_nights} nights recorded
                            </span>
                        </div>

                        <div className="ai-stat-item">
                            <span className="ai-stat-label">7-Day Goal Met</span>
                            <span className="ai-stat-val">
                                {insights.analytics_7d.goal_completion_rate !== null
                                    ? `${insights.analytics_7d.goal_completion_rate}%`
                                    : "—"}
                            </span>
                            <span className="ai-stat-sub">
                                Target: {(insights.goal_minutes / 60).toFixed(1)}h
                            </span>
                        </div>

                        <div className="ai-stat-item">
                            <span className="ai-stat-label">30-Day Avg Sleep</span>
                            <span className="ai-stat-val">
                                {insights.analytics_30d.avg_sleep_duration_hours !== null
                                    ? `${insights.analytics_30d.avg_sleep_duration_hours}h`
                                    : "—"}
                            </span>
                            <span className="ai-stat-sub">
                                {insights.analytics_30d.total_logged_nights} nights recorded
                            </span>
                        </div>

                        <div className="ai-stat-item">
                            <span className="ai-stat-label">30-Day Goal Met</span>
                            <span className="ai-stat-val">
                                {insights.analytics_30d.goal_completion_rate !== null
                                    ? `${insights.analytics_30d.goal_completion_rate}%`
                                    : "—"}
                            </span>
                            <span className="ai-stat-sub">Long-term consistency</span>
                        </div>
                    </div>

                    {/* Rule-Based Personalized Recommendations */}
                    <div className="ai-recommendations-section">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                                <Target size={18} style={{ color: "var(--primary)" }} />
                                Personalized Wellness Recommendations
                            </h3>
                            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                                {insights.recommendations.length} action items
                            </span>
                        </div>

                        {insights.recommendations.length === 0 ? (
                            <div className="ai-empty-recs">
                                <CheckCircle2 size={18} style={{ color: "var(--primary)" }} />
                                <span>No active alerts. Continue maintaining your consistent sleep schedule!</span>
                            </div>
                        ) : (
                            <div className="ai-recs-grid">
                                {insights.recommendations.map((rec) => {
                                    const isExpanded = expandedRecId === rec.id;
                                    return (
                                        <div key={rec.id} className={`ai-rec-card ai-rec-${rec.category}`}>
                                            <div className="ai-rec-top">
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span className={`ai-cat-badge ai-cat-${rec.category}`}>
                                                        {rec.category.toUpperCase()}
                                                    </span>
                                                    <h4>{rec.title}</h4>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="ai-expand-btn"
                                                    onClick={() => setExpandedRecId(isExpanded ? null : rec.id)}
                                                    aria-label="Toggle rule details"
                                                >
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                            </div>

                                            <p className="ai-rec-explanation">{rec.explanation}</p>

                                            <div className="ai-rec-action-box">
                                                <strong>Suggested Action:</strong> {rec.action || rec.suggested_action}
                                            </div>

                                            {/* Expandable Transparent Rule Logic */}
                                            {isExpanded && (
                                                <div className="ai-rec-details-panel">
                                                    <div className="ai-rule-row">
                                                        <span className="ai-rule-tag">Triggered Rule:</span>
                                                        <span>{rec.triggered_by || rec.rule_triggered || rec.title}</span>
                                                    </div>
                                                    {(rec.observation || rec.triggered_by) && (
                                                        <div className="ai-rule-row">
                                                            <span className="ai-rule-tag">Observed Data:</span>
                                                            <span>{rec.observation || rec.triggered_by}</span>
                                                        </div>
                                                    )}
                                                    <div className="ai-rule-row">
                                                        <span className="ai-rule-tag">Data Baseline:</span>
                                                        <span>
                                                            {(rec.data_sufficient ?? rec.based_on_sufficient_data)
                                                                ? "✓ Supported by sufficient historical records"
                                                                : "⚠ Limited baseline — preliminary suggestion"}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {/* Interactive Biometrics & Prediction Simulator Modal */}
            {showModal && (
                <div className="ai-modal-overlay" role="dialog" aria-modal="true">
                    <div className="ai-modal-card">
                        <div className="ai-modal-head">
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Brain size={20} style={{ color: "var(--primary)" }} />
                                <h3>Machine-Learning Sleep Quality Estimator</h3>
                            </div>
                            <button
                                type="button"
                                className="ai-modal-close"
                                onClick={() => setShowModal(false)}
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 16px", lineHeight: 1.5 }}>
                            Simulate or adjust your biometrics to evaluate sleep quality predictions using HealthWiise's trained Random Forest regression pipeline.
                        </p>

                        {modalError && (
                            <div className="nutrition-error" style={{ marginBottom: 14 }}>
                                <AlertCircle size={16} />
                                <span>{modalError}</span>
                            </div>
                        )}

                        {modalPrediction && (
                            <div className="ai-modal-result-box">
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 750, color: "var(--muted)", textTransform: "uppercase" }}>
                                            Predicted Sleep Score
                                        </div>
                                        <div className="ai-modal-score-val">
                                            {(modalPrediction.estimated_sleep_quality ?? 0).toFixed(1)} <small>/ 10</small>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <span className="ai-rating-pill">
                                            {modalPrediction.rating_category || ((modalPrediction.estimated_sleep_quality ?? 0) >= 8 ? "High Sleep Quality" : "Moderate Rest")}
                                        </span>
                                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                                            R²: {(modalPrediction.evaluation_r2 ?? 0.9885).toFixed(4)} • MAE: {(modalPrediction.evaluation_mae ?? 0.0397).toFixed(4)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={(e) => void handleSimulateSubmit(e)} className="ai-simulator-form">
                            <div className="ai-form-2col">
                                <div className="sleep-form-group">
                                    <label htmlFor="ai-age">Age (years)</label>
                                    <input
                                        id="ai-age"
                                        type="number"
                                        min="18"
                                        max="100"
                                        className="sleep-input"
                                        value={formInputs.age}
                                        onChange={(e) => setFormInputs({ ...formInputs, age: Number(e.target.value) })}
                                        required
                                    />
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="ai-duration">Sleep Duration (hrs)</label>
                                    <input
                                        id="ai-duration"
                                        type="number"
                                        step="0.1"
                                        min="3.0"
                                        max="14.0"
                                        className="sleep-input"
                                        value={formInputs.sleep_duration}
                                        onChange={(e) => setFormInputs({ ...formInputs, sleep_duration: Number(e.target.value) })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="ai-form-2col">
                                <div className="sleep-form-group">
                                    <label htmlFor="ai-hr">Resting Heart Rate (bpm)</label>
                                    <input
                                        id="ai-hr"
                                        type="number"
                                        min="40"
                                        max="120"
                                        className="sleep-input"
                                        value={formInputs.heart_rate}
                                        onChange={(e) => setFormInputs({ ...formInputs, heart_rate: Number(e.target.value) })}
                                        required
                                    />
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="ai-steps">Daily Steps</label>
                                    <input
                                        id="ai-steps"
                                        type="number"
                                        min="1000"
                                        max="30000"
                                        step="500"
                                        className="sleep-input"
                                        value={formInputs.daily_steps}
                                        onChange={(e) => setFormInputs({ ...formInputs, daily_steps: Number(e.target.value) })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="ai-form-2col">
                                <div className="sleep-form-group">
                                    <label htmlFor="ai-sys-bp">Systolic BP (mmHg)</label>
                                    <input
                                        id="ai-sys-bp"
                                        type="number"
                                        min="80"
                                        max="200"
                                        className="sleep-input"
                                        value={formInputs.systolic_bp}
                                        onChange={(e) => setFormInputs({ ...formInputs, systolic_bp: Number(e.target.value) })}
                                        required
                                    />
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="ai-dia-bp">Diastolic BP (mmHg)</label>
                                    <input
                                        id="ai-dia-bp"
                                        type="number"
                                        min="50"
                                        max="130"
                                        className="sleep-input"
                                        value={formInputs.diastolic_bp}
                                        onChange={(e) => setFormInputs({ ...formInputs, diastolic_bp: Number(e.target.value) })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="ai-form-2col">
                                <div className="sleep-form-group">
                                    <label htmlFor="ai-stress">Stress Level (1–10: Low to High)</label>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <input
                                            id="ai-stress"
                                            type="range"
                                            min="1"
                                            max="10"
                                            value={formInputs.stress_level}
                                            onChange={(e) => setFormInputs({ ...formInputs, stress_level: Number(e.target.value) })}
                                            style={{ flex: 1 }}
                                        />
                                        <span style={{ fontWeight: 800, fontSize: 15, width: 24, textAlign: "center" }}>
                                            {formInputs.stress_level}
                                        </span>
                                    </div>
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="ai-bmi">BMI Category</label>
                                    <select
                                        id="ai-bmi"
                                        className="sleep-input"
                                        value={formInputs.bmi_category}
                                        onChange={(e) =>
                                            setFormInputs({
                                                ...formInputs,
                                                bmi_category: e.target.value as "Normal" | "Overweight" | "Obese",
                                            })
                                        }
                                    >
                                        <option value="Normal">Normal</option>
                                        <option value="Overweight">Overweight</option>
                                        <option value="Obese">Obese</option>
                                    </select>
                                </div>
                            </div>

                            <div className="ai-form-2col">
                                <div className="sleep-form-group">
                                    <label htmlFor="ai-occupation">Occupation Role</label>
                                    <select
                                        id="ai-occupation"
                                        className="sleep-input"
                                        value={formInputs.occupation}
                                        onChange={(e) => setFormInputs({ ...formInputs, occupation: e.target.value })}
                                    >
                                        <option value="Engineer">Engineer</option>
                                        <option value="Doctor">Doctor</option>
                                        <option value="Nurse">Nurse</option>
                                        <option value="Lawyer">Lawyer</option>
                                        <option value="Teacher">Teacher</option>
                                        <option value="Accountant">Accountant</option>
                                        <option value="Salesperson">Salesperson</option>
                                        <option value="Software Engineer">Software Engineer</option>
                                        <option value="Scientist">Scientist</option>
                                        <option value="Manager">Manager</option>
                                    </select>
                                </div>

                                <div className="sleep-form-group">
                                    <label htmlFor="ai-activity">Activity (mins/day)</label>
                                    <input
                                        id="ai-activity"
                                        type="number"
                                        min="0"
                                        max="180"
                                        className="sleep-input"
                                        value={formInputs.physical_activity_level}
                                        onChange={(e) =>
                                            setFormInputs({ ...formInputs, physical_activity_level: Number(e.target.value) })
                                        }
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                                <button
                                    type="submit"
                                    className="hydration-action-btn"
                                    disabled={modalSubmitting}
                                    style={{ flex: 1 }}
                                >
                                    {modalSubmitting ? "Predicting with ML..." : "Calculate ML Prediction"}
                                </button>
                                <button
                                    type="button"
                                    className="hydration-secondary-btn"
                                    onClick={() => setShowModal(false)}
                                    disabled={modalSubmitting}
                                >
                                    Done
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </section>
    );
}
