import os
import shutil
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..deps import get_db, get_current_user
from ..services import data_parser, insight_engine

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB, matches the frontend's stated limit


def _make_session_title(filename: str) -> str:
    """Turn a filename into a short, readable chat title, e.g.
    'FY24_Q4_Consolidated_Financial_Statements.pdf' -> 'FY24 Q4 Consolidated Financial Statements'"""
    name = os.path.splitext(filename)[0]
    name = name.replace("_", " ").replace("-", " ").strip()
    if len(name) > 60:
        name = name[:57].rstrip() + "..."
    return name or "New chat"


@router.post("", response_model=schemas.DatasetOut)
def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail="Unsupported file type. Upload CSV, Excel, PDF, or an image (JPG/PNG/WEBP)."
        )

    org_dir = os.path.join(settings.UPLOADS_DIR, current_user.organization_id)
    os.makedirs(org_dir, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    dest_path = os.path.join(org_dir, safe_name)

    with open(dest_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    size_bytes = os.path.getsize(dest_path)
    if size_bytes > MAX_FILE_SIZE_BYTES:
        os.remove(dest_path)
        raise HTTPException(status_code=400, detail="File exceeds the 25MB limit.")

    dataset = models.Dataset(
        organization_id=current_user.organization_id,
        filename=file.filename,
        file_type=data_parser.detect_file_type(file.filename),
        storage_path=dest_path,
        status="processing",
        size_bytes=size_bytes,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    try:
        parsed = data_parser.parse_file(dest_path, file.filename)
        dataset.row_count = parsed["row_count"]
        dataset.column_count = parsed["column_count"]
        dataset.columns = parsed["columns"]
        dataset.categorical_columns = parsed.get("categorical_columns", [])
        dataset.numeric_summary = parsed["numeric_summary"]
        dataset.text_excerpt = parsed.get("text_excerpt", "")
        dataset.status = "parsed"

        kpis = insight_engine.build_kpis(parsed["numeric_summary"])
        risks = insight_engine.detect_risks(parsed["numeric_summary"])
        recommendations = insight_engine.generate_recommendations(risks)
        executive_summary = insight_engine.build_executive_summary(kpis, risks)
        trend_series = insight_engine.build_revenue_trend_series(parsed.get("dataframe"), parsed["numeric_summary"])
        region_series = insight_engine.build_region_breakdown(
            parsed.get("dataframe"), parsed.get("categorical_columns", []), parsed["numeric_summary"]
        )

        dataset.kpis = kpis
        dataset.executive_summary = executive_summary
        dataset.trend_series = trend_series
        dataset.region_series = region_series
        db.add(dataset)

        for r in risks:
            db.add(
                models.Insight(
                    organization_id=current_user.organization_id,
                    dataset_id=dataset.id,
                    type="risk",
                    severity=r["severity"],
                    text=r["text"],
                )
            )
        for rec in recommendations:
            db.add(
                models.Insight(
                    organization_id=current_user.organization_id,
                    dataset_id=dataset.id,
                    type="recommendation",
                    severity="Medium",
                    text=rec,
                )
            )

        db.commit()
        db.refresh(dataset)
    except Exception as exc:  # noqa: BLE001 - surface parse failure on the dataset record
        print(f"[uploads] Parse failed for {file.filename!r}: {exc!r}")
        dataset.status = "error"
        db.add(dataset)
        db.commit()
        db.refresh(dataset)

    # Automatically start a fresh chat thread for this document, so it shows
    # up in the chat sidebar regardless of whether parsing fully succeeded
    # (a failed/partial parse can still be discussed via the AI's general
    # knowledge and whatever text excerpt was captured).
    chat_session = models.ChatSession(
        organization_id=current_user.organization_id,
        dataset_id=dataset.id,
        title=_make_session_title(dataset.filename),
    )
    db.add(chat_session)
    db.commit()

    return schemas.DatasetOut.model_validate(dataset)


@router.get("", response_model=list[schemas.DatasetOut])
def list_datasets(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    datasets = (
        db.query(models.Dataset)
        .filter(models.Dataset.organization_id == current_user.organization_id)
        .order_by(models.Dataset.created_at.desc())
        .all()
    )
    return [schemas.DatasetOut.model_validate(d) for d in datasets]


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    dataset = (
        db.query(models.Dataset)
        .filter(models.Dataset.id == dataset_id, models.Dataset.organization_id == current_user.organization_id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    # Clean up dependent rows first (no cascade configured on these FKs).
    sessions = db.query(models.ChatSession).filter(models.ChatSession.dataset_id == dataset.id).all()
    for session in sessions:
        db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session.id).delete()
        db.delete(session)

    db.query(models.Insight).filter(models.Insight.dataset_id == dataset.id).delete()

    if dataset.storage_path and os.path.exists(dataset.storage_path):
        try:
            os.remove(dataset.storage_path)
        except OSError as exc:
            print(f"[uploads] Could not remove file for dataset {dataset.id}: {exc!r}")

    db.delete(dataset)
    db.commit()
    return None