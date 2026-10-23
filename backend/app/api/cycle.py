from datetime import date, datetime, timedelta, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.dependencies import get_current_user
from app.db.database import database
from app.schemas.cycle import (
    PeriodCreate,
    PeriodUpdate,
    SymptomLogCreate,
    SymptomLogUpdate,
)

router = APIRouter(prefix="/cycle", tags=["Women's Cycle Tracking"])

periods_collection = database["cycle_periods"]
symptoms_collection = database["cycle_symptoms"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_date(date_str: str) -> date:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format '{date_str}'. Expected YYYY-MM-DD.",
        )


def format_dt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)


def serialize_period(item: dict) -> dict:
    start_d = parse_date(item["start_date"])
    end_d = parse_date(item["end_date"]) if item.get("end_date") else None

    duration_days = None
    if end_d:
        duration_days = (end_d - start_d).days + 1

    return {
        "id": str(item["_id"]),
        "start_date": item["start_date"],
        "end_date": item.get("end_date"),
        "is_ongoing": item.get("end_date") is None,
        "duration_days": duration_days,
        "flow_level": item.get("flow_level"),
        "notes": item.get("notes"),
        "created_at": format_dt(item.get("created_at")),
        "updated_at": format_dt(item.get("updated_at")),
    }


def serialize_symptom(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "log_date": item["log_date"],
        "symptoms": item.get("symptoms", []),
        "mood": item.get("mood"),
        "energy_level": item.get("energy_level"),
        "notes": item.get("notes"),
        "created_at": format_dt(item.get("created_at")),
        "updated_at": format_dt(item.get("updated_at")),
    }


# =====================================================================
# PERIOD LOGGING ENDPOINTS
# =====================================================================

@router.post("/periods", status_code=status.HTTP_201_CREATED)
async def create_period(
    payload: PeriodCreate,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    start_d = parse_date(payload.start_date)

    if payload.end_date:
        end_d = parse_date(payload.end_date)
        if end_d < start_d:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Period end date cannot precede start date.",
            )
        duration = (end_d - start_d).days + 1
        if duration > 35:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A single period duration cannot exceed 35 days. For multiple periods, please record separate entries.",
            )

    # Check for duplicate period with exact same start date
    existing = await periods_collection.find_one({
        "user_id": user_id,
        "start_date": payload.start_date,
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A period starting on {payload.start_date} already exists. Please edit the existing entry instead.",
        )

    now = utc_now()
    doc = {
        "user_id": user_id,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "flow_level": payload.flow_level,
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }

    result = await periods_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_period(doc)


@router.get("/periods")
async def list_periods(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    cursor = periods_collection.find({"user_id": user_id}).sort("start_date", -1)
    items = await cursor.to_list(length=500)

    # Calculate cycle lengths between consecutive chronological periods
    # To do this, sort ascending by start_date
    chrono = sorted(items, key=lambda x: x["start_date"])
    cycle_length_map = {}
    for i in range(len(chrono) - 1):
        p1 = parse_date(chrono[i]["start_date"])
        p2 = parse_date(chrono[i + 1]["start_date"])
        c_len = (p2 - p1).days
        cycle_length_map[str(chrono[i]["_id"])] = c_len

    serialized = []
    for item in items:
        data = serialize_period(item)
        data["cycle_length_to_next"] = cycle_length_map.get(str(item["_id"]))
        serialized.append(data)

    return serialized


@router.get("/periods/{period_id}")
async def get_period(
    period_id: str,
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(period_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid period ID.")

    doc = await periods_collection.find_one({
        "_id": ObjectId(period_id),
        "user_id": str(current_user["_id"]),
    })
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period record not found.")

    return serialize_period(doc)


@router.put("/periods/{period_id}")
async def update_period(
    period_id: str,
    payload: PeriodUpdate,
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(period_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid period ID.")

    user_id = str(current_user["_id"])
    existing = await periods_collection.find_one({
        "_id": ObjectId(period_id),
        "user_id": user_id,
    })
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period record not found.")

    new_start = payload.start_date if payload.start_date is not None else existing["start_date"]
    new_end = payload.end_date if payload.end_date is not None else existing.get("end_date")

    start_d = parse_date(new_start)
    if new_end:
        end_d = parse_date(new_end)
        if end_d < start_d:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Period end date cannot precede start date.",
            )
        if (end_d - start_d).days + 1 > 35:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Period duration cannot exceed 35 days.",
            )

    # Check start date collision if changed
    if payload.start_date and payload.start_date != existing["start_date"]:
        collision = await periods_collection.find_one({
            "user_id": user_id,
            "start_date": payload.start_date,
            "_id": {"$ne": ObjectId(period_id)},
        })
        if collision:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A period starting on {payload.start_date} already exists.",
            )

    update_fields: dict = {"updated_at": utc_now()}
    if payload.start_date is not None:
        update_fields["start_date"] = payload.start_date
    if payload.end_date is not None:
        # Note: allow explicitly clearing end_date by passing empty string or null
        update_fields["end_date"] = payload.end_date if payload.end_date else None
    if payload.flow_level is not None:
        update_fields["flow_level"] = payload.flow_level
    if payload.notes is not None:
        update_fields["notes"] = payload.notes

    await periods_collection.update_one(
        {"_id": ObjectId(period_id), "user_id": user_id},
        {"$set": update_fields},
    )

    updated = await periods_collection.find_one({"_id": ObjectId(period_id)})
    return serialize_period(updated)


@router.delete("/periods/{period_id}")
async def delete_period(
    period_id: str,
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(period_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid period ID.")

    result = await periods_collection.delete_one({
        "_id": ObjectId(period_id),
        "user_id": str(current_user["_id"]),
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period record not found.")

    return {"message": "Period record deleted successfully."}


# =====================================================================
# SYMPTOM AND MOOD TRACKING ENDPOINTS
# =====================================================================

@router.post("/symptoms", status_code=status.HTTP_200_OK)
async def log_symptoms(
    payload: SymptomLogCreate,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    parse_date(payload.log_date)  # validate format

    now = utc_now()
    symptoms_data = [s.model_dump() for s in payload.symptoms]

    doc = {
        "user_id": user_id,
        "log_date": payload.log_date,
        "symptoms": symptoms_data,
        "mood": payload.mood,
        "energy_level": payload.energy_level,
        "notes": payload.notes,
        "updated_at": now,
    }

    # Upsert on (user_id, log_date) so user can add/edit daily symptoms seamlessly
    result = await symptoms_collection.find_one_and_update(
        {"user_id": user_id, "log_date": payload.log_date},
        {
            "$set": doc,
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
        return_document=True,
    )

    return serialize_symptom(result)


@router.get("/symptoms")
async def list_symptoms(
    date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    start_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    query: dict = {"user_id": user_id}

    if date:
        query["log_date"] = date
    elif start_date or end_date:
        query["log_date"] = {}
        if start_date:
            query["log_date"]["$gte"] = start_date
        if end_date:
            query["log_date"]["$lte"] = end_date

    cursor = symptoms_collection.find(query).sort("log_date", -1)
    items = await cursor.to_list(length=365)
    return [serialize_symptom(item) for item in items]


@router.delete("/symptoms/{symptom_id}")
async def delete_symptom(
    symptom_id: str,
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(symptom_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid symptom log ID.")

    result = await symptoms_collection.delete_one({
        "_id": ObjectId(symptom_id),
        "user_id": str(current_user["_id"]),
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Symptom entry not found.")

    return {"message": "Symptom entry deleted successfully."}


# =====================================================================
# CYCLE ANALYTICS & SUMMARY ENDPOINT
# =====================================================================

@router.get("/summary")
async def get_cycle_summary(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    today = date.today()

    # Fetch all periods for user
    cursor = periods_collection.find({"user_id": user_id}).sort("start_date", 1)
    periods = await cursor.to_list(length=500)

    total_periods = len(periods)

    if total_periods == 0:
        return {
            "has_data": False,
            "total_periods": 0,
            "active_period": None,
            "latest_period": None,
            "average_cycle_length": None,
            "average_period_duration": None,
            "current_cycle_day": None,
            "estimated_phase": None,
            "predictions": None,
            "historical_cycle_lengths": [],
            "frequent_symptoms": [],
            "disclaimer": (
                "Cycle tracking estimates are mathematical approximations based strictly on your recorded start dates. "
                "They are not clinical indicators, should never be used as contraception or medical diagnosis, "
                "and require at least two recorded periods to compute cycle intervals."
            ),
        }

    # Analyze periods
    cycle_lengths = []
    durations = []
    for i in range(len(periods)):
        p_start = parse_date(periods[i]["start_date"])
        if periods[i].get("end_date"):
            p_end = parse_date(periods[i]["end_date"])
            d_days = (p_end - p_start).days + 1
            if 1 <= d_days <= 35:
                durations.append(d_days)

        if i < len(periods) - 1:
            next_start = parse_date(periods[i + 1]["start_date"])
            c_len = (next_start - p_start).days
            if 15 <= c_len <= 90:  # plausible cycle interval filter
                cycle_lengths.append({
                    "from_date": periods[i]["start_date"],
                    "to_date": periods[i + 1]["start_date"],
                    "length_days": c_len,
                })

    avg_cycle_len = None
    if len(cycle_lengths) >= 1:
        avg_cycle_len = round(sum(c["length_days"] for c in cycle_lengths) / len(cycle_lengths), 1)

    avg_duration = None
    if len(durations) >= 1:
        avg_duration = round(sum(durations) / len(durations), 1)

    latest_period_raw = periods[-1]
    latest_start = parse_date(latest_period_raw["start_date"])
    latest_end = parse_date(latest_period_raw["end_date"]) if latest_period_raw.get("end_date") else None

    is_currently_bleeding = False
    if latest_end is None:
        # Ongoing period
        is_currently_bleeding = True
    elif latest_start <= today <= latest_end:
        is_currently_bleeding = True

    current_cycle_day = None
    if today >= latest_start:
        current_cycle_day = (today - latest_start).days + 1

    # Phase estimation & prediction
    estimated_phase = None
    predictions = None

    if avg_cycle_len is not None and current_cycle_day is not None:
        # We have at least 2 period starts so we have an average cycle length
        # Calculations:
        # Standard luteal phase is approx 14 days before next period
        est_cycle = int(round(avg_cycle_len))
        est_period_len = int(round(avg_duration or 5))

        ovulation_day = max(est_period_len + 2, est_cycle - 14)
        fertile_start_day = max(est_period_len + 1, ovulation_day - 5)
        fertile_end_day = min(est_cycle, ovulation_day + 1)

        # Determine phase based on current cycle day
        if current_cycle_day <= est_period_len or is_currently_bleeding:
            phase_name = "Menstrual Phase"
            phase_desc = "Menstrual flow occurring. Energy levels and hormones are typically at their baseline."
        elif current_cycle_day < fertile_start_day:
            phase_name = "Follicular Phase"
            phase_desc = "Pre-ovulation phase. Estrogen gradually increases as the body prepares for potential ovulation."
        elif fertile_start_day <= current_cycle_day <= fertile_end_day:
            phase_name = "Ovulation Window"
            phase_desc = "Approximate fertile window around estimated ovulation day. Not clinically verified."
        elif current_cycle_day <= est_cycle:
            phase_name = "Luteal Phase"
            phase_desc = "Post-ovulation phase. Progesterone rises and then drops prior to the next cycle."
        else:
            phase_name = "Late Cycle / Awaiting Period"
            phase_desc = f"Cycle day {current_cycle_day} exceeds your historical average of {est_cycle} days. Cycles naturally fluctuate."

        estimated_phase = {
            "phase_name": phase_name,
            "description": phase_desc,
            "cycle_day": current_cycle_day,
            "phases_overview": {
                "menstrual": f"Days 1-{est_period_len}",
                "follicular": f"Days {est_period_len + 1}-{fertile_start_day - 1}",
                "ovulation_window": f"Days {fertile_start_day}-{fertile_end_day}",
                "luteal": f"Days {fertile_end_day + 1}-{est_cycle}",
            },
        }

        # Predict next period start date
        predicted_next_start = latest_start + timedelta(days=est_cycle)
        predictions = {
            "predicted_next_start": predicted_next_start.isoformat(),
            "confidence_note": (
                f"Calculated from your historical average of {avg_cycle_len} days across {len(cycle_lengths) + 1} recorded periods. "
                "Natural cycle variations of ±2 to 4 days are completely normal."
            ),
            "calculated_at": utc_now().isoformat(),
        }

    # Fetch top logged symptoms
    symptom_cursor = symptoms_collection.find({"user_id": user_id})
    symptom_logs = await symptom_cursor.to_list(length=365)

    symptom_counter: dict[str, int] = {}
    for log in symptom_logs:
        for s in log.get("symptoms", []):
            name = s.get("name")
            if name:
                symptom_counter[name] = symptom_counter.get(name, 0) + 1

    frequent_symptoms = [
        {"name": k, "count": v}
        for k, v in sorted(symptom_counter.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    return {
        "has_data": True,
        "total_periods": total_periods,
        "active_period": serialize_period(latest_period_raw) if is_currently_bleeding else None,
        "latest_period": serialize_period(latest_period_raw),
        "average_cycle_length": avg_cycle_len,
        "average_period_duration": avg_duration,
        "current_cycle_day": current_cycle_day,
        "is_currently_bleeding": is_currently_bleeding,
        "estimated_phase": estimated_phase,
        "predictions": predictions,
        "historical_cycle_lengths": cycle_lengths,
        "frequent_symptoms": frequent_symptoms,
        "disclaimer": (
            "Cycle tracking estimates are mathematical approximations based strictly on your recorded start dates. "
            "They are not clinical indicators, should never be used as contraception or medical diagnosis, "
            "and natural variation is expected."
        ),
    }
