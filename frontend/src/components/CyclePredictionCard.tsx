import { useEffect, useState } from "react";
import { Brain, CalendarHeart, Sprout } from "lucide-react";
import api from "../services/api";

interface MLCyclePrediction {
    has_prediction: boolean;
    reason?: string;
    method?: "ml" | "average" | "default";
    predicted_cycle_length_days?: number;
    predicted_next_period_start?: string;
    next_period_earliest?: string;
    next_period_latest?: string;
    estimated_ovulation_date?: string;
    fertile_window_start?: string;
    fertile_window_end?: string;
    cycles_used?: number;
    model?: { model_name: string; data_source: string; test_mae_days: number } | null;
    disclaimer?: string;
}

function fmt(iso?: string) {
    if (!iso) return "—";
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysUntil(iso?: string) {
    if (!iso) return null;
    const diff = Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
    return diff;
}

export default function CyclePredictionCard({ refreshKey }: { refreshKey: number }) {
    const [data, setData] = useState<MLCyclePrediction | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        api.get<MLCyclePrediction>("/api/cycle/ml-prediction")
            .then((res) => {
                if (active) {
                    setData(res.data);
                    setFailed(false);
                }
            })
            .catch(() => active && setFailed(true));
        return () => {
            active = false;
        };
    }, [refreshKey]);

    const until = daysUntil(data?.predicted_next_period_start);

    return (
        <section className="dashboard-panel" style={{ margin: "16px 0" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Brain size={20} /> AI Cycle Prediction
            </h2>

            {failed && <p className="muted">Prediction is unavailable right now.</p>}
            {!failed && !data && <p className="muted">Calculating…</p>}
            {data && !data.has_prediction && <p className="muted">{data.reason}</p>}

            {data?.has_prediction && (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                        <div>
                            <p className="muted" style={{ margin: 0 }}>
                                <CalendarHeart size={14} /> Next period
                            </p>
                            <strong style={{ fontSize: "1.4rem" }}>{fmt(data.predicted_next_period_start)}</strong>
                            <p className="muted" style={{ margin: 0 }}>
                                {until === null ? "" : until >= 0 ? `in ${until} days` : `${Math.abs(until)} days late`} · likely{" "}
                                {fmt(data.next_period_earliest)} – {fmt(data.next_period_latest)}
                            </p>
                        </div>
                        <div>
                            <p className="muted" style={{ margin: 0 }}>
                                <Sprout size={14} /> Fertile window
                            </p>
                            <strong style={{ fontSize: "1.4rem" }}>
                                {fmt(data.fertile_window_start)} – {fmt(data.fertile_window_end)}
                            </strong>
                            <p className="muted" style={{ margin: 0 }}>
                                Estimated ovulation {fmt(data.estimated_ovulation_date)}
                            </p>
                        </div>
                        <div>
                            <p className="muted" style={{ margin: 0 }}>Predicted cycle length</p>
                            <strong style={{ fontSize: "1.4rem" }}>{data.predicted_cycle_length_days} days</strong>
                            <p className="muted" style={{ margin: 0 }}>
                                {data.method === "ml"
                                    ? `ML model · ${data.cycles_used} cycles analysed`
                                    : `Simple average · log more periods for ML (needs 3 period starts)`}
                            </p>
                        </div>
                    </div>
                    {data.model && (
                        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
                            {data.model.model_name} · trained on {data.model.data_source} data · avg error ±
                            {data.model.test_mae_days} days
                        </p>
                    )}
                    <p className="muted" style={{ fontSize: "0.78rem" }}>{data.disclaimer}</p>
                </>
            )}
        </section>
    );
}
