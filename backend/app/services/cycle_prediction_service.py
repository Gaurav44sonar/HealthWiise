import json
import os
from datetime import date, timedelta

import joblib
import numpy as np

_model = None
_metadata = None

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
DEFAULT_CYCLE_LENGTH = 28.0
MIN_ML_CYCLES = 2  # needs at least 2 recorded cycle lengths (3 period starts)


def load_cycle_model():
    global _model, _metadata
    if _model is not None and _metadata is not None:
        return _model, _metadata
    model_path = os.path.join(MODEL_DIR, "cycle_length_model.joblib")
    meta_path = os.path.join(MODEL_DIR, "cycle_length_model_metadata.json")
    if not (os.path.exists(model_path) and os.path.exists(meta_path)):
        raise FileNotFoundError("Cycle length model not found. Run 'Model Training/train_cycle_model.py'.")
    _model = joblib.load(model_path)
    with open(meta_path, "r", encoding="utf-8") as f:
        _metadata = json.load(f)
    return _model, _metadata


def _features(history: list[float]) -> list[float]:
    # Must match history_features() in Model Training/train_cycle_model.py
    h = list(history)
    lags = [h[-k] if len(h) >= k else float(np.mean(h)) for k in (1, 2, 3)]
    trend = (h[-1] - h[0]) / max(len(h) - 1, 1)
    return lags + [
        float(np.mean(h)),
        float(np.std(h)),
        float(np.mean(h[-3:])),
        float(trend),
        float(len(h)),
    ]


def predict_next_cycle(cycle_lengths: list[int], last_start: date, avg_period_days: float | None) -> dict:
    """Predict next period start, ovulation day and fertile window from past cycle lengths."""
    lengths = [float(c) for c in cycle_lengths]
    method = "default"
    luteal = 14.0
    error_days = 4.0
    model_info = None

    if len(lengths) >= MIN_ML_CYCLES:
        try:
            model, meta = load_cycle_model()
            predicted = float(model.predict(np.array([_features(lengths)]))[0])
            method = "ml"
            luteal = float(meta.get("median_luteal_phase_days", 14.0))
            error_days = float(meta["test_metrics"].get("p80_abs_error_days", 3.0))
            model_info = {
                "model_name": meta.get("model_name"),
                "model_type": meta.get("model_type"),
                "data_source": meta.get("data_source"),
                "test_mae_days": meta["test_metrics"].get("mae_days"),
            }
        except Exception:
            predicted = float(np.mean(lengths))
            method = "average"
    elif lengths:
        predicted = float(np.mean(lengths))
        method = "average"
    else:
        predicted = DEFAULT_CYCLE_LENGTH

    predicted = float(np.clip(predicted, 18, 60))
    cycle_len = int(round(predicted))
    luteal_days = int(round(np.clip(luteal, 10, 16)))

    next_start = last_start + timedelta(days=cycle_len)
    ovulation = next_start - timedelta(days=luteal_days)
    fertile_start = ovulation - timedelta(days=5)
    fertile_end = ovulation + timedelta(days=1)
    margin = max(1, int(round(error_days)))

    return {
        "method": method,
        "predicted_cycle_length_days": cycle_len,
        "predicted_next_period_start": next_start.isoformat(),
        "next_period_earliest": (next_start - timedelta(days=margin)).isoformat(),
        "next_period_latest": (next_start + timedelta(days=margin)).isoformat(),
        "margin_days": margin,
        "estimated_ovulation_date": ovulation.isoformat(),
        "fertile_window_start": fertile_start.isoformat(),
        "fertile_window_end": fertile_end.isoformat(),
        "luteal_phase_days": luteal_days,
        "cycles_used": len(lengths),
        "model": model_info,
        "disclaimer": (
            "Predictions are statistical estimates from your logged cycles. They are not medical advice "
            "and must not be used as contraception or to diagnose any condition."
        ),
    }
