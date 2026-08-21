from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import models, schemas
from ..deps import get_db, get_current_user
from ..services import ai_service, forecast_engine, insight_engine

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _build_forecast(trend: dict) -> schemas.SeriesOut:
    """Projects the next 3 periods from the revenue trend series using
    forecast_engine's linear regression, continuing the P1, P2... labels."""
    values = (trend or {}).get("values") or []
    if len(values) < 2:
        return schemas.SeriesOut(labels=[], values=[])

    result = forecast_engine.forecast_series(values, periods_ahead=3)
    forecast_values = result.get("forecast") or []
    if not forecast_values:
        return schemas.SeriesOut(labels=[], values=[])

    start = len(values) + 1
    labels = [f"Day {start + i}" for i in range(len(forecast_values))]
    return schemas.SeriesOut(labels=labels, values=forecast_values)


def _latest_parsed_dataset(db: Session, org_id: str) -> models.Dataset | None:
    return (
        db.query(models.Dataset)
        .filter(models.Dataset.organization_id == org_id, models.Dataset.status == "parsed")
        .order_by(models.Dataset.created_at.desc())
        .first()
    )


def _default_metric_label(dataset: models.Dataset) -> str:
    """Whichever column the dataset's own trend_series actually represents —
    "Total Revenue" for most file uploads, but "Total Sales" for daily-log
    data. Hardcoding "Total Revenue" mislabeled daily-log charts even though
    the underlying numbers were correct."""
    numeric_summary = dataset.numeric_summary or {}
    for col in numeric_summary.keys():
        if any(kw in col.lower() for kw in insight_engine.REVENUE_KEYWORDS):
            return col
    return "Total Revenue"


def _build_metric_series(
    dataset: models.Dataset, metric_label: str, periods_ahead: int
) -> schemas.MetricSeriesOut | None:
    """Actual + forecast line for a single metric (e.g. "Rice" or "Total
    Sales"). Returns None when there isn't enough history to forecast from,
    so the caller can just drop that metric rather than fail the whole
    response."""
    metric_stats = (dataset.numeric_summary or {}).get(metric_label) or {}
    raw_values = metric_stats.get("raw_values") or []
    if raw_values:
        values = raw_values
        labels = metric_stats.get("labels") or [f"Day {i + 1}" for i in range(len(raw_values))]
        period_dates = metric_stats.get("period_dates")
    else:
        trend = dataset.trend_series or {}
        values = trend.get("values") or []
        labels = trend.get("labels") or []
        period_dates = None

    result = forecast_engine.forecast_series(values, periods_ahead=periods_ahead)
    forecast_values = result.get("forecast") or []
    if not forecast_values:
        return None

    forecast_labels = insight_engine.continue_day_labels(period_dates, len(forecast_values))
    if not forecast_labels:
        start = len(values) + 1
        forecast_labels = [f"Day {start + i}" for i in range(len(forecast_values))]

    return schemas.MetricSeriesOut(
        metric_label=metric_label,
        actual=schemas.SeriesOut(labels=labels, values=values),
        forecast_labels=forecast_labels,
        forecast_values=forecast_values,
        lower_bound=result.get("lower_bound") or [],
        upper_bound=result.get("upper_bound") or [],
        trend=result.get("trend", "flat"),
        slope_per_period=result.get("slope_per_period", 0.0),
    )


def _get_dataset_chat_session(db: Session, dataset: models.Dataset, org_id: str) -> models.ChatSession:
    """Every upload already gets a chat session (see routers/uploads.py). Reuse
    it so the Forecast page's AI insight is a real chat exchange the user can
    see and continue in Ask a question, not a disconnected one-off call."""
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.dataset_id == dataset.id, models.ChatSession.organization_id == org_id)
        .order_by(models.ChatSession.created_at.asc())
        .first()
    )
    if not session:
        session = models.ChatSession(organization_id=org_id, dataset_id=dataset.id, title=dataset.filename)
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


@router.get("/summary", response_model=schemas.DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    dataset = _latest_parsed_dataset(db, current_user.organization_id)

    if not dataset:
        return schemas.DashboardSummary(
            has_data=False,
            kpis=[],
            executive_summary="Log a day of sales/purchases, or upload a business report (CSV, Excel, or PDF), to generate your first AI executive summary.",
            revenue_trend=schemas.SeriesOut(labels=[], values=[]),
            region_breakdown=schemas.SeriesOut(labels=[], values=[]),
            forecast=schemas.SeriesOut(labels=[], values=[]),
            risks=[],
            recommendations=[],
        )

    insights = (
        db.query(models.Insight)
        .filter(models.Insight.dataset_id == dataset.id)
        .order_by(models.Insight.created_at.asc())
        .all()
    )
    risks = [i for i in insights if i.type == "risk"]
    recommendations = [i for i in insights if i.type == "recommendation"]

    return schemas.DashboardSummary(
        has_data=True,
        kpis=[schemas.KpiOut(**k) for k in (dataset.kpis or [])],
        executive_summary=dataset.executive_summary or "",
        revenue_trend=schemas.SeriesOut(**(dataset.trend_series or {"labels": [], "values": []})),
        region_breakdown=schemas.SeriesOut(**(dataset.region_series or {"labels": [], "values": []})),
        forecast=_build_forecast(dataset.trend_series),
        risks=[schemas.InsightOut.model_validate(r) for r in risks],
        recommendations=[schemas.InsightOut.model_validate(r) for r in recommendations],
    )


@router.get("/forecast", response_model=schemas.ForecastDetail)
def dashboard_forecast(
    periods_ahead: int = Query(default=7, ge=1, le=60),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    dataset = _latest_parsed_dataset(db, current_user.organization_id)

    if not dataset or not dataset.trend_series:
        return schemas.ForecastDetail(
            has_data=False,
            actual=schemas.SeriesOut(labels=[], values=[]),
            forecast_labels=[],
            forecast_values=[],
            lower_bound=[],
            upper_bound=[],
            trend="flat",
            slope_per_period=0.0,
            note="Log a day of sales/purchases, or upload a business report, to generate a forecast.",
        )

    # Reuse a previously-generated narrative for this exact periods_ahead
    # choice instead of calling the AI again on every page load/revisit —
    # otherwise the insight appears to "disappear" or reword itself each
    # time the user navigates away and back. The cached entry can also carry
    # which metric(s) — revenue, a specific cost line, one or more named
    # products — that narrative was actually about, from the last chat
    # question — if so, chart those metrics' own trends instead of always
    # revenue, so the chart matches what the insight text is describing. A
    # question naming two+ products means two+ lines on the same chart.
    cache = dict(dataset.forecast_insight_cache or {})
    cache_key = str(periods_ahead)
    cached = cache.get(cache_key)
    if isinstance(cached, str):  # backward-compat with the old plain-string cache format
        cached = {"text": cached, "metric": None, "metrics": []}
    ai_insight = (cached or {}).get("text") or ""
    cached_metrics = (cached or {}).get("metrics") or []
    if not cached_metrics and (cached or {}).get("metric"):
        cached_metrics = [cached["metric"]]  # backward-compat with the old single-metric cache format

    numeric_summary = dataset.numeric_summary or {}
    metric_labels = [
        m for m in cached_metrics if len((numeric_summary.get(m) or {}).get("raw_values") or []) >= 2
    ]
    if not metric_labels:
        metric_labels = [_default_metric_label(dataset)]

    series_list: List[schemas.MetricSeriesOut] = []
    for label in metric_labels:
        s = _build_metric_series(dataset, label, periods_ahead)
        if s is not None:
            series_list.append(s)

    if not series_list:
        fallback_label = metric_labels[0]
        fallback_stats = numeric_summary.get(fallback_label) or {}
        fallback_values = fallback_stats.get("raw_values") or (dataset.trend_series or {}).get("values") or []
        fallback_labels = fallback_stats.get("labels") or (dataset.trend_series or {}).get("labels") or []
        return schemas.ForecastDetail(
            has_data=True,
            series=[],
            actual=schemas.SeriesOut(labels=fallback_labels, values=fallback_values),
            note="Not enough data points to forecast.",
            metric_label=fallback_label,
        )

    if not ai_insight:
        insights = db.query(models.Insight).filter(models.Insight.dataset_id == dataset.id).all()
        risks = [{"severity": i.severity, "text": i.text} for i in insights if i.type == "risk"]

        ai_context = {
            "kpis": dataset.kpis or [],
            "risks": risks,
            "executive_summary": dataset.executive_summary or "",
            "revenue_trend": {"labels": series_list[0].actual.labels, "values": series_list[0].actual.values},
            "forecast": {
                "values": series_list[0].forecast_values,
                "lower_bound": series_list[0].lower_bound,
                "upper_bound": series_list[0].upper_bound,
                "trend": series_list[0].trend,
                "periods_ahead": periods_ahead,
            },
        }
        if len(series_list) > 1:
            ai_context["forecast_by_metric"] = {
                s.metric_label: {"values": s.forecast_values, "trend": s.trend} for s in series_list
            }
            names = ", ".join(s.metric_label for s in series_list)
            question_text = (
                f"What's the forecast for {names} over the next {periods_ahead} days, how do they "
                "compare, and what should we do about it?"
            )
        else:
            question_text = (
                f"What's the forecast for {series_list[0].metric_label} over the next {periods_ahead} "
                "days, and what should we do about it?"
            )
        ai_insight = ai_service.answer_question(question_text, ai_context)

        # Post it as a real user/AI message pair in this dataset's chat
        # session, so it shows up in Ask a question too, not just here.
        chat_session = _get_dataset_chat_session(db, dataset, current_user.organization_id)
        db.add(
            models.ChatMessage(
                organization_id=current_user.organization_id,
                session_id=chat_session.id,
                user_id=current_user.id,
                role="user",
                text=question_text,
            )
        )
        db.add(
            models.ChatMessage(
                organization_id=current_user.organization_id,
                session_id=chat_session.id,
                user_id=current_user.id,
                role="ai",
                text=ai_insight,
            )
        )

        cache[cache_key] = {
            "text": ai_insight,
            "metric": metric_labels[0] if metric_labels else None,
            "metrics": metric_labels,
        }
        dataset.forecast_insight_cache = cache
        flag_modified(dataset, "forecast_insight_cache")
        db.add(dataset)
        db.commit()

    primary = series_list[0]
    return schemas.ForecastDetail(
        has_data=True,
        series=series_list,
        note="",
        ai_insight=ai_insight,
        actual=primary.actual,
        forecast_labels=primary.forecast_labels,
        forecast_values=primary.forecast_values,
        lower_bound=primary.lower_bound,
        upper_bound=primary.upper_bound,
        trend=primary.trend,
        slope_per_period=primary.slope_per_period,
        metric_label=primary.metric_label,
    )
