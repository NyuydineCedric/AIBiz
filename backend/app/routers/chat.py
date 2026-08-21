from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import models, schemas
from ..deps import get_db, get_current_user
from ..services import ai_service, forecast_engine, insight_engine

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Matches the Forecast page's default "periods ahead" toggle, so a forecast
# answer generated here (from chat) lines up with what the page shows by
# default when the user goes and looks at it.
DEFAULT_FORECAST_PERIODS = 7


def _build_context(dataset: models.Dataset | None, db: Session, org_id: str) -> dict:
    if not dataset or dataset.status != "parsed":
        return {"kpis": [], "risks": [], "recommendations": [], "executive_summary": "", "region_breakdown": {}}

    insights = db.query(models.Insight).filter(models.Insight.dataset_id == dataset.id).all()
    risks = [{"severity": i.severity, "text": i.text} for i in insights if i.type == "risk"]
    recommendations = [i.text for i in insights if i.type == "recommendation"]

    context = {
        "kpis": dataset.kpis or [],
        "risks": risks,
        "recommendations": recommendations,
        "executive_summary": dataset.executive_summary or "",
        "region_breakdown": dataset.region_series or {},
    }

    # Per-region growth trend (percent change across the uploaded period),
    # when we have it, so "best/worst region" can mean "growing/shrinking
    # fastest" rather than just "largest/smallest by current total" —
    # matches what "performing best" actually implies.
    numeric_summary = dataset.numeric_summary or {}
    region_labels = (dataset.region_series or {}).get("labels") or []
    region_trends = {
        label: numeric_summary[label]["trend_pct"]
        for label in region_labels
        if label in numeric_summary and "trend_pct" in numeric_summary[label]
    }
    if region_trends:
        context["region_trends"] = region_trends

    # Every individual line item from the parsed dataset (not just the top
    # handful surfaced as dashboard KPIs), so a question about a specific
    # metric by name (e.g. "New Product Line Revenue") can still be answered
    # even when that metric didn't make the curated KPI cut.
    if numeric_summary:
        context["metrics"] = {
            col: {
                "value": round(insight_engine.current_value(stats) or 0, 2),
                "trend_pct": stats.get("trend_pct"),
            }
            for col, stats in numeric_summary.items()
        }

    trend = dataset.trend_series or {}
    values = trend.get("values") or []
    if len(values) >= 2:
        result = forecast_engine.forecast_series(values, periods_ahead=DEFAULT_FORECAST_PERIODS)
        forecast_values = result.get("forecast") or []
        if forecast_values:
            context["revenue_trend"] = trend
            context["forecast"] = {
                "values": forecast_values,
                "lower_bound": result.get("lower_bound") or [],
                "upper_bound": result.get("upper_bound") or [],
                "trend": result.get("trend", "flat"),
                "periods_ahead": DEFAULT_FORECAST_PERIODS,
            }

    return context


def _get_session_or_404(db: Session, session_id: str, org_id: str) -> models.ChatSession:
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.id == session_id, models.ChatSession.organization_id == org_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


@router.get("/sessions", response_model=list[schemas.ChatSessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sessions = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.organization_id == current_user.organization_id)
        .order_by(models.ChatSession.created_at.desc())
        .all()
    )
    out = []
    for s in sessions:
        out.append(
            schemas.ChatSessionOut(
                id=s.id,
                title=s.title,
                dataset_id=s.dataset_id,
                dataset_filename=s.dataset.filename if s.dataset else None,
                dataset_status=s.dataset.status if s.dataset else None,
                created_at=s.created_at,
            )
        )
    return out


@router.get("/sessions/{session_id}/messages", response_model=list[schemas.ChatMessageOut])
def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.organization_id)
    return [schemas.ChatMessageOut.model_validate(m) for m in session.messages]


@router.post("/sessions/{session_id}/ask", response_model=schemas.ChatResponse)
def ask_question_in_session(
    session_id: str,
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.organization_id)
    context = _build_context(session.dataset, db, current_user.organization_id)
    answer = ai_service.answer_question(payload.question, context)

    # Whatever the user just asked in chat becomes what the Forecast page
    # shows next, regardless of topic — the two pages stay in lockstep with
    # the latest chat answer rather than the Forecast page holding its own
    # separate, potentially stale narrative. We also try to detect which
    # metric(s) — revenue, a specific cost line, one or more named products,
    # etc. — the question/answer was actually about, so the Forecast page's
    # chart can switch to those metrics too (as separate lines if there's
    # more than one), not just its caption text.
    if session.dataset and (context.get("forecast") or {}).get("values"):
        metrics = insight_engine.detect_metric_columns(
            f"{payload.question} {answer}", session.dataset.numeric_summary or {}
        )
        # Copy (don't mutate the tracked dict in place) and explicitly flag
        # it modified — JSON columns don't auto-detect in-place mutation, so
        # without this the write silently never reaches the database.
        cache = dict(session.dataset.forecast_insight_cache or {})
        cache[str(DEFAULT_FORECAST_PERIODS)] = {
            "text": answer,
            "metric": metrics[0] if metrics else None,  # kept for backward compat
            "metrics": metrics,
        }
        session.dataset.forecast_insight_cache = cache
        flag_modified(session.dataset, "forecast_insight_cache")
        db.add(session.dataset)

    db.add(
        models.ChatMessage(
            organization_id=current_user.organization_id,
            session_id=session.id,
            user_id=current_user.id,
            role="user",
            text=payload.question,
        )
    )
    db.add(
        models.ChatMessage(
            organization_id=current_user.organization_id,
            session_id=session.id,
            user_id=current_user.id,
            role="ai",
            text=answer,
        )
    )
    db.commit()

    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session.id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )

    return schemas.ChatResponse(
        answer=answer,
        history=[schemas.ChatMessageOut.model_validate(m) for m in history],
    )


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = _get_session_or_404(db, session_id, current_user.organization_id)
    db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session.id).delete()
    db.delete(session)
    db.commit()