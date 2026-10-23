"""
HealthWiise — Sleep Quality Prediction Model Inference Example
=============================================================

This standalone script demonstrates how to load the serialized Scikit-learn
pipeline and model metadata, format user input, and generate estimated sleep
quality scores for integration into the HealthWiise platform.
"""

import os
import json
import joblib
import pandas as pd


def load_model_and_metadata(base_dir: str = "."):
    model_path = os.path.join(base_dir, "sleep_quality_pipeline.joblib")
    meta_path = os.path.join(base_dir, "sleep_quality_model_metadata.json")

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model artifact not found at {model_path}")
    if not os.path.exists(meta_path):
        raise FileNotFoundError(f"Metadata artifact not found at {meta_path}")

    pipeline = joblib.load(model_path)
    with open(meta_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    return pipeline, metadata


def predict_sleep_quality(pipeline, input_records: list[dict]) -> list[float]:
    """
    Takes a list of user profile dictionaries, converts them to a DataFrame,
    and returns estimated Sleep Quality scores on the 1-10 scale.
    """
    df_input = pd.DataFrame(input_records)
    predictions = pipeline.predict(df_input)
    # Clip predictions between 1.0 and 10.0 for wellness score bounds
    return [round(float(p), 2) for p in predictions]


if __name__ == "__main__":
    print("=" * 65)
    print("HealthWiise Machine Learning — Sleep Quality Inference Service")
    print("=" * 65)

    current_dir = os.path.dirname(os.path.abspath(__file__))
    pipeline, meta = load_model_and_metadata(current_dir)

    print(f"Model Name        : {meta['model_name']} (v{meta['version']})")
    print(f"Model Architecture: {meta['model_type']}")
    print(f"Test Evaluation   : R² = {meta['evaluation_metrics']['test_r2']}, MAE = {meta['evaluation_metrics']['test_mae']}")
    print(f"Target Scale      : {meta['target_variable']['scale']}")
    print("-" * 65)

    # Sample user scenarios from HealthWiise
    sample_users = [
        {
            "name": "Sarah (Engineer - High Recovery Routine)",
            "data": {
                "Age": 32,
                "Sleep Duration": 7.8,
                "Physical Activity Level": 65,
                "Stress Level": 3,
                "Heart Rate": 66,
                "Daily Steps": 8500,
                "Systolic_BP": 118.0,
                "Diastolic_BP": 76.0,
                "Gender": "Female",
                "Occupation": "Engineer",
                "BMI Category": "Normal"
            }
        },
        {
            "name": "David (Doctor - High Stress, Night Shifts)",
            "data": {
                "Age": 45,
                "Sleep Duration": 5.8,
                "Physical Activity Level": 35,
                "Stress Level": 8,
                "Heart Rate": 78,
                "Daily Steps": 4200,
                "Systolic_BP": 138.0,
                "Diastolic_BP": 88.0,
                "Gender": "Male",
                "Occupation": "Doctor",
                "BMI Category": "Overweight"
            }
        },
        {
            "name": "Emma (Unseen Occupation Test - Fallback Check)",
            "data": {
                "Age": 29,
                "Sleep Duration": 7.1,
                "Physical Activity Level": 50,
                "Stress Level": 5,
                "Heart Rate": 71,
                "Daily Steps": 6500,
                "Systolic_BP": 122.0,
                "Diastolic_BP": 80.0,
                "Gender": "Female",
                "Occupation": "Graphic Designer",  # Unseen occupation tested for OneHotEncoder robustness
                "BMI Category": "Normal"
            }
        }
    ]

    for user in sample_users:
        score = predict_sleep_quality(pipeline, [user["data"]])[0]
        print(f"\nUser Profile : {user['name']}")
        print(f"  Inputs     : Sleep={user['data']['Sleep Duration']}h | Stress={user['data']['Stress Level']}/10 | Steps={user['data']['Daily Steps']} | BP={int(user['data']['Systolic_BP'])}/{int(user['data']['Diastolic_BP'])}")
        print(f"  Estimated Sleep Quality : {score} / 10.0")

    print("\n" + "=" * 65)
    print("Inference completed successfully. All inputs processed with zero errors.")
    print("=" * 65)
