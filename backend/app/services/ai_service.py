"""Wraps Gemini for natural-language answers over a business's dashboard
context. If no GEMINI_API_KEY is configured (or the google-generativeai
package/network isn't available), falls back to a deterministic, data-driven
response built from the same numeric context — so /chat/ask always works,
even in fully offline/local dev.
"""
import json
from typing import Any, Dict, List, Optional

from ..config import settings

_gemini_model = None
_gemini_init_attempted = False


def _get_gemini_model():
    global _gemini_model, _gemini_init_attempted
    if _gemini_init_attempted:
        return _gemini_model
    _gemini_init_attempted = True

    if not settings.GEMINI_API_KEY:
        return None

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        _gemini_model = genai.GenerativeModel("gemini-1.5-flash")
    except Exception:
        _gemini_model = None

    return _gemini_model


def _fallback_answer(question: str, context: Dict[str, Any]) -> str:
    q = question.lower()
    kpis = context.get("kpis", [])
    risks = context.get("risks", [])
    recommendations = context.get("recommendations", [])
    executive_summary = context.get("executive_summary", "")

    if not kpis:
        return "I don't have any uploaded data to analyze yet. Upload a CSV, Excel, or PDF report first, then ask me again."

    def find_kpi(keywords: List[str]) -> Optional[Dict[str, str]]:
        for k in kpis:
            if any(kw in k["label"].lower() for kw in keywords):
                return k
        return None

    # Order matters: check the most specific intents first so a broad keyword
    # (e.g. "revenue" inside "predict next month's revenue") doesn't win over a
    # more specific one (forecast).
    if any(w in q for w in ["forecast", "predict", "next month", "next quarter", "next period"]):
        return (
            "Based on the current trend in your data, I can generate a numeric forecast — "
            "check the Reports tab for a full forecast report, or ask me about a specific metric."
        )

    if any(w in q for w in ["branch", "region", "location", "underperform", "which store"]):
        region = context.get("region_breakdown", {})
        if region.get("labels"):
            lowest_idx = region["values"].index(min(region["values"]))
            return f"{region['labels'][lowest_idx]} is the lowest-performing region in your uploaded data, at {region['values'][lowest_idx]:,.2f}."
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
    model = _get_gemini_model()
    if model is None:
        return _fallback_answer(question, context)

    prompt = (
        "You are an AI business analyst. Answer the user's question using ONLY the "
        "JSON business data context below. Be concise (2-3 sentences), specific, and "
        "reference actual numbers where relevant.\n\n"
        f"Context:\n{json.dumps(context, default=str)}\n\n"
        f"Question: {question}"
    )
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception:
        return _fallback_answer(question, context)
