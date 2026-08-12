from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _latest_parsed_dataset(db: Session, org_id: str) -> models.Dataset | None:
    return (
        db.query(models.Dataset)
        .filter(models.Dataset.organization_id == org_id, models.Dataset.status == "parsed")
        .order_by(models.Dataset.created_at.desc())
        .first()
    )


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
            executive_summary="Upload a business report (CSV, Excel, or PDF) to generate your first AI executive summary.",
            revenue_trend=schemas.SeriesOut(labels=[], values=[]),
            region_breakdown=schemas.SeriesOut(labels=[], values=[]),
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
        risks=[schemas.InsightOut.model_validate(r) for r in risks],
        recommendations=[schemas.InsightOut.model_validate(r) for r in recommendations],
    )
