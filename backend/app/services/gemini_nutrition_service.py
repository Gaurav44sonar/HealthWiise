import asyncio
import json
import logging
import os
import re
from typing import Any
import urllib.error
import urllib.request

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger(__name__)

GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]

# Common food database heuristic fallback for offline or unconfigured API key
FOOD_DATABASE_HEURISTICS: dict[str, dict[str, Any]] = {
    "egg": {"cal": 74, "p": 6.3, "c": 0.4, "f": 5.0, "portion": "1 large egg"},
    "oats": {"cal": 150, "p": 5.0, "c": 27.0, "f": 2.5, "portion": "1/2 cup (40g dry)"},
    "oatmeal": {"cal": 160, "p": 6.0, "c": 28.0, "f": 3.0, "portion": "1 bowl prepared"},
    "banana": {"cal": 105, "p": 1.3, "c": 27.0, "f": 0.3, "portion": "1 medium (118g)"},
    "apple": {"cal": 95, "p": 0.5, "c": 25.0, "f": 0.3, "portion": "1 medium (182g)"},
    "chicken": {"cal": 220, "p": 31.0, "c": 0.0, "f": 9.0, "portion": "150g breast"},
    "salmon": {"cal": 280, "p": 34.0, "c": 0.0, "f": 15.0, "portion": "150g fillet"},
    "rice": {"cal": 205, "p": 4.2, "c": 45.0, "f": 0.4, "portion": "1 cup cooked (158g)"},
    "bread": {"cal": 80, "p": 3.5, "c": 14.0, "f": 1.0, "portion": "1 slice"},
    "toast": {"cal": 85, "p": 3.5, "c": 15.0, "f": 1.0, "portion": "1 slice"},
    "avocado": {"cal": 160, "p": 2.0, "c": 8.5, "f": 14.7, "portion": "1/2 avocado"},
    "salad": {"cal": 120, "p": 3.0, "c": 10.0, "f": 8.0, "portion": "1 medium bowl with light dressing"},
    "milk": {"cal": 120, "p": 8.0, "c": 12.0, "f": 4.5, "portion": "1 cup (240ml)"},
    "coffee": {"cal": 5, "p": 0.3, "c": 0.0, "f": 0.0, "portion": "1 cup black"},
    "protein": {"cal": 130, "p": 24.0, "c": 3.0, "f": 1.5, "portion": "1 scoop whey (30g)"},
    "shake": {"cal": 200, "p": 25.0, "c": 15.0, "f": 3.0, "portion": "1 smoothie shake"},
    "yogurt": {"cal": 130, "p": 12.0, "c": 14.0, "f": 3.5, "portion": "1 cup greek (170g)"},
    "dal": {"cal": 180, "p": 12.0, "c": 26.0, "f": 3.5, "portion": "1 bowl cooked (200g)"},
    "roti": {"cal": 110, "p": 3.2, "c": 22.0, "f": 0.8, "portion": "1 medium wheat chapati"},
    "paneer": {"cal": 265, "p": 18.0, "c": 4.0, "f": 20.0, "portion": "100g fresh paneer"},
    "pasta": {"cal": 220, "p": 8.0, "c": 43.0, "f": 1.3, "portion": "1 cup cooked"},
    "pizza": {"cal": 285, "p": 12.0, "c": 36.0, "f": 10.0, "portion": "1 regular slice"},
    "burger": {"cal": 450, "p": 24.0, "c": 40.0, "f": 22.0, "portion": "1 standard sandwich"},
    "nuts": {"cal": 170, "p": 6.0, "c": 6.0, "f": 15.0, "portion": "1 handful (28g)"},
    "almond": {"cal": 160, "p": 6.0, "c": 6.0, "f": 14.0, "portion": "1 handful (28g)"},
}


def clean_json_text(raw_text: str) -> dict[str, Any]:
    """Parse JSON object cleanly from raw LLM output."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    return json.loads(text)


def fallback_scan_estimation(text_description: str | None = None) -> dict[str, Any]:
    """
    Intelligent heuristic fallback when Gemini API is unconfigured or offline.
    Uses nutritional baseline lookup to provide realistic breakdown.
    """
    query = (text_description or "Balanced Healthy Meal").lower()
    matched_items = []
    tot_cal = 0
    tot_p = 0.0
    tot_c = 0.0
    tot_f = 0.0

    for keyword, info in FOOD_DATABASE_HEURISTICS.items():
        if keyword in query:
            matched_items.append({
                "name": keyword.capitalize(),
                "portion": info["portion"],
                "calories": info["cal"],
                "protein_g": info["p"],
                "carbs_g": info["c"],
                "fat_g": info["f"],
            })
            tot_cal += info["cal"]
            tot_p += info["p"]
            tot_c += info["c"]
            tot_f += info["f"]

    # If no specific ingredients matched, provide a balanced wellness standard
    if not matched_items:
        tot_cal = 450
        tot_p = 25.0
        tot_c = 50.0
        tot_f = 14.0
        matched_items = [
            {"name": "Whole grains / Complex Carbs", "portion": "1 cup", "calories": 200, "protein_g": 5.0, "carbs_g": 40.0, "fat_g": 2.0},
            {"name": "Lean Protein portion", "portion": "120g", "calories": 180, "protein_g": 18.0, "carbs_g": 2.0, "fat_g": 8.0},
            {"name": "Fresh vegetables & healthy dressing", "portion": "1 bowl", "calories": 70, "protein_g": 2.0, "carbs_g": 8.0, "fat_g": 4.0},
        ]

    # Guess meal type based on query or time
    meal_type = "lunch"
    if any(k in query for k in ["egg", "oat", "toast", "pancake", "cereal", "coffee"]):
        meal_type = "breakfast"
    elif any(k in query for k in ["snack", "nuts", "shake", "apple", "protein bar"]):
        meal_type = "snack"
    elif any(k in query for k in ["dinner", "curry", "steak", "soup"]):
        meal_type = "dinner"

    name = text_description.title() if text_description else "Nutritious Balanced Plate"
    if len(name) > 40:
        name = name[:37] + "..."

    return {
        "name": name,
        "meal_type": meal_type,
        "calories": int(tot_cal),
        "protein_g": round(tot_p, 1),
        "carbs_g": round(tot_c, 1),
        "fat_g": round(tot_f, 1),
        "fiber_g": round(tot_c * 0.15, 1),
        "health_score": 8 if tot_p >= 20 else 7,
        "analysis": "Nutritionally balanced meal with moderate macronutrient distribution. Provides sustained energy release and essential amino acids.",
        "items_detected": matched_items,
        "confidence": "estimated",
        "model_used": "HealthWiise-NutriEngine (Heuristic Fallback)",
    }


async def scan_meal_with_gemini(
    text_description: str | None = None,
    image_base64: str | None = None,
    mime_type: str = "image/jpeg",
    api_key_override: str | None = None,
) -> dict[str, Any]:
    """
    Multimodal meal analysis using Google Gemini 2.5 Flash Vision & NLP.
    Parses meal photos or natural language to extract calories, macros, and items.
    """
    api_key = api_key_override if api_key_override is not None else (
        os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    )

    if not api_key:
        logger.info("GEMINI_API_KEY not configured. Using fallback nutritional estimation.")
        return fallback_scan_estimation(text_description)

    prompt = """You are HealthWiise's Senior AI Clinical Dietitian and Computer Vision Nutritionist.
Analyze the provided meal (from the image and/or text description) with clinical nutritional accuracy.

Analyze and return ONLY a valid JSON object matching this schema:
{
  "name": "Concise attractive meal name (e.g. 'Avocado Toast with Poached Eggs')",
  "meal_type": "breakfast" | "lunch" | "dinner" | "snack",
  "calories": integer,
  "protein_g": float,
  "carbs_g": float,
  "fat_g": float,
  "fiber_g": float,
  "health_score": integer from 1 to 10 (10 = nutrient-dense whole foods),
  "analysis": "2 concise sentences explaining the nutritional quality, satiety index, and blood sugar balance",
  "items_detected": [
    {
      "name": "Food item",
      "portion": "Estimated weight or portion (e.g. '2 large eggs' or '150g')",
      "calories": integer,
      "protein_g": float,
      "carbs_g": float,
      "fat_g": float
    }
  ],
  "confidence": "high" | "medium" | "estimated"
}

Ensure all numerical calories and grams are realistic and grounded in USDA FoodData standards.
Return ONLY valid JSON. No markdown backticks or commentary.
"""

    parts: list[dict[str, Any]] = [{"text": prompt}]

    if text_description:
        parts.append({"text": f"User description of this meal: '{text_description}'"})

    if image_base64:
        clean_b64 = image_base64
        if "base64," in clean_b64:
            clean_b64 = clean_b64.split("base64,")[1]
        parts.append({
            "inline_data": {
                "mime_type": mime_type,
                "data": clean_b64,
            }
        })

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 1024,
        },
    }

    client_timeout = None
    if httpx is not None:
        client_timeout = httpx.Timeout(10.0, connect=2.5)

    for model in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            data = None
            if httpx is not None:
                async with httpx.AsyncClient(timeout=client_timeout) as client:
                    res = await client.post(url, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                    else:
                        logger.warning("Gemini Nutrition model %s returned status %s: %s", model, res.status_code, res.text[:120])
            else:
                def _urllib_call():
                    req_data = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        url,
                        data=req_data,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=8) as response:
                        return json.loads(response.read().decode("utf-8"))

                data = await asyncio.to_thread(_urllib_call)

            if data:
                candidates = data.get("candidates", [])
                if candidates:
                    content_parts = candidates[0].get("content", {}).get("parts", [])
                    if content_parts:
                        raw_text = content_parts[0].get("text", "")
                        parsed = clean_json_text(raw_text)
                        if "calories" in parsed and "protein_g" in parsed:
                            parsed["model_used"] = model
                            # Ensure types
                            parsed["calories"] = int(parsed.get("calories", 0))
                            parsed["protein_g"] = float(parsed.get("protein_g", 0.0))
                            parsed["carbs_g"] = float(parsed.get("carbs_g", 0.0))
                            parsed["fat_g"] = float(parsed.get("fat_g", 0.0))
                            parsed["fiber_g"] = float(parsed.get("fiber_g", 0.0))
                            parsed["health_score"] = int(parsed.get("health_score", 7))
                            if parsed.get("meal_type") not in ["breakfast", "lunch", "dinner", "snack"]:
                                parsed["meal_type"] = "lunch"
                            return parsed

        except Exception as exc:
            logger.warning("Error calling Gemini model %s for nutrition scan: %s", model, exc)

    logger.info("Gemini call failed or unavailable. Falling back to heuristic nutritional estimation.")
    return fallback_scan_estimation(text_description)
