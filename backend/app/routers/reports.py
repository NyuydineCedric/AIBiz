import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..deps import get_db, get_current_user
from ..services import report_generator
from .dashboard import _latest_parsed_dataset, _default_metric_label, _build_metric_series

router = APIRouter(prefix="/api/reports", tags=["reports"])

REPORT_TITLES = {
    "summary": "Executive summary report",
    "risk": "Risk assessment report",
    "forecast": "Revenue forecast report",
    "performance": "Performance summary report",
}


@router.get("", response_model=list[schemas.ReportOut])
def list_reports(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    reports = (
        db.query(models.Report)
        .filter(models.Report.organization_id == current_user.organization_id)
        .order_by(models.Report.created_at.desc())
        .all()
    )
    return [
        schemas.ReportOut(
            id=r.id,
            title=r.title,
            description=r.description,
            report_type=r.report_type,
            created_at=r.created_at,
            has_pdf=bool(r.pdf_path),
            has_xlsx=bool(r.xlsx_path),
        )
        for r in reports
    ]


@router.post("/generate", response_model=schemas.ReportOut)
def generate_report(
    payload: schemas.ReportGenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    dataset = _latest_parsed_dataset(db, current_user.organization_id)
    if not dataset:
        raise HTTPException(status_code=400, detail="Upload a dataset before generating a report.")

    # Fall back to "summary" for anything unrecognized rather than silently
    # mislabeling the file — every other type below is tailored to exactly
    # match REPORT_TITLES, so an unknown type would otherwise render with
    # the generic layout under a title that doesn't say "summary" at all.
    report_type = payload.report_type if payload.report_type in REPORT_TITLES else "summary"

    insights = db.query(models.Insight).filter(models.Insight.dataset_id == dataset.id).all()
    risks = [{"severity": i.severity, "text": i.text} for i in insights if i.type == "risk"]
    recommendations = [i.text for i in insights if i.type == "recommendation"]

    # A "forecast" report needs actual forecast numbers, not just the
    # generic KPI/risk/recommendation content every other type also gets —
    # reuse the exact same series-building logic the Forecast page itself
    # uses, so the numbers in the report match what's on screen.
    forecast_data = None
    if report_type == "forecast":
        metric_label = _default_metric_label(dataset)
        series = _build_metric_series(dataset, metric_label, periods_ahead=7)
        if series:
            forecast_data = {
                "metric_label": series.metric_label,
                "trend": series.trend,
                "forecast_labels": series.forecast_labels,
                "forecast_values": series.forecast_values,
            }

    title = payload.title or REPORT_TITLES.get(report_type, "Business report")
    org_dir = os.path.join(settings.REPORTS_DIR, current_user.organization_id)
    os.makedirs(org_dir, exist_ok=True)

    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    pdf_path = os.path.join(org_dir, f"{stamp}_{report_type}.pdf")
    xlsx_path = os.path.join(org_dir, f"{stamp}_{report_type}.xlsx")

    report_generator.generate_pdf_report(
        pdf_path, title, report_type, dataset.executive_summary or "", dataset.kpis or [], risks,
        recommendations, forecast_data,
    )
    report_generator.generate_xlsx_report(
        xlsx_path, title, report_type, dataset.kpis or [], risks, recommendations, forecast_data
    )

    report = models.Report(
        organization_id=current_user.organization_id,
        title=title,
        description=f"Generated from {dataset.filename}",
        report_type=report_type,
        pdf_path=pdf_path,
        xlsx_path=xlsx_path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return schemas.ReportOut(
        id=report.id,
        title=report.title,
        description=report.description,
        report_type=report.report_type,
        created_at=report.created_at,
        has_pdf=bool(report.pdf_path),
        has_xlsx=bool(report.xlsx_path),
    )


@router.get("/{report_id}/download")
def download_report(
    report_id: str,
    format: str = Query("pdf", pattern="^(pdf|xlsx)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    report = (
        db.query(models.Report)
        .filter(models.Report.id == report_id, models.Report.organization_id == current_user.organization_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    path = report.pdf_path if format == "pdf" else report.xlsx_path
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"No {format} file available for this report.")

    media_type = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    filename = f"{report.title}.{format}".replace(" ", "_")
    return FileResponse(path, media_type=media_type, filename=filename)
