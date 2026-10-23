import uuid
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

async def create_user_and_token(client: AsyncClient, name: str = "Test Hydration", dashboard_type: str = "mens"):
    uid = uuid.uuid4().hex[:8]
    email = f"user_{uid}@example.com"
    password = "TestPassword123!"

    reg_resp = await client.post("/api/auth/register", json={
        "name": name,
        "email": email,
        "password": password
    })
    assert reg_resp.status_code == 201

    login_resp = await client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Set dashboard preference
    await client.patch("/api/profile/dashboard", json={"dashboard_type": dashboard_type}, headers=headers)
    return headers

@pytest.mark.anyio
async def test_unauthenticated_endpoints(client: AsyncClient):
    resp = await client.get("/api/nutrition/water")
    assert resp.status_code == 401

    resp = await client.post("/api/nutrition/water", json={"amount_ml": 250})
    assert resp.status_code == 401

    resp = await client.patch("/api/nutrition/hydration-goal", json={"goal_ml": 2500})
    assert resp.status_code == 401

    resp = await client.get("/api/nutrition/summary")
    assert resp.status_code == 401

@pytest.mark.anyio
async def test_add_water_and_retrieve_entries(client: AsyncClient):
    headers = await create_user_and_token(client)

    # 1. Check initial entries are empty for new user
    get_resp = await client.get("/api/nutrition/water", headers=headers)
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["total_ml"] == 0
    assert len(data["entries"]) == 0

    # 2. Add 250 ml of water
    post_resp = await client.post("/api/nutrition/water", json={"amount_ml": 250}, headers=headers)
    assert post_resp.status_code == 201
    entry = post_resp.json()
    assert entry["amount_ml"] == 250
    assert "id" in entry
    assert "recorded_at" in entry

    # 3. Add 500 ml of water
    post_resp2 = await client.post("/api/nutrition/water", json={"amount_ml": 500}, headers=headers)
    assert post_resp2.status_code == 201

    # 4. Fetch entries and check total
    get_resp2 = await client.get("/api/nutrition/water", headers=headers)
    assert get_resp2.status_code == 200
    data2 = get_resp2.json()
    assert data2["total_ml"] == 750
    assert len(data2["entries"]) == 2
    # Newest first
    assert data2["entries"][0]["amount_ml"] == 500
    assert data2["entries"][1]["amount_ml"] == 250

@pytest.mark.anyio
async def test_water_validation(client: AsyncClient):
    headers = await create_user_and_token(client)

    # Negative amount
    resp = await client.post("/api/nutrition/water", json={"amount_ml": -50}, headers=headers)
    assert resp.status_code == 422

    # Zero amount
    resp = await client.post("/api/nutrition/water", json={"amount_ml": 0}, headers=headers)
    assert resp.status_code == 422

    # Exceeding single max limit (5000)
    resp = await client.post("/api/nutrition/water", json={"amount_ml": 5001}, headers=headers)
    assert resp.status_code == 422

@pytest.mark.anyio
async def test_update_hydration_goal_and_summary(client: AsyncClient):
    headers = await create_user_and_token(client)

    # Initial summary
    sum_resp = await client.get("/api/nutrition/summary", headers=headers)
    assert sum_resp.status_code == 200
    initial_hydration = sum_resp.json()["hydration"]
    assert initial_hydration["goal_ml"] == 2500
    assert initial_hydration["consumed_ml"] == 0

    # Update goal to 3200
    goal_resp = await client.patch("/api/nutrition/hydration-goal", json={"goal_ml": 3200}, headers=headers)
    assert goal_resp.status_code == 200
    assert goal_resp.json()["hydration_goal_ml"] == 3200

    # Add water
    await client.post("/api/nutrition/water", json={"amount_ml": 800}, headers=headers)

    # Check summary reflects new goal and consumption
    sum_resp2 = await client.get("/api/nutrition/summary", headers=headers)
    assert sum_resp2.status_code == 200
    updated_hydration = sum_resp2.json()["hydration"]
    assert updated_hydration["goal_ml"] == 3200
    assert updated_hydration["consumed_ml"] == 800
    assert updated_hydration["percentage"] == 25.0

@pytest.mark.anyio
async def test_goal_validation(client: AsyncClient):
    headers = await create_user_and_token(client)

    # Zero goal
    resp = await client.patch("/api/nutrition/hydration-goal", json={"goal_ml": 0}, headers=headers)
    assert resp.status_code == 422

    # Exceeding max goal (10000)
    resp = await client.patch("/api/nutrition/hydration-goal", json={"goal_ml": 10001}, headers=headers)
    assert resp.status_code == 422

@pytest.mark.anyio
async def test_user_scoping(client: AsyncClient):
    headers_user1 = await create_user_and_token(client, name="User One")
    headers_user2 = await create_user_and_token(client, name="User Two")

    # User 1 logs water
    await client.post("/api/nutrition/water", json={"amount_ml": 350}, headers=headers_user1)

    # User 2 should have 0 entries
    resp_user2 = await client.get("/api/nutrition/water", headers=headers_user2)
    assert resp_user2.json()["total_ml"] == 0
    assert len(resp_user2.json()["entries"]) == 0

    # User 1 has 350 ml
    resp_user1 = await client.get("/api/nutrition/water", headers=headers_user1)
    assert resp_user1.json()["total_ml"] == 350
    assert len(resp_user1.json()["entries"]) == 1
