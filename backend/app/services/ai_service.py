"""Wraps Gemini for natural-language answers over a business's dashboard
context. If no GEMINI_API_KEY is configured (or the google-genai
package/network isn't available), falls back to a deterministic, data-driven
response built from the same numeric context — so /chat/ask always works,
even in fully offline/local dev.
"""
import json
import re
from typing import Any, Dict, List, Optional

from ..config import settings
from .insight_engine import detect_metric_column

_gemini_client = None
_gemini_init_attempted = False
_GEMINI_MODEL = "gemini-3.5-flash"

# Simple greetings / small talk that shouldn't be treated as data questions.
_GREETING_RE = re.compile(
    r"^(hi|hello|hey|yo|hiya|howdy|good\s?(morning|afternoon|evening)|sup|greetings)[\s!.,?]*$",
    re.IGNORECASE,
)
_THANKS_RE = re.compile(r"^(thanks|thank you|thx|ty|cheers|appreciate it)[\s!.,?]*$", re.IGNORECASE)

# Shared with routers/chat.py so a forecast-related question asked in chat
# can also refresh what's shown on the Forecast page.
FORECAST_KEYWORDS = ["forecast", "predict", "next day", "next week", "tomorrow", "next period", "projection"]


def is_forecast_question(question: str) -> bool:
    q = question.lower()
    return any(w in q for w in FORECAST_KEYWORDS)

# Strips common markdown so plain-text chat bubbles don't show literal
# asterisks/underscores/hashes/backticks from model output.
_MD_BOLD_ITALIC_RE = re.compile(r"(\*\*\*|___)(.+?)\1")
_MD_BOLD_RE = re.compile(r"(\*\*|__)(.+?)\1")
_MD_ITALIC_RE = re.compile(r"(?<!\w)(\*|_)(.+?)\1(?!\w)")
_MD_HEADER_RE = re.compile(r"^#{1,6}\s*", re.MULTILINE)
_MD_BULLET_RE = re.compile(r"^\s*[-*+]\s+", re.MULTILINE)
_MD_CODE_RE = re.compile(r"`{1,3}(.+?)`{1,3}", re.DOTALL)


def _strip_markdown(text: str) -> str:
    text = _MD_BOLD_ITALIC_RE.sub(r"\2", text)
    text = _MD_BOLD_RE.sub(r"\2", text)
    text = _MD_ITALIC_RE.sub(r"\2", text)
    text = _MD_HEADER_RE.sub("", text)
    text = _MD_BULLET_RE.sub("• ", text)
    text = _MD_CODE_RE.sub(r"\1", text)
    return text.strip()


def _get_gemini_client():
    """Lazily create a google-genai client. Returns None if the key/package
    is missing or client creation fails, so callers can fall back safely."""
    global _gemini_client, _gemini_init_attempted
    if _gemini_init_attempted:
        return _gemini_client
    _gemini_init_attempted = True

    if not settings.GEMINI_API_KEY:
        return None

    try:
        from google import genai

        _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as exc:  # noqa: BLE001
        print(f"[ai_service] Gemini client init failed: {exc!r}")
        _gemini_client = None

    return _gemini_client


_IMAGE_ANALYSIS_PROMPT = (
    "You are analyzing a photo or scan of a business document — this could be a receipt, "
    "invoice, handwritten sales/purchase ledger page, price list, or a screenshot of a "
    "spreadsheet. Extract every distinct line item you can clearly see that has a name and a "
    "numeric amount (e.g. a product name and its price or total, an expense category and its "
    "amount, a revenue figure). Ignore dates, page numbers, and phone numbers.\n\n"
    "Respond with ONLY a single JSON object, no markdown fences, no explanation, in exactly "
    "this shape:\n"
    '{"description": "one short sentence describing what the image shows", '
    '"items": [{"label": "Item or category name", "value": 1234.5}, ...]}\n\n'
    "If you can't find any numeric line items, return an empty items array."
)


def analyze_image_for_data(image_bytes: bytes, mime_type: str) -> Optional[str]:
    """Sends an uploaded image to Gemini's vision-capable model and asks it to
    extract labeled numeric line items (see _IMAGE_ANALYSIS_PROMPT). Returns
    the raw text response (expected to be a JSON object) for the caller to
    parse, or None if no Gemini client is available (missing API key/package)
    so the caller can fail gracefully instead of crashing the upload."""
    client = _get_gemini_client()
    if not client:
        return None

    try:
        from google.genai import types

        response = client.models.generate_content(
            model=_GEMINI_MODEL,
            contents=[
                _IMAGE_ANALYSIS_PROMPT,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
        )
        return (response.text or "").strip()
    except Exception as exc:  # noqa: BLE001
        print(f"[ai_service] Gemini image analysis failed: {exc!r}")
        return None


def _smalltalk_answer(question: str, has_data: bool) -> Optional[str]:
    """Handle only the most trivial greetings/thanks before anything else —
    everything else (including 'what can you do', general questions, etc.)
    should go to the real model, not a canned string."""
    q = question.strip()

    if _GREETING_RE.match(q):
        if has_data:
            return "Hi! I've got your uploaded business data ready — ask me anything about it."
        return "Hi! I'm your AI business analyst. Upload a CSV, Excel, or PDF report and I can answer questions about it — or just ask me anything in the meantime."

    if _THANKS_RE.match(q):
        return "You're welcome! Let me know if you have more questions."

    return None


def _fallback_answer(question: str, context: Dict[str, Any]) -> str:
    """Deterministic, keyword-based answer used ONLY when Gemini is
    unavailable (no key, package missing, network/API failure). This is a
    safety net, not the primary answer path."""
    q = question.lower()
    kpis = context.get("kpis", [])
    risks = context.get("risks", [])
    recommendations = context.get("recommendations", [])
    executive_summary = context.get("executive_summary", "")

    if not kpis:
        return (
            "I don't have any uploaded business data to analyze yet, and I'm currently unable to "
            "reach the AI model for a general answer. Upload a CSV, Excel, or PDF report, or try again shortly."
        )

    def find_kpi(keywords: List[str]) -> Optional[Dict[str, str]]:
        for k in kpis:
            if any(kw in k["label"].lower() for kw in keywords):
                return k
        return None

    if is_forecast_question(q):
        forecast = context.get("forecast") or {}
        values = forecast.get("values") or []
        if values:
            direction = forecast.get("trend", "flat")
            word = "trending up" if direction == "up" else "trending down" if direction == "down" else "roughly flat"
            return (
                f"Revenue is {word} — the projection puts it at about {values[-1]:,.0f} "
                f"{len(values)} periods out, based on the trend in your uploaded data."
            )
        return (
            "Based on the current trend in your data, I can generate a numeric forecast — "
            "check the Forecast page for a full projection, or ask me about a specific metric."
        )

    # Check for a direct hit on any individual line item from the dataset
    # (not just the handful surfaced as top KPIs) before falling through to
    # the broader keyword buckets below, so a question naming a specific
    # metric — e.g. "New Product Line Revenue" — gets answered with real
    # numbers even if that metric isn't one of the curated dashboard KPIs.
    metrics = context.get("metrics") or {}
    if metrics:
        metric_col = detect_metric_column(question, metrics)
        if metric_col:
            stats = metrics[metric_col]
            value = stats.get("value")
            trend = stats.get("trend_pct")
            if value is not None and trend is not None:
                direction = "up" if trend > 0 else "down" if trend < 0 else "flat"
                sign = "+" if trend >= 0 else ""
                return (
                    f"{metric_col} is currently at {value:,.0f}, {sign}{trend:.1f}% "
                    f"({direction}) across the uploaded period."
                )

    if any(w in q for w in ["branch", "region", "location", "underperform", "which store"]):
        region = context.get("region_breakdown", {})
        if region.get("labels"):
            wants_worst = any(w in q for w in ["worst", "lowest", "underperform", "struggling", "weakest"])
            trends = context.get("region_trends") or {}

            if trends:
                # "Best/worst performing" means growing/shrinking fastest,
                # not just largest/smallest by current total.
                label = min(trends, key=trends.get) if wants_worst else max(trends, key=trends.get)
                pct = trends[label]
                sign = "+" if pct >= 0 else ""
                qualifier = "worst-trending" if wants_worst else "best-trending"
                value = None
                if label in region["labels"]:
                    value = region["values"][region["labels"].index(label)]
                value_part = f" (currently at {value:,.0f})" if value is not None else ""
                return f"{label} is the {qualifier} region in your uploaded data, {sign}{pct:.1f}% over the period{value_part}."

            # No trend data available (e.g. region breakdown grouped from a
            # plain category column) — fall back to comparing current totals.
            if wants_worst:
                idx = region["values"].index(min(region["values"]))
                qualifier = "lowest-performing"
            else:
                idx = region["values"].index(max(region["values"]))
                qualifier = "best-performing"
            return f"{region['labels'][idx]} is the {qualifier} region in your uploaded data, at {region['values'][idx]:,.0f}."
        return "I don't see a region or branch column in your uploaded data yet."

    if any(w in q for w in ["risk", "wrong", "problem", "concern"]):
        if risks:
            return " ".join(f"[{r['severity']}] {r['text']}" for r in risks[:3])
        return "No significant risks were detected in your uploaded data."

    if any(w in q for w in ["cost", "expense", "spend"]):
        kpi = find_kpi(["cost", "expense", "spend"])
        if kpi:
            return f"{kpi['label']} is at {kpi['value']} ({kpi['change']})."
        return "I don't see a cost-related column in your uploaded data yet."

    if any(w in q for w in ["recommend", "what should", "how can we improve", "do next", "suggest"]):
        if recommendations:
            return " ".join(recommendations[:3])
        return "No specific recommendations yet — upload more data for deeper analysis."

    if any(w in q for w in ["profit", "revenue", "sales", "best", "highest"]):
        kpi = find_kpi(["revenue", "sales", "profit"]) or kpis[0]
        return f"{kpi['label']} is currently at {kpi['value']} ({kpi['change']})."

    return executive_summary or "Here's what I found based on your uploaded business data — try asking about revenue, cost, risks, or recommendations for more specific answers."


def answer_question(question: str, context: Dict[str, Any]) -> str:
    # Only intercept trivial greetings/thanks — everything else goes to Gemini.
    smalltalk = _smalltalk_answer(question, has_data=bool(context.get("kpis")))
    if smalltalk is not None:
        return smalltalk

    client = _get_gemini_client()
    if client is None:
        return _strip_markdown(_fallback_answer(question, context))

    style_rule = (
        "Reply in plain text only — no markdown, no asterisks for bold/italics, no # headers, "
        "no backticks. Use plain sentences and, if you need a list, write it as simple lines "
        "starting with a dash, not asterisks.\n\n"
    )

    has_data = bool(context.get("kpis"))
    if has_data:
        prompt = (
            "You are an AI business analyst embedded in a dashboard app. Answer the user's "
            "question. If it relates to their business, use ONLY the JSON business data context "
            "below and be concise (2-3 sentences), specific, and reference actual numbers where "
            "relevant. The 'metrics' object contains every individual line item detected in the "
            "uploaded dataset (not just the ones in 'kpis'), keyed by its exact name, each with a "
            "'value' and 'trend_pct' — check it for any specific metric the user names, even if it "
            "isn't in 'kpis'. If it's a general question unrelated to the data, just answer it normally "
            "and naturally, like a helpful assistant.\n\n"
            f"{style_rule}"
            f"Context:\n{json.dumps(context, default=str)}\n\n"
            f"Question: {question}"
        )
    else:
        prompt = (
            "You are an AI business analyst embedded in a dashboard app. No business data has "
            "been uploaded yet. Answer the user's question naturally and helpfully. If it's a "
            "question that would need their uploaded data (revenue, costs, risks, etc.), let them "
            "know they should upload a CSV, Excel, or PDF report first, then answer as best you can "
            "in general terms. For anything else, just answer normally.\n\n"
            f"{style_rule}"
            f"Question: {question}"
        )

    try:
        response = client.models.generate_content(model=_GEMINI_MODEL, contents=prompt)
        text = _strip_markdown((response.text or "").strip())
        return text or _fallback_answer(question, context)
    except Exception as exc:  # noqa: BLE001
        print(f"[ai_service] Gemini generate_content failed: {exc!r}")
        return _strip_markdown(_fallback_answer(question, context))