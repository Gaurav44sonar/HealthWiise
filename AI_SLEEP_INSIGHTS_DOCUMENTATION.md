# HealthWiise — AI Sleep Insights & Machine Learning Integration

This document outlines the architecture, implementation, historical analytics calculations, deterministic rule engine, and testing instructions for the **AI Sleep Insights** feature in HealthWiise.

---

## 1. Architecture Overview

The HealthWiise AI Sleep Insights feature integrates three complementary tiers:
1. **Trained Machine Learning Model**: Predicts an estimated sleep quality score (1.0 to 10.0 scale) based on lifestyle, physical activity, and biometric parameters using a tuned Scikit-Learn Random Forest regression pipeline.
2. **Real User Sleep History Analytics**: Analyzes real user records stored in MongoDB (7-day and 30-day analytics, goal completion percentage, bedtime/wake-time variance, and multi-week duration trends).
3. **Transparent Rule-Based Recommendations**: Deterministic, explainable wellness suggestions derived strictly from user patterns and configured goals (Rules A through G), providing clear rationale and suggested actions.

```
┌────────────────────────────────────────────────────────┐
│                      Frontend                          │
│     React + TypeScript + Vite + Tailwind CSS           │
│   (/shared/sleep & summary on /shared/wellness)        │
└──────────────────────────┬─────────────────────────────┘
                           │ Axios (JWT Authenticated)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   FastAPI Backend                      │
│               (app/api/ai.py Router)                   │
├──────────────────────────┬─────────────────────────────┤
│                          │                             │
│ 1. AI Sleep Service      │ 2. MongoDB Sleep Records    │
│    - Singleton Model     │    - Per-user isolation     │
│    - Scikit-Learn        │    - 7d / 30d analytics     │
│    - ColumnTransformer   │    - Bedtime variance       │
│                          │                             │
│ 3. Rule Engine           │                             │
│    - Rules A to G        │                             │
│    - Transparent tags    │                             │
└──────────────────────────┴─────────────────────────────┘
```

---

## 2. Model Storage & Singleton Loading

### Artifact Locations
- Master Training Artifact: `Model Training/sleep_quality_pipeline.joblib`
- Production Backend Artifact: `backend/app/models/sleep_quality_pipeline.joblib`
- Metadata & Feature Schema: `Model Training/sleep_quality_model_metadata.json` & `backend/app/models/sleep_quality_model_metadata.json`

### Loading Pattern
- **Singleton Lifecycle**: The model is loaded once when requested or at FastAPI startup by `app.services.ai_sleep_service.load_sleep_model()`.
- **Zero Per-Request Overhead**: Consecutive requests reuse the cached in-memory pipeline. The model is never retrained on live requests.
- **Leak-Free Transformation**: The loaded artifact contains both the preprocessing pipeline (`ColumnTransformer` with `StandardScaler` and `OneHotEncoder(handle_unknown='ignore')`) and the fitted `RandomForestRegressor`.

---

## 3. Required Input Features & Validation

The model accepts 11 input features validated by Pydantic (`app.schemas.ai_sleep.SleepQualityPredictionInput`):

| Feature Name | Type | Range / Options | HealthWiise Mapping |
| :--- | :--- | :--- | :--- |
| `age` | Integer | $18 - 100$ | Biometric query parameter / user input |
| `sleep_duration` | Float | $3.0 - 14.0$ (hours) | Automatically prefilled from user's latest recorded sleep or query override |
| `physical_activity_level`| Float | $0 - 180$ (mins/day) | Derived from fitness service or user input |
| `stress_level` | Integer | $1 - 10$ | User slider / biometric input |
| `heart_rate` | Integer | $40 - 120$ (bpm) | Biometric input |
| `daily_steps` | Integer | $1000 - 30000$ | Fitness tracking or user input |
| `systolic_bp` | Float | $80 - 200$ (mmHg) | Biometric blood pressure input |
| `diastolic_bp` | Float | $50 - 130$ (mmHg) | Biometric blood pressure input |
| `gender` | String | `"Male"`, `"Female"` | User profile (`dashboard_type`) |
| `occupation` | String | e.g. `"Engineer"`, `"Doctor"`, etc. | User demographic profile |
| `bmi_category` | String | `"Normal"`, `"Overweight"`, `"Obese"` | Calculated from height & weight |

### Output Format
- Target: `Quality of Sleep` ($1.0 - 10.0$ continuous scale).
- Category: `"Exceptional Sleep Quality"`, `"High Sleep Quality"`, `"Moderate Sleep Quality"`, `"Below Average Sleep Quality"`.
- Metrics: Model Algorithm: `Tuned Random Forest Regressor`, $R^2 = 0.9885$, $\text{MAE} = 0.0397$.

---

## 4. API Endpoints

### 1. Direct ML Prediction
- **Route**: `POST /api/ai/sleep-quality/predict`
- **Auth**: Protected via JWT (`get_current_user`).
- **Body**: JSON matching `SleepQualityPredictionInput`.
- **Response**: `SleepQualityPredictionResponse` containing the score, scale ($1-10$), rating category, evaluation metrics ($R^2$, $\text{MAE}$), and educational disclaimer.

### 2. Unified AI Sleep Insights
- **Route**: `GET /api/ai/sleep-insights`
- **Auth**: Protected via JWT (`get_current_user`).
- **Query Parameters**: Optional biometric overrides (`age`, `stress_level`, `heart_rate`, `daily_steps`, `systolic_bp`, `diastolic_bp`, `sleep_duration`, `occupation`, `bmi_category`).
- **Response**: `AISleepInsightsResponse`:
  - `model_available`: `true`/`false`.
  - `prediction`: ML prediction object if biometrics are supplied, or `null`.
  - `missing_prediction_inputs`: Explicit array of missing inputs (e.g., `["Resting Heart Rate", "Stress Level"]`).
  - `analytics_7d`: 7-day average duration, efficiency, recorded quality, and goal completion rate.
  - `analytics_30d`: 30-day average duration and goal completion rate.
  - `schedule_consistency`: Bedtime variance in minutes and rhythm rating (`"Consistent"`, `"Moderate"`, `"Irregular"`).
  - `duration_trend`: Multi-week slope (`"improving"`, `"declining"`, `"stable"`, or `"insufficient_data"`).
  - `recommendations`: Array of triggered rule recommendations.
  - `disclaimer`: Explicit statement that predictions are educational estimates and not clinical medical diagnoses.

---

## 5. Historical Analytics & Calculation Logic

1. **User Ownership Filter**:
   Every query applies `{"user_id": str(user["_id"])}` in MongoDB. Records from different users are never mixed.
2. **7-Day & 30-Day Aggregation**:
   - Computes average sleep duration only from actual recorded entries (`total_logged_nights`). Missing days are never fabricated as zeroes.
   - Evaluates `goal_completion_rate`: percentage of logged nights where `sleep_duration_minutes >= user.sleep_goal_minutes`.
3. **Circular Bedtime Variance Calculation**:
   - Converts bedtime strings into minute-of-day ($0$ to $1439$).
   - Handles midnight wraparound (e.g. 23:30 vs 00:30) by shifting bedtimes prior to 12:00 PM by $+1440$ minutes.
   - Computes sample standard deviation $\sigma$.
   - Classification:
     - $\sigma \le 30\text{ min}$: `"Consistent"` (regular circadian rhythm).
     - $30\text{ min} < \sigma \le 60\text{ min}$: `"Moderate"`.
     - $\sigma > 60\text{ min}$: `"Irregular"` (variable sleep schedule).
4. **Multi-Week Duration Trend**:
   - Compares the recent 4 sessions with prior 6 sessions ($4-10$).
   - If $\Delta \ge +20\text{ min}$: `"improving"` (sustained positive trend).
   - If $\Delta \le -20\text{ min}$: `"declining"`.
   - Otherwise: `"stable"`.

---

## 6. Transparent Rule-Based Recommendations

All recommendations are deterministic, configurable, and transparent. Every recommendation includes:
- `id`: Unique identifier.
- `title`: Short user-friendly title.
- `category`: `"duration"`, `"consistency"`, `"quality"`, `"goal"`, or `"tracking"`.
- `explanation`: Contextual explanation.
- `suggested_action`: Practical lifestyle step.
- `rule_triggered`: Exact rule code that triggered it.
- `observation`: The specific data point observed.
- `based_on_sufficient_data`: Boolean flag.

### Implemented Rules
- **Rule A (Duration Below Goal)**: Triggers when 7-day average duration is below configured sleep goal.
- **Rule B (Irregular Sleep Schedule)**: Triggers when bedtime variance exceeds $45$ minutes across $\ge 3$ recorded nights.
- **Rule C (Improving Duration Trend)**: Triggers when multi-week duration improves by $\ge 20$ minutes.
- **Rule D (Insufficient Records / Baseline Building)**: Triggers when fewer than 4 nights are recorded.
- **Rule E (Missing Configured Goal)**: Triggers when the user has not explicitly configured a personalized sleep duration goal.
- **Rule F (Stable & Goal Met)**: Triggers when schedule is consistent and goal achievement is $\ge 80\%$.
- **Rule G (Restlessness / Low Sleep Efficiency)**: Triggers when average sleep efficiency is below $85\%$ due to frequent night awakenings.

---

## 7. Model Limitations & Ethical Disclaimers

1. **Dataset Scope**: The model was trained on the public *Sleep Health and Lifestyle Dataset* ($N = 374$). While achieving strong empirical fit ($R^2 = 0.9885$, $\text{MAE} = 0.0397$ on test split), the sample size is limited and represents observational survey metrics.
2. **Non-Clinical**: Predictions are strictly educational wellness estimates. They do not substitute for medical polysomnography (PSG) or clinical diagnostic procedures.
3. **No Automatic Disorder Diagnoses**: A low prediction score is never presented as proof of insomnia, sleep apnea, or other clinical sleep disorders.
4. **Privacy & Security**: Model artifacts are stored strictly on the backend filesystem and are never exposed via static public web routes. User biometrics are never logged in plain text.

---

## 8. Testing & Verification

### Running Backend Tests
Execute pytest inside `backend/`:
```bash
cd backend
python -m pytest tests/test_ai_sleep.py -v
```
All 7 dedicated AI Sleep test cases will run:
- `test_unauthenticated_ai_endpoints`: Enforces 401 Unauthorized for unauthenticated requests.
- `test_predict_sleep_quality_valid_input`: Verifies model inference and prediction payload.
- `test_predict_sleep_quality_validation`: Verifies Pydantic boundaries (e.g. invalid age).
- `test_ai_sleep_insights_empty_history`: Verifies baseline building rules when history is empty.
- `test_ai_sleep_insights_with_history_and_rules`: Verifies 7d aggregation, variance calculation, and Rules A and G.
- `test_ai_sleep_insights_with_prediction_override`: Verifies ML score prediction integrated into insights.
- `test_ai_sleep_user_isolation`: Verifies complete data isolation between separate users.

To run the complete 35-test backend suite:
```bash
python -m pytest tests/ -v
```

### Running Frontend Tests & Build
```bash
cd frontend
npm run build
```
Verify that TypeScript compilation passes and Vite production bundle compiles cleanly.
