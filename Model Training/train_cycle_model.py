"""
Train the HealthWiise cycle-length prediction model.

Task: given a person's previous menstrual cycle lengths, predict the length of the NEXT cycle.

Dataset (recommended): FedCycleData ("FedCycleData071012 (2).csv")
    Bull et al. 2019, "Real-world menstrual cycle characteristics of more than 600,000
    menstrual cycles", and the Fehring/Marquette fertility-awareness dataset
    (Kaggle / Harvard Dataverse: search "FedCycleData").
    Put the CSV in:  Model Training/data/FedCycleData.csv
    Columns used: ClientID, CycleNumber, LengthofCycle, LengthofLutealPhase

If the CSV is not present the script trains on a SYNTHETIC dataset so the pipeline still
works end to end. The data source is recorded in the metadata JSON.

Run from the project root with the backend venv:
    backend\\venv\\Scripts\\python.exe "Model Training\\train_cycle_model.py"
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import GroupShuffleSplit

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "data" / "FedCycleData.csv"
OUT_DIR = HERE.parent / "backend" / "app" / "models"
N_LAGS = 3
FEATURE_NAMES = ["lag1", "lag2", "lag3", "mean_all", "std_all", "mean_last3", "trend", "n_cycles"]


def load_real_dataset() -> tuple[pd.DataFrame, float]:
    df = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]
    for col in ("LengthofCycle", "LengthofLutealPhase", "CycleNumber"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    luteal = float(df["LengthofLutealPhase"].dropna().median())
    df = df.dropna(subset=["ClientID", "CycleNumber", "LengthofCycle"])
    df = df[(df["LengthofCycle"] >= 15) & (df["LengthofCycle"] <= 60)]
    df = df.sort_values(["ClientID", "CycleNumber"])
    return df.rename(columns={"ClientID": "user", "LengthofCycle": "length"})[["user", "length"]], luteal


def make_synthetic_dataset(n_users: int = 800, seed: int = 42) -> tuple[pd.DataFrame, float]:
    rng = np.random.default_rng(seed)
    rows = []
    for u in range(n_users):
        base = rng.normal(29, 3.2)
        sd = abs(rng.normal(2.4, 1.0)) + 0.8
        drift = rng.normal(0, 0.15)
        prev = 0.0
        for i in range(rng.integers(6, 25)):
            length = base + drift * i + 0.35 * prev + rng.normal(0, sd)
            if rng.random() < 0.04:  # occasional long/short outlier cycle
                length += rng.choice([-6, 8, 14])
            length = float(np.clip(round(length), 18, 55))
            prev = length - base
            rows.append((u, length))
    return pd.DataFrame(rows, columns=["user", "length"]), 14.0


def history_features(history: list[float]) -> list[float]:
    h = list(history)
    lags = [h[-k] if len(h) >= k else float(np.mean(h)) for k in (1, 2, 3)]
    last3 = h[-3:]
    trend = (h[-1] - h[0]) / max(len(h) - 1, 1)
    return lags + [
        float(np.mean(h)),
        float(np.std(h)),
        float(np.mean(last3)),
        float(trend),
        float(len(h)),
    ]


def build_supervised(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X, y, groups, base = [], [], [], []
    for user, g in df.groupby("user"):
        lengths = g["length"].astype(float).tolist()
        for i in range(2, len(lengths)):  # need >= 2 prior cycles
            hist = lengths[:i]
            X.append(history_features(hist))
            y.append(lengths[i])
            groups.append(user)
            base.append(float(np.mean(hist)))
    return np.array(X), np.array(y), np.array(groups), np.array(base)


def main() -> None:
    if DATA_PATH.exists():
        df, luteal = load_real_dataset()
        source = f"FedCycleData ({DATA_PATH.name})"
    else:
        print(f"[!] {DATA_PATH} not found - training on SYNTHETIC data. See the docstring to download FedCycleData.")
        df, luteal = make_synthetic_dataset()
        source = "synthetic"

    X, y, groups, base = build_supervised(df)
    print(f"Source: {source} | users: {df['user'].nunique()} | training rows: {len(y)}")

    # Split by person so no one appears in both train and test
    train_idx, test_idx = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=7).split(X, y, groups))

    model = GradientBoostingRegressor(
        n_estimators=250, learning_rate=0.05, max_depth=3, subsample=0.8, loss="absolute_error", random_state=7
    )
    model.fit(X[train_idx], y[train_idx])

    pred = model.predict(X[test_idx])
    mae = float(mean_absolute_error(y[test_idx], pred))
    baseline_mae = float(mean_absolute_error(y[test_idx], base[test_idx]))
    resid = np.abs(y[test_idx] - pred)
    within_3 = float(np.mean(resid <= 3))

    print(f"Model MAE:                {mae:.2f} days")
    print(f"Baseline (mean) MAE:      {baseline_mae:.2f} days")
    print(f"Predictions within 3 days: {within_3:.1%}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, OUT_DIR / "cycle_length_model.joblib")
    meta = {
        "model_name": "HealthWiise Cycle Length Predictor",
        "version": "1.0.0",
        "model_type": "GradientBoostingRegressor",
        "data_source": source,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_users": int(df["user"].nunique()),
        "n_training_rows": int(len(y)),
        "features": FEATURE_NAMES,
        "median_luteal_phase_days": round(luteal, 1),
        "test_metrics": {
            "mae_days": round(mae, 3),
            "baseline_mean_mae_days": round(baseline_mae, 3),
            "within_3_days": round(within_3, 3),
            "p80_abs_error_days": round(float(np.percentile(resid, 80)), 2),
        },
    }
    (OUT_DIR / "cycle_length_model_metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved model + metadata to {OUT_DIR}")


if __name__ == "__main__":
    sys.exit(main())
