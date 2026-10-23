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


async def create_user_and_token(client: AsyncClient, name: str = "Wellness Tester", dashboard_type: str = "mens"):
    uid = uuid.uuid4().hex[:8]
    email = f"wellness_{uid}@example.com"
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
async def test_unauthenticated_wellness_summary(client: AsyncClient):
    resp = await client.get("/api/wellness/summary")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_wellness_summary_empty_state(client: AsyncClient):
    headers = await create_user_and_token(client)

    resp = await client.get("/api/wellness/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Check top-level structure
    assert "date" in data
    assert "habit_score" in data
    assert "daily_overview" in data
    assert "goals_overview" in data
    assert "weekly_matrix" in data
    assert "insights" in data

    # Check defaults
    daily = data["daily_overview"]
    assert daily["nutrition"]["calories"] == 0
    assert daily["nutrition"]["meal_count"] == 0
    assert daily["hydration"]["consumed_ml"] == 0
    assert daily["hydration"]["goal_ml"] == 2500
    assert daily["sleep"]["has_record"] is False
    assert daily["fitness"]["total_minutes_today"] == 0

    # Weekly matrix has 7 days
    assert len(data["weekly_matrix"]) == 7


@pytest.mark.anyio
async def test_wellness_summary_cross_service_aggregation(client: AsyncClient):
    headers = await create_user_and_token(client)
    today_str = datetime.now(timezone.utc).date().isoformat()

    # 1. Log water (500 ml)
    await client.post("/api/nutrition/water", json={"amount_ml": 500}, headers=headers)

    # 2. Log meal (600 kcal, 30g protein)
    await client.post("/api/nutrition/meals", json={
        "name": "Grilled Chicken Rice",
        "meal_type": "lunch",
        "calories": 600,
        "protein_g": 30,
        "carbs_g": 70,
        "fat_g": 12,
    }, headers=headers)

    # 3. Log workout (45 mins cycling)
    await client.post("/api/fitness/workouts", json={
        "name": "Power Cycling",
        "category": "cycling",
        "workout_date": today_str,
        "duration_minutes": 45,
        "intensity": "vigorous",
    }, headers=headers)

    # 4. Log sleep (8 hours = 480 mins, awake 30 mins -> 450 mins duration)
    bedtime = datetime.now(timezone.utc) - timedelta(hours=8)
    wake_time = datetime.now(timezone.utc)
    await client.post("/api/sleep/records", json={
        "sleep_date": today_str,
        "bedtime": bedtime.isoformat(),
        "wake_time": wake_time.isoformat(),
        "awake_minutes": 30,
        "quality": 5,
        "restedness": 5,
    }, headers=headers)

    # Fetch wellness summary
    resp = await client.get("/api/wellness/summary", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # Verify Nutrition
    nut = data["daily_overview"]["nutrition"]
    assert nut["calories"] == 600.0
    assert nut["protein_g"] == 30.0
    assert nut["meal_count"] == 1

    # Verify Hydration
    hyd = data["daily_overview"]["hydration"]
    assert hyd["consumed_ml"] == 500
    assert hyd["percentage"] == 20.0

    # Verify Fitness
    fit = data["daily_overview"]["fitness"]
    assert fit["total_minutes_today"] == 45
    assert fit["daily_percentage"] == 100.0

    # Verify Sleep
    slp = data["daily_overview"]["sleep"]
    assert slp["has_record"] is True
    assert slp["duration_minutes"] == 450
    assert slp["quality"] == 5

    # Verify Goals overview
    goals = data["goals_overview"]
    assert len(goals) == 5
    hyd_goal = next(g for g in goals if g["id"] == "hydration_daily")
    assert hyd_goal["current_value"] == 500
    assert hyd_goal["percentage"] == 20.0

    fit_goal = next(g for g in goals if g["id"] == "fitness_daily")
    assert fit_goal["is_completed"] is True

    # Verify Habit score
    habit_score = data["habit_score"]
    assert habit_score["score"] > 0
    assert len(habit_score["components"]) >= 3

    # Insights present
    assert len(data["insights"]) > 0


@pytest.mark.anyio
async def test_wellness_user_isolation(client: AsyncClient):
    headers_a = await create_user_and_token(client, name="User A")
    headers_b = await create_user_and_token(client, name="User B")

    # User A logs 1000 ml water
    await client.post("/api/nutrition/water", json={"amount_ml": 1000}, headers=headers_a)

    # User B should see 0 ml in wellness summary
    resp_b = await client.get("/api/wellness/summary", headers=headers_b)
    data_b = resp_b.json()
    assert data_b["daily_overview"]["hydration"]["consumed_ml"] == 0

    # User A sees 1000 ml
    resp_a = await client.get("/api/wellness/summary", headers=headers_a)
    data_a = resp_a.json()
    assert data_a["daily_overview"]["hydration"]["consumed_ml"] == 1000
