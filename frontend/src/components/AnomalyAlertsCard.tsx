import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import api from "../services/api";

interface Alert {
    metric: string;
    label: string;
    severity: "high" | "medium";
    message: string;
}

interface AnomalyResponse {
    has_enough_data: boolean;
    metrics_monitored: string[];
    alerts: Alert[];
    disclaimer: string;
}

export default function AnomalyAlertsCard() {
    const [data, setData] = useState<AnomalyResponse | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        api.get<AnomalyResponse>("/api/ai/anomalies")
            .then((res) => active && setData(res.data))
            .catch(() => active && setFailed(true));
        return () => {
            active = false;
        };
    }, []);

    if (failed) return null;

    return (
        <section className="dashboard-panel" style={{ margin: "0 0 20px" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={20} /> Wellness Alerts
            </h2>

            {!data && <p className="muted">Checking your recent habits…</p>}

            {data && !data.has_enough_data && (
                <p className="muted">
                    Log at least a week of sleep, water or workouts and I'll alert you when something drops below your normal.
                </p>
            )}

            {data?.has_enough_data && data.alerts.length === 0 && (
                <p style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={18} style={{ color: "#2e7d32" }} />
                    All good. Your recent {data.metrics_monitored.join(", ").toLowerCase()} are in line with your usual routine.
                </p>
            )}

            {data?.alerts.map((a, i) => (
                <div
                    key={i}
                    role="alert"
                    style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 12px",
                        margin: "8px 0",
                        borderRadius: 10,
                        borderLeft: `4px solid ${a.severity === "high" ? "#c62828" : "#ed9b00"}`,
                        background: a.severity === "high" ? "#fdecea" : "#fff6e5",
                        color: "#3b2a1f",
                    }}
                >
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>
                        <strong>{a.label}:</strong> {a.message}
                    </span>
                </div>
            ))}

            {data && data.has_enough_data && (
                <p className="muted" style={{ fontSize: "0.78rem" }}>
                    {data.disclaimer}
                </p>
            )}
        </section>
    );
}
