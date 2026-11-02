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
    "puri": {"cal": 140, "p": 2.5, "c": 16.0, "f": 8.0, "portion": "1 fried puri"},
    "bhaji": {"cal": 180, "p": 4.0, "c": 28.0, "f": 6.5, "portion": "1 bowl potato masala"},
    "aloo": {"cal": 170, "p": 3.5, "c": 28.0, "f": 6.0, "portion": "1 bowl aloo curry"},
    "pasta": {"cal": 220, "p": 8.0, "c": 43.0, "f": 1.3, "portion": "1 cup cooked"},
    "pizza": {"cal": 285, "p": 12.0, "c": 36.0, "f": 10.0, "portion": "1 regular slice"},
    "burger": {"cal": 450, "p": 24.0, "c": 40.0, "f": 22.0, "portion": "1 standard sandwich"},
    "nuts": {"cal": 170, "p": 6.0, "c": 6.0, "f": 15.0, "portion": "1 handful (28g)"},
    "almond": {"cal": 160, "p": 6.0, "c": 6.0, "f": 14.0, "portion": "1 handful (28g)"},
}


def clean_json_text(raw_text: str) -> dict[str, Any]:
    """Parse JSON object cleanly and defensively from raw LLM output."""
    text = raw_text.strip()
    # Strip markdown codeblocks
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    text = text.strip()

    # Extract outermost JSON object
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    # Attempt 1: Direct strict parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Attempt 2: Clean trailing commas and trailing characters
    cleaned = re.sub(r",\s*([}\]])", r"\1", text)
    cleaned = re.sub(r":\s*~?\s*(\d+(?:\.\d+)?)\s*(?:kcal|g|grams)?\b", r": \1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'"meal_type"\s*:\s*([a-zA-Z]+)', r'"meal_type": "\1"', cleaned)
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Attempt 3: Python ast evaluation (supports single-quoted strings)
    import ast
    try:
        val = ast.literal_eval(cleaned)
        if isinstance(val, dict):
            return val
    except Exception:
        pass

    # Attempt 4: Robust Regex extraction of individual fields from Gemini text
    extracted: dict[str, Any] = {}
    name_m = re.search(r'"name"\s*:\s*["\']([^"\']+)["\']', text)
    if name_m:
        extracted["name"] = name_m.group(1).strip()
    else:
        extracted["name"] = "Analyzed Meal Plate"

    cal_m = re.search(r'"calories"\s*:\s*(\d+)', text)
    if cal_m:
        extracted["calories"] = int(cal_m.group(1))

    p_m = re.search(r'"protein_g"\s*:\s*(\d+(?:\.\d+)?)', text)
    if p_m:
        extracted["protein_g"] = float(p_m.group(1))

    c_m = re.search(r'"carbs_g"\s*:\s*(\d+(?:\.\d+)?)', text)
    if c_m:
        extracted["carbs_g"] = float(c_m.group(1))

    f_m = re.search(r'"fat_g"\s*:\s*(\d+(?:\.\d+)?)', text)
    if f_m:
        extracted["fat_g"] = float(f_m.group(1))

    fib_m = re.search(r'"fiber_g"\s*:\s*(\d+(?:\.\d+)?)', text)
    if fib_m:
        extracted["fiber_g"] = float(fib_m.group(1))
    else:
        extracted["fiber_g"] = round(extracted.get("carbs_g", 0.0) * 0.15, 1)

    score_m = re.search(r'"health_score"\s*:\s*(\d+)', text)
    if score_m:
        extracted["health_score"] = int(score_m.group(1))
    else:
        extracted["health_score"] = 8

    type_m = re.search(r'"meal_type"\s*:\s*["\']?(breakfast|lunch|dinner|snack)["\']?', text, re.IGNORECASE)
    if type_m:
        extracted["meal_type"] = type_m.group(1).lower()
    else:
        extracted["meal_type"] = "lunch"

    analysis_m = re.search(r'"analysis"\s*:\s*["\']([^"\']+)["\']', text)
    if analysis_m:
        extracted["analysis"] = analysis_m.group(1).strip()
    else:
        extracted["analysis"] = "Balanced whole-food meal with rich micronutrients and balanced energy release."

    # Extract items if present
    items = []
    item_matches = re.finditer(r'\{[^{}]*"name"\s*:\s*["\']([^"\']+)["\'][^{}]*\}', text)
    for m in item_matches:
        chunk = m.group(0)
        item_name = re.search(r'"name"\s*:\s*["\']([^"\']+)["\']', chunk)
        if item_name:
            c_val = re.search(r'"calories"\s*:\s*(\d+)', chunk)
            p_val = re.search(r'"protein_g"\s*:\s*(\d+(?:\.\d+)?)', chunk)
            items.append({
                "name": item_name.group(1),
                "portion": "1 serving",
                "calories": int(c_val.group(1)) if c_val else 100,
                "protein_g": float(p_val.group(1)) if p_val else 5.0,
                "carbs_g": 10.0,
                "fat_g": 4.0,
            })
    extracted["items_detected"] = items
    extracted["confidence"] = "high"

    if "calories" in extracted and "protein_g" in extracted:
        return extracted

    raise ValueError(f"Could not parse valid meal JSON from model response: {text[:200]}")


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
        if image_base64 and not text_description:
            logger.warning("GEMINI_API_KEY is not set for image visual analysis.")
        return fallback_scan_estimation(text_description)

    prompt = """You are HealthWiise's Senior AI Clinical Dietitian and Computer Vision Nutritionist.
Analyze the provided plate of food carefully (from the photo and any text). Identify every visible food item, portion size, and culinary category.

Analyze and return ONLY a valid JSON object matching this exact schema:
{
  "name": "Harvest Chickpea Salad Bowl with Roasted Squash",
  "meal_type": "lunch",
  "calories": 520,
  "protein_g": 18.5,
  "carbs_g": 62.0,
  "fat_g": 22.0,
  "fiber_g": 14.0,
  "health_score": 9,
  "analysis": "Rich in dietary fiber and heart-healthy fats. Excellent blood sugar stabilization.",
  "items_detected": [
    {
      "name": "Roasted Chickpeas",
      "portion": "1 cup",
      "calories": 210,
      "protein_g": 12.0,
      "carbs_g": 35.0,
      "fat_g": 3.5
    }
  ],
  "confidence": "high"
}

Ensure:
1. "meal_type" is strictly one of: "breakfast", "lunch", "dinner", "snack".
2. All numbers are realistic and grounded in clinical USDA FoodData standards.
3. Return ONLY valid JSON. No markdown fences, no backticks, no commentary outside JSON.
"""

    parts: list[dict[str, Any]] = [{"text": prompt}]

    if text_description:
        parts.append({"text": f"User notes about this meal: '{text_description}'"})

    # Google Gemini REST API v1beta requires camelCase 'inlineData' and 'mimeType'
    if image_base64:
        clean_b64 = image_base64
        if "base64," in clean_b64:
            clean_b64 = clean_b64.split("base64,")[1]
        clean_b64 = re.sub(r"\s+", "", clean_b64)
        parts.append({
            "inlineData": {
                "mimeType": mime_type,
                "data": clean_b64,
            }
        })

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
            "thinkingConfig": {
                "thinkingBudget": 0,
            },
        },
    }

    last_error = ""

    for model in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            data = None
            if httpx is not None:
                # 25s timeout for vision multimodal analysis
                timeout = httpx.Timeout(25.0, connect=6.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    res = await client.post(url, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                    else:
                        last_error = f"HTTP {res.status_code}: {res.text[:150]}"
                        logger.warning("Gemini model %s returned status %s: %s", model, res.status_code, res.text[:120])
            else:
                def _urllib_call():
                    req_data = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        url,
                        data=req_data,
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=25) as response:
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
                            parsed["calories"] = max(0, int(parsed.get("calories", 0)))
                            parsed["protein_g"] = max(0.0, float(parsed.get("protein_g", 0.0)))
                            parsed["carbs_g"] = max(0.0, float(parsed.get("carbs_g", 0.0)))
                            parsed["fat_g"] = max(0.0, float(parsed.get("fat_g", 0.0)))
                            parsed["fiber_g"] = max(0.0, float(parsed.get("fiber_g", 0.0)))
                            parsed["health_score"] = min(10, max(1, int(parsed.get("health_score", 7))))
                            mtype = str(parsed.get("meal_type", "lunch")).lower()
                            parsed["meal_type"] = mtype if mtype in ["breakfast", "lunch", "dinner", "snack"] else "lunch"

                            # Normalize items_detected list
                            raw_items = parsed.get("items_detected", [])
                            clean_items = []
                            for itm in raw_items:
                                if isinstance(itm, str):
                                    clean_items.append({
                                        "name": itm,
                                        "portion": "1 serving",
                                        "calories": 0,
                                        "protein_g": 0.0,
                                        "carbs_g": 0.0,
                                        "fat_g": 0.0,
                                    })
                                elif isinstance(itm, dict):
                                    clean_items.append({
                                        "name": str(itm.get("name", "Ingredient")),
                                        "portion": str(itm.get("portion", "1 serving")),
                                        "calories": max(0, int(itm.get("calories", 0) or 0)),
                                        "protein_g": max(0.0, float(itm.get("protein_g", 0.0) or 0.0)),
                                        "carbs_g": max(0.0, float(itm.get("carbs_g", 0.0) or 0.0)),
                                        "fat_g": max(0.0, float(itm.get("fat_g", 0.0) or 0.0)),
                                    })
                            parsed["items_detected"] = clean_items
                            return parsed

        except Exception as exc:
            last_error = str(exc)
            logger.warning("Error calling Gemini model %s for nutrition scan: %s", model, exc)

    logger.info("Gemini call failed or unavailable (%s). Falling back to heuristic estimation.", last_error)
    result = fallback_scan_estimation(text_description)
    if last_error:
        result["analysis"] = (
            f"Note: Gemini Vision was unavailable ({last_error[:70]}). "
            "Showing heuristic estimate. Ensure a valid Gemini API key (starts with AIzaSy) is configured in backend/.env."
        )
    return result
