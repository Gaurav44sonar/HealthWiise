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


async def create_user_and_token(client: AsyncClient, name: str = "Fitness Tester", dashboard_type: str = "mens"):
    uid = uuid.uuid4().hex[:8]
    email = f"fitness_{uid}@example.com"
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
async def test_unauthenticated_fitness_endpoints(client: AsyncClient):
    resp = await client.get("/api/fitness/workouts")
    assert resp.status_code == 401

    resp = await client.post("/api/fitness/workouts", json={})
    assert resp.status_code == 401

    resp = await client.get("/api/fitness/goals")
    assert resp.status_code == 401

    resp = await client.patch("/api/fitness/goals", json={})
    assert resp.status_code == 401

    resp = await client.get("/api/fitness/summary")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_create_and_retrieve_workouts(client: AsyncClient):
    headers = await create_user_and_token(client)

    today_str = datetime.now(timezone.utc).date().isoformat()

    # 1. Create a Strength Training workout
    workout1 = {
        "name": "Upper Body Hypertrophy",
        "category": "strength",
        "workout_date": today_str,
        "start_time": "08:00",
        "duration_minutes": 50,
        "intensity": "moderate",
        "notes": "Chest and Triceps session",
    }
    resp1 = await client.post("/api/fitness/workouts", json=workout1, headers=headers)
    assert resp1.status_code == 201
    data1 = resp1.json()
    assert data1["name"] == "Upper Body Hypertrophy"
    assert data1["category"] == "strength"
    assert data1["category_label"] == "Strength Training"
    assert data1["duration_minutes"] == 50
    assert "id" in data1

    # 2. Create a Running workout
    workout2 = {
        "name": "Morning Trail Run",
        "category": "running",
        "workout_date": today_str,
        "start_time": "18:00",
        "duration_minutes": 35,
        "intensity": "vigorous",
    }
    resp2 = await client.post("/api/fitness/workouts", json=workout2, headers=headers)
    assert resp2.status_code == 201

    # 3. Retrieve workouts
    list_resp = await client.get("/api/fitness/workouts", headers=headers)
    assert list_resp.status_code == 200
    workouts = list_resp.json()
    assert len(workouts) == 2

    # 4. Filter by category
    filter_resp = await client.get("/api/fitness/workouts?category=running", headers=headers)
    assert filter_resp.status_code == 200
    filtered = filter_resp.json()
    assert len(filtered) == 1
    assert filtered[0]["category"] == "running"


@pytest.mark.anyio
async def test_workout_validation(client: AsyncClient):
    headers = await create_user_and_token(client)
    today_str = datetime.now(timezone.utc).date().isoformat()

    # Empty name
    resp = await client.post("/api/fitness/workouts", json={
        "name": "",
        "category": "cardio",
        "workout_date": today_str,
        "duration_minutes": 30,
    }, headers=headers)
    assert resp.status_code == 422

    # Zero duration
    resp = await client.post("/api/fitness/workouts", json={
        "name": "HIIT",
        "category": "cardio",
        "workout_date": today_str,
        "duration_minutes": 0,
    }, headers=headers)
    assert resp.status_code == 422

    # Duration > 1440
    resp = await client.post("/api/fitness/workouts", json={
        "name": "Ultra",
        "category": "running",
        "workout_date": today_str,
        "duration_minutes": 1441,
    }, headers=headers)
    assert resp.status_code == 422

    # Invalid category
    resp = await client.post("/api/fitness/workouts", json={
        "name": "Nap",
        "category": "sleeping",
        "workout_date": today_str,
        "duration_minutes": 60,
    }, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_update_and_delete_workout(client: AsyncClient):
    headers = await create_user_and_token(client)
    today_str = datetime.now(timezone.utc).date().isoformat()

    # Create
    create_resp = await client.post("/api/fitness/workouts", json={
        "name": "Pilates Core",
        "category": "yoga",
        "workout_date": today_str,
        "duration_minutes": 40,
    }, headers=headers)
    workout_id = create_resp.json()["id"]

    # Update
    update_resp = await client.put(f"/api/fitness/workouts/{workout_id}", json={
        "name": "Advanced Pilates Core",
        "duration_minutes": 45,
        "intensity": "moderate",
    }, headers=headers)
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["name"] == "Advanced Pilates Core"
    assert updated["duration_minutes"] == 45
    assert updated["intensity"] == "moderate"

    # Delete
    del_resp = await client.delete(f"/api/fitness/workouts/{workout_id}", headers=headers)
    assert del_resp.status_code == 200

    # Verify not found
    get_resp = await client.get(f"/api/fitness/workouts/{workout_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.anyio
async def test_fitness_goals_and_summary(client: AsyncClient):
    headers = await create_user_and_token(client)
    today_str = datetime.now(timezone.utc).date().isoformat()

    # Default goals
    goals_resp = await client.get("/api/fitness/goals", headers=headers)
    assert goals_resp.status_code == 200
    goals = goals_resp.json()
    assert goals["daily_active_minutes_goal"] == 45
    assert goals["weekly_sessions_goal"] == 4
    assert goals["weekly_active_minutes_goal"] == 180

    # Update goals
    patch_resp = await client.patch("/api/fitness/goals", json={
        "daily_active_minutes_goal": 60,
        "weekly_sessions_goal": 5,
        "weekly_active_minutes_goal": 240,
    }, headers=headers)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["daily_active_minutes_goal"] == 60

    # Add workout today
    await client.post("/api/fitness/workouts", json={
        "name": "Cycling Interval",
        "category": "cycling",
        "workout_date": today_str,
        "duration_minutes": 60,
    }, headers=headers)

    # Summary
    sum_resp = await client.get("/api/fitness/summary", headers=headers)
    assert sum_resp.status_code == 200
    data = sum_resp.json()

    assert data["today"]["total_minutes_today"] == 60
    assert data["today"]["session_count_today"] == 1
    assert data["today"]["daily_goal_reached"] is True

    assert data["weekly"]["total_minutes"] == 60
    assert data["weekly"]["session_count"] == 1
    assert data["weekly"]["avg_duration_minutes"] == 60.0
    assert len(data["weekly"]["category_breakdown"]) == 1
    assert data["weekly"]["category_breakdown"][0]["category"] == "cycling"
    assert len(data["insights"]) > 0


@pytest.mark.anyio
async def test_fitness_user_isolation(client: AsyncClient):
    headers1 = await create_user_and_token(client, name="User A")
    headers2 = await create_user_and_token(client, name="User B")
    today_str = datetime.now(timezone.utc).date().isoformat()

    # User 1 creates workout
    resp1 = await client.post("/api/fitness/workouts", json={
        "name": "Private Workout",
        "category": "sports",
        "workout_date": today_str,
        "duration_minutes": 30,
    }, headers=headers1)
    workout_id = resp1.json()["id"]

    # User 2 list should be empty
    list2 = await client.get("/api/fitness/workouts", headers=headers2)
    assert len(list2.json()) == 0

    # User 2 cannot edit User 1's workout
    edit_resp = await client.put(f"/api/fitness/workouts/{workout_id}", json={
        "name": "Hacked Workout",
    }, headers=headers2)
    assert edit_resp.status_code == 404

    # User 2 cannot delete User 1's workout
    del_resp = await client.delete(f"/api/fitness/workouts/{workout_id}", headers=headers2)
    assert del_resp.status_code == 404
