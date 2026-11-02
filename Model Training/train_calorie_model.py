"""
Train the HealthWiise calorie-burn model.

Task: estimate calories burned in one workout session from body stats + workout details.

Dataset (recommended): "Gym Members Exercise Dataset" (Kaggle, by Vala Khorasani), ~973 rows.
    Put the CSV in:  Model Training/data/gym_members_exercise_tracking.csv
    Columns used: Age, Gender, Weight (kg), Height (m), Avg_BPM, Max_BPM,
                  Session_Duration (hours), Workout_Type, Calories_Burned

Features the app can supply: age, gender, weight, height, duration, workout type, and an
intensity ratio (Avg_BPM / Max_BPM). The app has no heart-rate sensor, so its light / moderate /
vigorous labels are mapped to the 25th / 50th / 75th percentile of that ratio (saved in metadata).

If the CSV is missing, a SYNTHETIC dataset (MET-based) is used so the pipeline still works.

Run from the project root with the backend venv:
    backend\\venv\\Scripts\\python.exe "Model Training\\train_calorie_model.py"
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "data" / "gym_members_exercise_tracking.csv"
OUT_DIR = HERE.parent / "backend" / "app" / "models"

NUMERIC = ["age", "weight_kg", "height_cm", "duration_min", "intensity_ratio"]
CATEGORICAL = ["gender", "workout_type"]
WORKOUT_TYPES = ["Cardio", "HIIT", "Strength", "Yoga"]


def load_real() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]
    out = pd.DataFrame(
        {
            "age": pd.to_numeric(df["Age"], errors="coerce"),
            "gender": df["Gender"].astype(str).str.strip().str.title(),
            "weight_kg": pd.to_numeric(df["Weight (kg)"], errors="coerce"),
            "height_cm": pd.to_numeric(df["Height (m)"], errors="coerce") * 100,
            "duration_min": pd.to_numeric(df["Session_Duration (hours)"], errors="coerce") * 60,
            "intensity_ratio": pd.to_numeric(df["Avg_BPM"], errors="coerce") / pd.to_numeric(df["Max_BPM"], errors="coerce"),
            "workout_type": df["Workout_Type"].astype(str).str.strip().str.title().replace({"Hiit": "HIIT"}),
            "calories": pd.to_numeric(df["Calories_Burned"], errors="coerce"),
        }
    )
    return out.dropna()


def make_synthetic(n: int = 3000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    met = {"Cardio": 8.0, "HIIT": 9.5, "Strength": 5.0, "Yoga": 2.8}
    rows = []
    for _ in range(n):
        wt = rng.choice(WORKOUT_TYPES)
        gender = rng.choice(["Male", "Female"])
        weight = rng.normal(80 if gender == "Male" else 63, 12)
        height = rng.normal(176 if gender == "Male" else 163, 7)
        age = rng.integers(18, 60)
        dur = float(np.clip(rng.normal(60, 20), 15, 150))
        ratio = float(np.clip(rng.normal(0.72, 0.07), 0.5, 0.92))
        kcal = met[wt] * (0.7 + (ratio - 0.5) * 1.6) * weight * dur / 60 * rng.normal(1, 0.06)
        rows.append((age, gender, weight, height, dur, ratio, wt, kcal))
    return pd.DataFrame(rows, columns=["age", "gender", "weight_kg", "height_cm", "duration_min", "intensity_ratio", "workout_type", "calories"])


def pipeline(model) -> Pipeline:
    pre = ColumnTransformer(
        [("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)], remainder="passthrough"
    )
    return Pipeline([("pre", pre), ("model", model)])


def main() -> None:
    if DATA_PATH.exists():
        df, source = load_real(), f"Gym Members Exercise Dataset ({DATA_PATH.name})"
    else:
        print(f"[!] {DATA_PATH} not found - training on SYNTHETIC data. See the docstring to download the dataset.")
        df, source = make_synthetic(), "synthetic"

    print(f"Source: {source} | rows: {len(df)}")
    X, y = df[NUMERIC + CATEGORICAL], df["calories"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=7)

    # Order columns so the numeric ones come last after one-hot (passthrough) - keep names stable
    model = pipeline(GradientBoostingRegressor(n_estimators=300, learning_rate=0.05, max_depth=3, subsample=0.8, random_state=7))
    model.fit(X_tr, y_tr)
    pred = model.predict(X_te)

    baseline = pipeline(LinearRegression()).fit(X_tr, y_tr)
    b_pred = baseline.predict(X_te)

    mae, r2 = float(mean_absolute_error(y_te, pred)), float(r2_score(y_te, pred))
    b_mae, b_r2 = float(mean_absolute_error(y_te, b_pred)), float(r2_score(y_te, b_pred))
    print(f"Model     MAE: {mae:.1f} kcal | R2: {r2:.3f}")
    print(f"Baseline  MAE: {b_mae:.1f} kcal | R2: {b_r2:.3f} (linear regression)")

    q = df["intensity_ratio"].quantile([0.25, 0.5, 0.75]).tolist()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, OUT_DIR / "calorie_burn_model.joblib")
    meta = {
        "model_name": "HealthWiise Calorie Burn Estimator",
        "version": "1.0.0",
        "model_type": "GradientBoostingRegressor Pipeline",
        "data_source": source,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_rows": int(len(df)),
        "numeric_features": NUMERIC,
        "categorical_features": CATEGORICAL,
        "workout_types": sorted(df["workout_type"].unique().tolist()),
        "intensity_ratio_map": {"light": round(q[0], 3), "moderate": round(q[1], 3), "vigorous": round(q[2], 3)},
        "test_metrics": {
            "mae_kcal": round(mae, 2),
            "r2": round(r2, 4),
            "baseline_linear_mae_kcal": round(b_mae, 2),
            "baseline_linear_r2": round(b_r2, 4),
        },
    }
    (OUT_DIR / "calorie_burn_model_metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved model + metadata to {OUT_DIR}")


if __name__ == "__main__":
    sys.exit(main())
