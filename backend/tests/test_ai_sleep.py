import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

BASE_URL = "http://testserver"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
        yield ac


async def create_user_and_token(client: AsyncClient, name: str = "AI Sleep Tester", dashboard_type: str = "mens"):
    uid = uuid.uuid4().hex[:8]
    email = f"aisleep_{uid}@example.com"
    password = "Password123!"

    reg_resp = await client.post("/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password,
    })
    assert reg_resp.status_code == 201

    login_resp = await client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    await client.patch("/api/profile/dashboard", json={"dashboard_type": dashboard_type}, headers=headers)
    return headers


@pytest.mark.anyio
async def test_unauthenticated_ai_endpoints(client: AsyncClient):
    resp = await client.post("/api/ai/sleep-quality/predict", json={})
    assert resp.status_code == 401

    resp = await client.get("/api/ai/sleep-insights")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_predict_sleep_quality_valid_input(client: AsyncClient):
    headers = await create_user_and_token(client, "Prediction User")

    payload = {
        "age": 34,
        "sleep_duration": 7.8,
        "physical_activity_level": 60,
        "stress_level": 3,
        "heart_rate": 66,
        "daily_steps": 8000,
        "systolic_bp": 118.0,
        "diastolic_bp": 78.0,
        "gender": "Female",
        "occupation": "Engineer",
        "bmi_category": "Normal",
    }

    resp = await client.post("/api/ai/sleep-quality/predict", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "estimated_sleep_quality" in data
    assert 1.0 <= data["estimated_sleep_quality"] <= 10.0
    assert data["scale"] == "1 to 10"
    assert "model_name" in data
    assert "disclaimer" in data


@pytest.mark.anyio
async def test_predict_sleep_quality_validation(client: AsyncClient):
    headers = await create_user_and_token(client, "Validation User")

    # Invalid stress level > 10
    resp = await client.post(
        "/api/ai/sleep-quality/predict",
        json={"stress_level": 15},
        headers=headers,
    )
    assert resp.status_code == 422

    # Invalid sleep duration < 3.0
    resp = await client.post(
        "/api/ai/sleep-quality/predict",
        json={"sleep_duration": 1.5},
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_ai_sleep_insights_empty_history(client: AsyncClient):
    headers = await create_user_and_token(client, "New Sleep User")

    resp = await client.get("/api/ai/sleep-insights", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["model_available"] is True
    assert data["analytics_7d"]["total_logged_nights"] == 0
    assert data["analytics_7d"]["data_sufficient"] is False
    assert len(data["missing_prediction_inputs"]) > 0

    # Rule D (insufficient records) should be triggered
    recs = data["recommendations"]
    assert any(r["id"] == "rule_d_insufficient_records" for r in recs)


@pytest.mark.anyio
async def test_ai_sleep_insights_with_history_and_rules(client: AsyncClient):
    headers = await create_user_and_token(client, "Active Sleeper")

    # Set sleep goal to 8 hours (480 mins)
    await client.patch("/api/sleep/goal", json={"goal_minutes": 480}, headers=headers)

    # Log 5 nights with duration = 6 hours (360 mins) -> below 8h target
    # With irregular bedtimes: 22:00, 01:30, 23:00, 02:00, 21:30
    bedtimes = ["22:00", "01:30", "23:00", "02:00", "21:30"]
    base_date = datetime.now(timezone.utc).date() - timedelta(days=6)

    for i, bt_str in enumerate(bedtimes):
        d_str = (base_date + timedelta(days=i)).isoformat()
        hour, minute = map(int, bt_str.split(":"))
        if hour >= 12:
            bt_dt = datetime(2026, 10, 20 + i, hour, minute, tzinfo=timezone.utc)
            wt_dt = bt_dt + timedelta(hours=7, minutes=20)
        else:
            bt_dt = datetime(2026, 10, 21 + i, hour, minute, tzinfo=timezone.utc)
            wt_dt = bt_dt + timedelta(hours=7, minutes=20)

        # Awake minutes = 80 -> Time in bed = 440 -> Sleep duration = 360m (6.0h) -> Efficiency = 360 / 440 = 81.8%
        rec_resp = await client.post("/api/sleep/records", json={
            "sleep_date": d_str,
            "bedtime": bt_dt.isoformat(),
            "wake_time": wt_dt.isoformat(),
            "awake_minutes": 80,
            "quality": 3,
            "restedness": 3,
        }, headers=headers)
        assert rec_resp.status_code == 201

    # Fetch AI Sleep Insights
    resp = await client.get("/api/ai/sleep-insights", headers=headers)
    assert resp.status_code == 200
    insights = resp.json()

    assert insights["analytics_7d"]["total_logged_nights"] == 5
    assert insights["analytics_7d"]["avg_sleep_duration_hours"] == 6.0
    assert insights["analytics_7d"]["data_sufficient"] is True
    assert insights["schedule_consistency"]["consistency_level"] in ("Moderate", "Irregular")

    recs = insights["recommendations"]
    rec_ids = [r["id"] for r in recs]

    # Rule A: Duration below goal should trigger
    assert "rule_a_duration_below_goal" in rec_ids

    # Rule G: Efficiency < 85% should trigger
    assert "rule_g_restlessness" in rec_ids


@pytest.mark.anyio
async def test_ai_sleep_insights_with_prediction_override(client: AsyncClient):
    headers = await create_user_and_token(client, "Full AI User")

    # Pass all biometrics via query params (including sleep_duration)
    params = {
        "age": 30,
        "sleep_duration": 7.5,
        "stress_level": 4,
        "heart_rate": 65,
        "daily_steps": 8500,
        "systolic_bp": 118.0,
        "diastolic_bp": 78.0,
        "occupation": "Engineer",
        "bmi_category": "Normal",
    }
    resp = await client.get("/api/ai/sleep-insights", params=params, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["missing_prediction_inputs"]) == 0
    assert data["prediction"] is not None
    assert "estimated_sleep_quality" in data["prediction"]


@pytest.mark.anyio
async def test_ai_sleep_user_isolation(client: AsyncClient):
    headers_a = await create_user_and_token(client, "User A Isolation")
    headers_b = await create_user_and_token(client, "User B Isolation")

    # User A logs a sleep record
    bt = datetime.now(timezone.utc) - timedelta(hours=8)
    wt = datetime.now(timezone.utc)
    await client.post("/api/sleep/records", json={
        "sleep_date": "2026-10-23",
        "bedtime": bt.isoformat(),
        "wake_time": wt.isoformat(),
        "awake_minutes": 10,
        "quality": 5,
    }, headers=headers_a)

    # User B checks insights -> should be 0 logged nights
    resp_b = await client.get("/api/ai/sleep-insights", headers=headers_b)
    assert resp_b.status_code == 200
    assert resp_b.json()["analytics_7d"]["total_logged_nights"] == 0
