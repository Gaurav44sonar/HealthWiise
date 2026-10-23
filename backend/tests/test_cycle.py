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


async def create_user_and_token(client: AsyncClient, name: str = "Cycle Tester", dashboard_type: str = "womens"):
    uid = uuid.uuid4().hex[:8]
    email = f"cycle_{uid}@example.com"
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
async def test_unauthenticated_cycle_endpoints(client: AsyncClient):
    resp = await client.get("/api/cycle/periods")
    assert resp.status_code == 401

    resp = await client.post("/api/cycle/periods", json={})
    assert resp.status_code == 401

    resp = await client.get("/api/cycle/symptoms")
    assert resp.status_code == 401

    resp = await client.post("/api/cycle/symptoms", json={})
    assert resp.status_code == 401

    resp = await client.get("/api/cycle/summary")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_create_and_retrieve_periods(client: AsyncClient):
    headers = await create_user_and_token(client, "Period Tester")

    # 1. Create a period with start and end date
    create_resp = await client.post(
        "/api/cycle/periods",
        json={
            "start_date": "2026-09-01",
            "end_date": "2026-09-05",
            "flow_level": "moderate",
            "notes": "Normal flow, slight cramps on day 1",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    period_data = create_resp.json()
    assert period_data["start_date"] == "2026-09-01"
    assert period_data["end_date"] == "2026-09-05"
    assert period_data["duration_days"] == 5
    assert period_data["is_ongoing"] is False
    assert period_data["flow_level"] == "moderate"

    period_id = period_data["id"]

    # 2. Create an ongoing period without end date
    ongoing_resp = await client.post(
        "/api/cycle/periods",
        json={
            "start_date": "2026-09-29",
            "flow_level": "heavy",
        },
        headers=headers,
    )
    assert ongoing_resp.status_code == 201
    ongoing_data = ongoing_resp.json()
    assert ongoing_data["end_date"] is None
    assert ongoing_data["is_ongoing"] is True
    assert ongoing_data["duration_days"] is None

    # 3. List periods
    list_resp = await client.get("/api/cycle/periods", headers=headers)
    assert list_resp.status_code == 200
    periods = list_resp.json()
    assert len(periods) == 2
    # Check that cycle length to next was calculated (Sep 1 to Sep 29 is 28 days)
    sep_1_period = next(p for p in periods if p["start_date"] == "2026-09-01")
    assert sep_1_period["cycle_length_to_next"] == 28


@pytest.mark.anyio
async def test_period_validation_rules(client: AsyncClient):
    headers = await create_user_and_token(client, "Validation Tester")

    # Reject end date earlier than start date
    resp = await client.post(
        "/api/cycle/periods",
        json={
            "start_date": "2026-08-10",
            "end_date": "2026-08-05",
        },
        headers=headers,
    )
    assert resp.status_code == 400
    assert "precede start date" in resp.json()["detail"]

    # Reject unreasonable duration > 35 days
    resp = await client.post(
        "/api/cycle/periods",
        json={
            "start_date": "2026-08-01",
            "end_date": "2026-09-15",
        },
        headers=headers,
    )
    assert resp.status_code == 400
    assert "exceed 35 days" in resp.json()["detail"]

    # Valid period
    resp = await client.post(
        "/api/cycle/periods",
        json={
            "start_date": "2026-08-01",
            "end_date": "2026-08-05",
        },
        headers=headers,
    )
    assert resp.status_code == 201

    # Duplicate start date rejected
    resp = await client.post(
        "/api/cycle/periods",
        json={
            "start_date": "2026-08-01",
            "end_date": "2026-08-04",
        },
        headers=headers,
    )
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]


@pytest.mark.anyio
async def test_update_and_delete_period(client: AsyncClient):
    headers = await create_user_and_token(client, "Edit Tester")

    resp = await client.post(
        "/api/cycle/periods",
        json={
            "start_date": "2026-07-01",
            "flow_level": "light",
            "notes": "Starting",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    period_id = resp.json()["id"]

    # Update: add end date and change flow
    update_resp = await client.put(
        f"/api/cycle/periods/{period_id}",
        json={
            "end_date": "2026-07-05",
            "flow_level": "moderate",
            "notes": "Ended normally",
        },
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["end_date"] == "2026-07-05"
    assert updated["duration_days"] == 5
    assert updated["is_ongoing"] is False
    assert updated["flow_level"] == "moderate"

    # Delete period
    del_resp = await client.delete(f"/api/cycle/periods/{period_id}", headers=headers)
    assert del_resp.status_code == 200
    assert "deleted successfully" in del_resp.json()["message"]

    # Verify not found after deletion
    get_resp = await client.get(f"/api/cycle/periods/{period_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.anyio
async def test_symptom_logging_and_retrieval(client: AsyncClient):
    headers = await create_user_and_token(client, "Symptom Tester")

    # 1. Log symptoms for date
    resp = await client.post(
        "/api/cycle/symptoms",
        json={
            "log_date": "2026-09-02",
            "symptoms": [
                {"name": "cramps", "severity": "moderate"},
                {"name": "fatigue", "severity": "mild"},
            ],
            "mood": "sensitive",
            "energy_level": "low",
            "notes": "Stayed hydrated and rested",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    symp = resp.json()
    assert symp["log_date"] == "2026-09-02"
    assert len(symp["symptoms"]) == 2
    assert symp["mood"] == "sensitive"
    assert symp["energy_level"] == "low"
    symp_id = symp["id"]

    # 2. Upsert/Update symptoms on same date
    resp2 = await client.post(
        "/api/cycle/symptoms",
        json={
            "log_date": "2026-09-02",
            "symptoms": [
                {"name": "cramps", "severity": "mild"},
                {"name": "bloating", "severity": "mild"},
            ],
            "mood": "calm",
            "energy_level": "medium",
        },
        headers=headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["id"] == symp_id
    assert resp2.json()["mood"] == "calm"

    # 3. Retrieve symptoms
    list_resp = await client.get("/api/cycle/symptoms?date=2026-09-02", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # 4. Delete symptom entry
    del_resp = await client.delete(f"/api/cycle/symptoms/{symp_id}", headers=headers)
    assert del_resp.status_code == 200


@pytest.mark.anyio
async def test_cycle_analytics_and_predictions(client: AsyncClient):
    headers = await create_user_and_token(client, "Analytics Tester")

    # Check empty summary state
    empty_resp = await client.get("/api/cycle/summary", headers=headers)
    assert empty_resp.status_code == 200
    assert empty_resp.json()["has_data"] is False
    assert empty_resp.json()["average_cycle_length"] is None
    assert empty_resp.json()["predictions"] is None

    # Log 3 consecutive periods:
    # Period 1: 2026-01-01 to 2026-01-05 (5 days)
    # Period 2: 2026-01-29 to 2026-02-02 (5 days) -> cycle 1 = 28 days
    # Period 3: 2026-02-26 to 2026-03-02 (5 days) -> cycle 2 = 28 days
    for p in [
        {"start_date": "2026-01-01", "end_date": "2026-01-05", "flow_level": "moderate"},
        {"start_date": "2026-01-29", "end_date": "2026-02-02", "flow_level": "heavy"},
        {"start_date": "2026-02-26", "end_date": "2026-03-02", "flow_level": "moderate"},
    ]:
        p_resp = await client.post("/api/cycle/periods", json=p, headers=headers)
        assert p_resp.status_code == 201

    # Log some symptoms
    await client.post(
        "/api/cycle/symptoms",
        json={
            "log_date": "2026-02-26",
            "symptoms": [{"name": "cramps", "severity": "moderate"}],
            "mood": "tired",
        },
        headers=headers,
    )
    await client.post(
        "/api/cycle/symptoms",
        json={
            "log_date": "2026-02-27",
            "symptoms": [{"name": "cramps", "severity": "mild"}],
            "mood": "calm",
        },
        headers=headers,
    )

    summary_resp = await client.get("/api/cycle/summary", headers=headers)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["has_data"] is True
    assert summary["total_periods"] == 3
    assert summary["average_cycle_length"] == 28.0
    assert summary["average_period_duration"] == 5.0
    assert len(summary["historical_cycle_lengths"]) == 2
    assert summary["predictions"] is not None
    # 2026-02-26 + 28 days = 2026-03-26
    assert summary["predictions"]["predicted_next_start"] == "2026-03-26"
    assert "disclaimer" in summary
    assert len(summary["frequent_symptoms"]) >= 1
    assert summary["frequent_symptoms"][0]["name"] == "cramps"


@pytest.mark.anyio
async def test_cycle_user_isolation(client: AsyncClient):
    headers_a = await create_user_and_token(client, "User A")
    headers_b = await create_user_and_token(client, "User B")

    # User A creates a period
    resp_a = await client.post(
        "/api/cycle/periods",
        json={"start_date": "2026-05-01", "end_date": "2026-05-05", "notes": "Secret A"},
        headers=headers_a,
    )
    period_a_id = resp_a.json()["id"]

    # User B list periods - should be empty
    resp_b_list = await client.get("/api/cycle/periods", headers=headers_b)
    assert resp_b_list.status_code == 200
    assert len(resp_b_list.json()) == 0

    # User B cannot get User A's period
    resp_b_get = await client.get(f"/api/cycle/periods/{period_a_id}", headers=headers_b)
    assert resp_b_get.status_code == 404

    # User B cannot delete User A's period
    resp_b_del = await client.delete(f"/api/cycle/periods/{period_a_id}", headers=headers_b)
    assert resp_b_del.status_code == 404
