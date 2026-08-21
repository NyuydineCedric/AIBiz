from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user
from ..services import daily_aggregator

router = APIRouter(prefix="/api/daily", tags=["daily"])

ALLOWED_TYPES = {"sale", "purchase"}


def _validate_entry(entry: schemas.DailyEntryIn):
    if entry.entry_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="entry_type must be 'sale' or 'purchase'.")
    if not entry.item_name.strip():
        raise HTTPException(status_code=400, detail="Every line needs an item name.")
    if entry.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0.")
    if entry.unit_price < 0:
        raise HTTPException(status_code=400, detail="Unit price can't be negative.")


@router.post("/entries", response_model=list[schemas.DailyEntryOut])
def add_day_entries(
    payload: schemas.DailyEntryBulkRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Logs a full day's worth of purchase/sale lines in one request — the
    shop owner fills out the day once (e.g. at closing time) rather than
    submitting one line at a time."""
    if not payload.entries:
        raise HTTPException(status_code=400, detail="Add at least one line item.")

    created: list[models.DailyEntry] = []
    for entry in payload.entries:
        _validate_entry(entry)
        row = models.DailyEntry(
            organization_id=current_user.organization_id,
            entry_date=payload.entry_date,
            entry_type=entry.entry_type,
            item_name=entry.item_name.strip(),
            category=entry.category.strip(),
            quantity=entry.quantity,
            unit_price=entry.unit_price,
            amount=round(entry.quantity * entry.unit_price, 2),
            notes=entry.notes.strip(),
        )
        db.add(row)
        created.append(row)

    db.commit()
    daily_aggregator.rebuild_dataset_from_entries(db, current_user.organization_id)

    for row in created:
        db.refresh(row)
    return [schemas.DailyEntryOut.model_validate(r) for r in created]


@router.get("/entries", response_model=list[schemas.DailyEntryOut])
def list_entries(
    entry_date: str | None = Query(default=None, description="YYYY-MM-DD, omit for all entries"),
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.DailyEntry).filter(models.DailyEntry.organization_id == current_user.organization_id)
    if entry_date:
        q = q.filter(models.DailyEntry.entry_date == entry_date)
    rows = q.order_by(models.DailyEntry.entry_date.desc(), models.DailyEntry.created_at.desc()).limit(limit).all()
    return [schemas.DailyEntryOut.model_validate(r) for r in rows]


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    row = (
        db.query(models.DailyEntry)
        .filter(models.DailyEntry.id == entry_id, models.DailyEntry.organization_id == current_user.organization_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found.")
    db.delete(row)
    db.commit()
    daily_aggregator.rebuild_dataset_from_entries(db, current_user.organization_id)
    return None


@router.post("/rebuild", response_model=schemas.DatasetOut | None)
def rebuild_dataset(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Force-regenerates the daily-log dataset (KPIs, trend, labels, etc.)
    from whatever entries currently exist, without needing to add or delete
    one. Mainly useful right after a backend update changes how entries get
    aggregated — existing stored data doesn't retroactively pick up logic
    changes until something triggers a rebuild."""
    dataset = daily_aggregator.rebuild_dataset_from_entries(db, current_user.organization_id)
    return schemas.DatasetOut.model_validate(dataset) if dataset else None


@router.get("/days", response_model=list[schemas.DaySummaryOut])
def list_days(
    limit: int = Query(default=30, le=365),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return daily_aggregator.list_day_summaries(db, current_user.organization_id, limit=limit)


@router.get("/stock", response_model=list[schemas.StockItemOut])
def stock_levels(
    low_stock_threshold: float = Query(default=5),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return daily_aggregator.compute_stock_levels(
        db, current_user.organization_id, low_stock_threshold=low_stock_threshold
    )
