# HealthWiise — Sleep Quality Machine Learning Project

This directory contains the complete, reproducible Machine Learning workflow for training, benchmarking, and evaluating the **Sleep Quality Prediction Model** in the HealthWiise health and wellness application.

---

## 1. Project Objective

The primary objective is to build an accurate, reproducible, and leak-free regression model that predicts a user's subjective **Quality of Sleep** (rating on a $1$ to $10$ continuous scale) based on demographic, lifestyle, and physiological metrics:
- **Demographics**: Age, Gender, Occupation
- **Biometrics & Physical**: BMI Category, Systolic Blood Pressure, Diastolic Blood Pressure, Resting Heart Rate
- **Daily Habits**: Sleep Duration (hours), Physical Activity Level (min/day), Daily Steps, Stress Level (1-10)

Target Variable: `Quality of Sleep` (Supervised Regression).

---

## 2. Dataset Provenance & Overview

- **Dataset File**: `Sleep_health_and_lifestyle_dataset.csv`
- **Sample Size**: $374$ survey observations across $13$ attributes.
- **Missing Values**: Only present in `Sleep Disorder` ($219$ entries recorded as `None`/`NaN`), where missing values correspond to subjects without a diagnosed clinical sleep disorder.
- **Provenance & Integrity Notice**: This dataset represents observational and survey data commonly used in wellness exploratory studies. It is **not** derived from controlled clinical trials or clinical polysomnography (PSG) sleep studies. The model's predictions should always be presented to users as non-clinical wellness estimates, not medical evaluations or diagnoses.

---

## 3. Environment & Prerequisites

### Python Version
- Python 3.10+ or Python 3.11 (tested on Python 3.11.9)

### Dependencies
All required libraries are listed in `requirements.txt`:
```txt
numpy>=1.26.0,<2.0.0
pandas>=2.2.0,<3.0.0
scipy>=1.14.0
scikit-learn>=1.5.0,<1.6.0
joblib>=1.4.0
matplotlib>=3.8.0
seaborn>=0.13.0
jupyter>=1.0.0
notebook>=7.0.0
ipykernel>=6.29.0
nbclient>=0.10.0
nbformat>=5.10.0
```

### Installation
From the `Model Training` directory, run:
```bash
pip install -r requirements.txt
```

---

## 4. How to Launch & Run the Jupyter Notebook

### Launching Jupyter
Run the following command from this directory:
```bash
jupyter notebook HealthWiise_Sleep_Health_Model_Training.ipynb
```
Or launch JupyterLab:
```bash
jupyter lab
```

### Running the Notebook
1. Open `HealthWiise_Sleep_Health_Model_Training.ipynb`.
2. Select the `Python 3` kernel.
3. Click **Kernel** ➔ **Restart & Run All Cells**.
4. Every cell will execute in sequence, generating statistical summaries, high-resolution Matplotlib/Seaborn figures, cross-validation metrics, grid search tuning, and artifact serialization.

---

## 5. Notebook Structure (20 Dedicated Sections)

1. **Project Overview**: HealthWiise context, wellness philosophy, and ML goals.
2. **Problem Statement**: Formulation of the supervised regression problem.
3. **Dataset Description**: Attribute dictionary, data types, and research integrity notes.
4. **Library Imports**: Loading scientific and ML dependencies with high-DPI plot styling.
5. **Data Loading**: Pandas reading with verification of shape and sample rows.
6. **Data Quality Assessment**: Null percentages, duplicate checks, descriptive statistics, and categorical cardinality.
7. **Exploratory Data Analysis (EDA)**:
   - Distributions of age, sleep duration, quality of sleep, stress, activity, heart rate, and steps.
   - Gender differences across lifestyle and recovery metrics.
   - Bivariate relationship: Sleep Duration vs. Quality of Sleep ($r = 0.883$).
   - Bivariate relationship: Stress Level vs. Quality of Sleep ($r = -0.899$).
   - Physical Activity vs. Quality of Sleep.
   - Correlation Heatmap across all numerical features.
   - Sleep Disorder breakdown and missingness analysis.
   - Physiological outlier plausibility check.
8. **Data Cleaning**: BMI Category normalization (`Normal Weight` ➔ `Normal`) and Blood Pressure decomposition (`Systolic_BP` and `Diastolic_BP`).
9. **Feature Engineering & Preprocessing**: `ColumnTransformer` with `StandardScaler` for numerical metrics and `OneHotEncoder(handle_unknown='ignore')` for categorical features.
10. **Train-Test Split**: 80/20 train/test split with fixed `random_state=42`.
11. **Baseline Model**: Naive `DummyRegressor(strategy='mean')` baseline.
12. **Model Training**: Assembling leak-free `Pipeline` models for Ridge Linear Regression, Random Forest Regressor, and Gradient Boosting Regressor.
13. **Model Comparison**: 5-Fold Cross-Validation on the training set evaluating $R^2$, MAE, and RMSE.
14. **Hyperparameter Tuning**: `GridSearchCV` on the Random Forest pipeline optimizing tree depth, estimators, and leaf splits.
15. **Final Evaluation**: Assessing the tuned model against the unseen test set ($N=75$).
16. **Feature Importance & Interpretation**: MDI (Gini) importances, test-set Permutation Importance, Actual vs. Predicted scatter plot, and residual distribution analysis.
17. **Experiment With and Without Sleep Duration**: Side-by-side comparison of Experiment A (with duration) and Experiment B (without duration).
18. **Save the Final Model**: Exporting the fitted pipeline (`.joblib`) and metadata (`.json`), followed by sanity inference verification.
19. **Conclusions**: Summary of actionable wellness findings.
20. **Limitations & Future Improvements**: Dataset size, lack of longitudinal tracking, and responsible application boundaries.

---

## 6. Evaluation Metrics & Benchmarks

On the unseen test split ($20\%$, $N=75$), the tuned **Random Forest Regressor** achieved outstanding results:

| Metric | Dummy Regressor (Baseline) | Tuned Random Forest Pipeline | Relative Improvement |
| :--- | :---: | :---: | :---: |
| **Mean Absolute Error (MAE)** | $1.0267$ | **$0.0397$** | **$96.1\%$ error reduction** |
| **Root Mean Squared Error (RMSE)** | $1.2285$ | **$0.1316$** | **$89.3\%$ error reduction** |
| **$R^2$ Score** | $-0.0039$ | **$0.9885$** | **$+0.9924$ variance explained** |

### Ablation Findings (With vs. Without Sleep Duration)
- **Experiment A (With Sleep Duration)**: $R^2 = 0.9885$, $\text{MAE} = 0.0397$.
- **Experiment B (Without Sleep Duration)**: $R^2 = 0.8974$, $\text{MAE} = 0.2812$.
- *Conclusion*: Even when users do not log sleep duration, physiological and daytime lifestyle metrics (especially **Stress Level**, **Resting Heart Rate**, and **Blood Pressure**) still allow the model to estimate sleep quality with approximately $90\%$ explained variance.

---

## 7. Saved Artifacts

All trained artifacts are located in this directory:

1. **`sleep_quality_pipeline.joblib`**: Complete, self-contained Scikit-Learn `Pipeline` object containing the fitted `ColumnTransformer` (standard scaling + one-hot encoding) and the tuned `RandomForestRegressor`.
2. **`sleep_quality_model_metadata.json`**: Machine-readable specification documenting model version, training timestamp, exact feature ordering, evaluation metrics, best hyperparameters, and usage guidelines.
3. **`inference_example.py`**: Standalone execution script illustrating how to load the pipeline, pass raw user dictionaries, and obtain predicted sleep quality scores.

---

## 8. Standalone Inference Verification

To verify that the saved pipeline can be loaded and run standalone:
```bash
python inference_example.py
```

### Sample Output
```text
=================================================================
HealthWiise Machine Learning — Sleep Quality Inference Service
=================================================================
Model Name        : HealthWiise Sleep Quality Estimator (v1.0.0)
Model Architecture: RandomForestRegressor Pipeline (Scikit-Learn)
Test Evaluation   : R² = 0.9885, MAE = 0.0397
Target Scale      : 1 to 10 (Survey Scale)
-----------------------------------------------------------------

User Profile : Sarah (Engineer - High Recovery Routine)
  Inputs     : Sleep=7.8h | Stress=3/10 | Steps=8500 | BP=118/76
  Estimated Sleep Quality : 8.02 / 10.0

User Profile : David (Doctor - High Stress, Night Shifts)
  Inputs     : Sleep=5.8h | Stress=8/10 | Steps=4200 | BP=138/88
  Estimated Sleep Quality : 5.16 / 10.0

User Profile : Emma (Unseen Occupation Test - Fallback Check)
  Inputs     : Sleep=7.1h | Stress=5/10 | Steps=6500 | BP=122/80
  Estimated Sleep Quality : 7.96 / 10.0
=================================================================
```

---

## 9. FastAPI Integration Guidance for HealthWiise

To integrate this model into the HealthWiise FastAPI backend in a future phase:

1. **Copy Model Artifacts**: Copy `sleep_quality_pipeline.joblib` and `sleep_quality_model_metadata.json` to `backend/app/models/` or a dedicated AI service directory.
2. **Add Dependencies**: Ensure `scikit-learn` and `joblib` are present in `backend/requirements.txt`.
3. **Implement Endpoint**:
   ```python
   # Example endpoint in backend/app/api/ai.py
   import joblib
   import pandas as pd
   from fastapi import APIRouter, Depends
   from app.core.dependencies import get_current_user
   
   router = APIRouter(prefix="/ai", tags=["AI Wellness Estimates"])
   model = joblib.load("app/models/sleep_quality_pipeline.joblib")
   
   @router.post("/predict-sleep-quality")
   async def predict_quality(payload: SleepQualityInput, current_user: dict = Depends(get_current_user)):
       df_input = pd.DataFrame([payload.model_dump()])
       score = float(model.predict(df_input)[0])
       return {
           "estimated_sleep_quality": round(score, 1),
           "scale": "1 to 10",
           "disclaimer": "Informational wellness estimate, not a clinical diagnosis."
       }
   ```
4. **Data Sourcing**: The inputs can automatically pull from the user's existing HealthWiise `sleep_records` and `workout_entries` collections.
