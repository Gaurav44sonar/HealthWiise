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


async def create_user_and_token(client: AsyncClient, name: str = "Sleep Tester", dashboard_type: str = "mens"):
    uid = uuid.uuid4().hex[:8]
    email = f"sleep_{uid}@example.com"
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
async def test_unauthenticated_sleep_endpoints(client: AsyncClient):
    resp = await client.get("/api/sleep/records")
    assert resp.status_code == 401

    resp = await client.post("/api/sleep/records", json={})
    assert resp.status_code == 401

    resp = await client.patch("/api/sleep/goal", json={"goal_minutes": 480})
    assert resp.status_code == 401

    resp = await client.get("/api/sleep/summary")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_create_sleep_record_and_calculations(client: AsyncClient):
    headers = await create_user_and_token(client)

    # Bedtime: 2026-10-23 22:30:00, Wake time: 2026-10-24 06:30:00 (8h = 480m)
    # Awake: 30m -> Sleep duration: 450m (7.5h) -> Efficiency: (450 / 480) * 100 = 93.8%
    bedtime = datetime(2026, 10, 23, 22, 30, tzinfo=timezone.utc)
    wake_time = datetime(2026, 10, 24, 6, 30, tzinfo=timezone.utc)

    payload = {
        "sleep_date": "2026-10-23",
        "bedtime": bedtime.isoformat(),
        "wake_time": wake_time.isoformat(),
        "awake_minutes": 30,
        "quality": 4,
        "restedness": 5,
        "notes": "Felt great after evening stretch",
    }

    create_resp = await client.post("/api/sleep/records", json=payload, headers=headers)
    assert create_resp.status_code == 201
    record = create_resp.json()

    assert record["sleep_date"] == "2026-10-23"
    assert record["time_in_bed_minutes"] == 480
    assert record["awake_minutes"] == 30
    assert record["sleep_duration_minutes"] == 450
    assert record["sleep_efficiency"] == 93.8
    assert record["quality"] == 4
    assert record["restedness"] == 5
    assert record["notes"] == "Felt great after evening stretch"
    assert "id" in record

    # Retrieve records list
    list_resp = await client.get("/api/sleep/records", headers=headers)
    assert list_resp.status_code == 200
    records = list_resp.json()
    assert len(records) == 1
    assert records[0]["id"] == record["id"]


@pytest.mark.anyio
async def test_sleep_record_validation(client: AsyncClient):
    headers = await create_user_and_token(client)

    now = datetime.now(timezone.utc)

    # 1. Wake time earlier than bedtime
    resp = await client.post("/api/sleep/records", json={
        "sleep_date": "2026-10-23",
        "bedtime": now.isoformat(),
        "wake_time": (now - timedelta(hours=2)).isoformat(),
        "awake_minutes": 0,
    }, headers=headers)
    assert resp.status_code == 422

    # 2. Too short (< 30 mins)
    resp = await client.post("/api/sleep/records", json={
        "sleep_date": "2026-10-23",
        "bedtime": now.isoformat(),
        "wake_time": (now + timedelta(minutes=20)).isoformat(),
        "awake_minutes": 0,
    }, headers=headers)
    assert resp.status_code == 422

    # 3. Awake time >= time in bed
    resp = await client.post("/api/sleep/records", json={
        "sleep_date": "2026-10-23",
        "bedtime": now.isoformat(),
        "wake_time": (now + timedelta(hours=6)).isoformat(),
        "awake_minutes": 360,
    }, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_sleep_goal_and_summary_analytics(client: AsyncClient):
    headers = await create_user_and_token(client, dashboard_type="mens")

    # 1. Check default goal is 480 (8h)
    summary_resp = await client.get("/api/sleep/summary", headers=headers)
    assert summary_resp.status_code == 200
    assert summary_resp.json()["goal_minutes"] == 480

    # 2. Update goal to 510 (8.5h)
    goal_resp = await client.patch("/api/sleep/goal", json={"goal_minutes": 510}, headers=headers)
    assert goal_resp.status_code == 200
    assert goal_resp.json()["sleep_goal_minutes"] == 510

    # 3. Add 2 sleep records
    t1 = datetime(2026, 10, 22, 23, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 23, 7, 0, tzinfo=timezone.utc)  # 8h = 480m, awake 0 -> 480m
    await client.post("/api/sleep/records", json={
        "sleep_date": "2026-10-22",
        "bedtime": t1.isoformat(),
        "wake_time": t2.isoformat(),
        "awake_minutes": 0,
        "quality": 4,
        "restedness": 4,
    }, headers=headers)

    t3 = datetime(2026, 10, 23, 22, 0, tzinfo=timezone.utc)
    t4 = datetime(2026, 10, 24, 7, 0, tzinfo=timezone.utc)  # 9h = 540m, awake 30 -> 510m
    await client.post("/api/sleep/records", json={
        "sleep_date": "2026-10-23",
        "bedtime": t3.isoformat(),
        "wake_time": t4.isoformat(),
        "awake_minutes": 30,
        "quality": 5,
        "restedness": 5,
    }, headers=headers)

    # 4. Check updated summary
    summary_resp2 = await client.get("/api/sleep/summary", headers=headers)
    data = summary_resp2.json()
    assert data["goal_minutes"] == 510
    assert data["latest_record"]["sleep_date"] == "2026-10-23"
    assert data["latest_record"]["sleep_duration_minutes"] == 510
    assert data["goal_progress_percentage"] == 100.0

    analytics = data["weekly_analytics"]
    assert analytics["total_logged_nights"] == 2
    assert analytics["avg_sleep_duration_minutes"] == 495  # (480 + 510) / 2
    assert analytics["avg_quality"] == 4.5
    assert len(data["insights"]) > 0


@pytest.mark.anyio
async def test_delete_sleep_record(client: AsyncClient):
    headers = await create_user_and_token(client)

    t1 = datetime(2026, 10, 23, 23, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 24, 7, 0, tzinfo=timezone.utc)
    create_resp = await client.post("/api/sleep/records", json={
        "sleep_date": "2026-10-23",
        "bedtime": t1.isoformat(),
        "wake_time": t2.isoformat(),
        "awake_minutes": 0,
    }, headers=headers)
    record_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/sleep/records/{record_id}", headers=headers)
    assert del_resp.status_code == 200

    # Ensure it's deleted
    list_resp = await client.get("/api/sleep/records", headers=headers)
    assert len(list_resp.json()) == 0
