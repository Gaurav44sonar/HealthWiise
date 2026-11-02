from datetime import date, timedelta

import numpy as np
from sklearn.ensemble import IsolationForest

RECENT_DAYS = 3
BASELINE_DAYS = 27
MIN_BASELINE_LOGGED = 7
MIN_FOREST_DAYS = 14

METRICS = {
    "sleep": {"label": "Sleep", "unit": "h", "fill_missing_zero": False},
    "water": {"label": "Water intake", "unit": "ml", "fill_missing_zero": True},
    "activity": {"label": "Activity", "unit": "min", "fill_missing_zero": True},
}


def _robust_z(recent_mean: float, baseline: np.ndarray) -> tuple[float, float]:
    """Robust z-score of the recent mean against the user's own baseline (median / MAD)."""
    median = float(np.median(baseline))
    mad = float(np.median(np.abs(baseline - median))) * 1.4826
    scale = max(mad, abs(median) * 0.10, 1e-6)  # floor so very steady users don't over-trigger
    return (recent_mean - median) / scale, median


def _severity(z: float, forest_confirms: bool) -> str:
    if z <= -2.5 or (z <= -2.0 and forest_confirms):
        return "high"
    return "medium"


def detect_anomalies(daily: dict[str, dict[date, float]], today: date | None = None) -> dict:
    """
    daily: {"sleep": {date: hours}, "water": {date: ml}, "activity": {date: minutes}}
    Flags recent drops versus the user's own history and unusual overall days.
    """
    today = today or date.today()
    recent_dates = [today - timedelta(days=i) for i in range(RECENT_DAYS)]
    baseline_dates = [today - timedelta(days=i) for i in range(RECENT_DAYS, RECENT_DAYS + BASELINE_DAYS)]

    series: dict[str, dict[date, float]] = {}
    enough: dict[str, bool] = {}
    for key, cfg in METRICS.items():
        logged = daily.get(key, {})
        base_logged = [d for d in baseline_dates if d in logged]
        enough[key] = len(base_logged) >= MIN_BASELINE_LOGGED
        if cfg["fill_missing_zero"] and enough[key]:
            series[key] = {d: logged.get(d, 0.0) for d in baseline_dates + recent_dates}
        else:
            series[key] = {d: logged[d] for d in baseline_dates + recent_dates if d in logged}

    # Multivariate IsolationForest over days where every tracked metric has a value
    forest_flagged: set[date] = set()
    ready_keys = [k for k in METRICS if enough[k]]
    forest_used = False
    if len(ready_keys) >= 2:
        usable = [d for d in baseline_dates if all(d in series[k] for k in ready_keys)]
        if len(usable) >= MIN_FOREST_DAYS:
            forest_used = True
            X = np.array([[series[k][d] for k in ready_keys] for d in usable])
            forest = IsolationForest(n_estimators=150, contamination=0.1, random_state=7).fit(X)
            test_days = [d for d in recent_dates if all(d in series[k] for k in ready_keys)]
            if test_days:
                Xr = np.array([[series[k][d] for k in ready_keys] for d in test_days])
                # Only count days that are anomalous AND on the low side overall
                means = X.mean(axis=0)
                for d, row, flag in zip(test_days, Xr, forest.predict(Xr)):
                    if flag == -1 and np.mean(row / np.maximum(means, 1e-6)) < 1.0:
                        forest_flagged.add(d)

    alerts = []
    for key, cfg in METRICS.items():
        if not enough[key]:
            continue
        recent_vals = [series[key][d] for d in recent_dates if d in series[key]]
        if not recent_vals:
            continue
        base = np.array([series[key][d] for d in baseline_dates if d in series[key]])
        recent_mean = float(np.mean(recent_vals))
        z, median = _robust_z(recent_mean, base)
        drop_pct = (median - recent_mean) / median * 100 if median > 0 else 0.0
        if z <= -1.5 and drop_pct >= 20:
            alerts.append(
                {
                    "metric": key,
                    "label": cfg["label"],
                    "severity": _severity(z, bool(forest_flagged)),
                    "z_score": round(float(z), 2),
                    "recent_avg": round(recent_mean, 1),
                    "usual_avg": round(median, 1),
                    "drop_percent": round(drop_pct),
                    "unit": cfg["unit"],
                    "message": (
                        f"{cfg['label']} is down {round(drop_pct)}% over the last {len(recent_vals)} days "
                        f"({round(recent_mean, 1)}{cfg['unit']} vs your usual {round(median, 1)}{cfg['unit']})."
                    ),
                }
            )

    if len(forest_flagged) >= 2:
        alerts.append(
            {
                "metric": "overall",
                "label": "Overall pattern",
                "severity": "medium",
                "z_score": None,
                "recent_avg": None,
                "usual_avg": None,
                "drop_percent": None,
                "unit": "",
                "message": (
                    f"{len(forest_flagged)} of your last {RECENT_DAYS} days look unusually low across "
                    "sleep, water and activity compared with your normal routine."
                ),
            }
        )

    alerts.sort(key=lambda a: 0 if a["severity"] == "high" else 1)
    return {
        "has_enough_data": any(enough.values()),
        "metrics_monitored": [METRICS[k]["label"] for k in METRICS if enough[k]],
        "ml_forest_used": forest_used,
        "alerts": alerts,
        "disclaimer": (
            "Alerts compare your recent days with your own history using statistics (robust z-scores and an "
            "Isolation Forest model). They are informational wellness nudges, not medical advice."
        ),
    }
