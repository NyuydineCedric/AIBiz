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

_gemini_client = None
_gemini_init_attempted = False
_GEMINI_MODEL = "gemini-3.5-flash"

# Simple greetings / small talk that shouldn't be treated as data questions.
_GREETING_RE = re.compile(
    r"^(hi|hello|hey|yo|hiya|howdy|good\s?(morning|afternoon|evening)|sup|greetings)[\s!.,?]*$",
    re.IGNORECASE,
)
_THANKS_RE = re.compile(r"^(thanks|thank you|thx|ty|cheers|appreciate it)[\s!.,?]*$", re.IGNORECASE)

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
            "relevant. If it's a general question unrelated to the data, just answer it normally "
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