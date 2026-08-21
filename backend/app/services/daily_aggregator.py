"""Rolls a shop's day-by-day purchase/sale entries up into the same Dataset
shape file uploads produce (numeric_summary, kpis, risks, recommendations,
executive_summary, trend_series, region_series) so every downstream feature
— dashboard, forecast, chatbot — works on manually-entered data without any
of that code needing to know entries exist at all. There's exactly one
"daily_log" Dataset per organization; it's rebuilt (not recreated) every
time an entry is added or removed.
"""
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from .. import models
from . import insight_engine


def _metric_stats(raw_values: List[float], dates: Optional[List[Any]] = None) -> Dict[str, Any]:
    if not raw_values:
        return {"mean": 0.0, "sum": 0.0, "min": 0.0, "max": 0.0, "trend_pct": 0.0, "raw_values": []}

    # Days with no entry for this specific item are padded to 0 so every
    # metric lines up on the same day axis (see by_day_item below) — those
    # padding zeros aren't a real "dropped to nothing," they're just gaps.
    # Comparing the first/last *real* (nonzero) day instead of the first/
    # last array element keeps an infrequently-sold item's trend from
    # reading as a misleading "-100%" every time it simply wasn't sold on
    # the most recent logged day.
    nonzero_idx = [i for i, v in enumerate(raw_values) if v]
    first = raw_values[nonzero_idx[0]] if nonzero_idx else raw_values[0]
    last = raw_values[nonzero_idx[-1]] if nonzero_idx else raw_values[-1]
    trend_pct = 0.0 if first == 0 else round(((last - first) / abs(first)) * 100, 2)
    stats: Dict[str, Any] = {
        "mean": round(sum(raw_values) / len(raw_values), 2),
        "sum": round(sum(raw_values), 2),
        "min": round(min(raw_values), 2),
        "max": round(max(raw_values), 2),
        "trend_pct": trend_pct,
        "raw_values": [round(v, 2) for v in raw_values],
    }
    # Real calendar dates behind each value (unlike file uploads, daily-log
    # data always knows the actual day) — lets any chart showing this metric
    # use weekday/week labels instead of generic "Day N", and lets the
    # forecast segment continue with real upcoming calendar days too.
    if dates:
        stats["labels"] = [insight_engine.day_label(d) for d in dates]
        stats["period_dates"] = [d.isoformat() for d in dates]
    return stats


def rebuild_dataset_from_entries(db: Session, org_id: str) -> Optional[models.Dataset]:
    entries = (
        db.query(models.DailyEntry)
        .filter(models.DailyEntry.organization_id == org_id)
        .order_by(models.DailyEntry.entry_date.asc())
        .all()
    )

    existing = (
        db.query(models.Dataset)
        .filter(models.Dataset.organization_id == org_id, models.Dataset.source == "daily_log")
        .first()
    )

    if not entries:
        if existing:
            db.query(models.Insight).filter(models.Insight.dataset_id == existing.id).delete()
            sessions = db.query(models.ChatSession).filter(models.ChatSession.dataset_id == existing.id).all()
            for s in sessions:
                db.query(models.ChatMessage).filter(models.ChatMessage.session_id == s.id).delete()
                db.delete(s)
            db.delete(existing)
            db.commit()
        return None

    by_day: Dict[Any, Dict[str, float]] = defaultdict(lambda: {"sales": 0.0, "purchases": 0.0})
    item_sales: Dict[str, float] = defaultdict(float)
    # Per-item day-by-day sales, not just the totals — this is what lets a
    # product (e.g. "Rice") become its own chartable metric, same as "Total
    # Sales", so the chatbot/Forecast page can show individual products'
    # trends, including two or more side by side on the same chart.
    by_day_item: Dict[str, Dict[Any, float]] = defaultdict(lambda: defaultdict(float))

    for e in entries:
        bucket = by_day[e.entry_date]
        if e.entry_type == "sale":
            bucket["sales"] += e.amount
            item_sales[e.item_name] += e.amount
            by_day_item[e.item_name][e.entry_date] += e.amount
        else:
            bucket["purchases"] += e.amount

    days = sorted(by_day.keys())
    sales_values = [round(by_day[d]["sales"], 2) for d in days]
    purchase_values = [round(by_day[d]["purchases"], 2) for d in days]
    profit_values = [round(s - p, 2) for s, p in zip(sales_values, purchase_values)]

    numeric_summary = {
        "Total Sales": _metric_stats(sales_values, days),
        "Total Purchases": _metric_stats(purchase_values, days),
        "Net Profit": _metric_stats(profit_values, days),
    }

    top_items = sorted(item_sales.items(), key=lambda kv: kv[1], reverse=True)[:6]
    region_series = {
        "labels": [name for name, _ in top_items],
        "values": [round(v, 2) for _, v in top_items],
    }

    # Give each of the top items its own day-aligned series (0 on days it
    # had no sales) so it behaves exactly like "Total Sales" for charting,
    # metric detection, and forecasting.
    for item_name, _ in top_items:
        item_daily = by_day_item[item_name]
        item_values = [round(item_daily.get(d, 0.0), 2) for d in days]
        numeric_summary[item_name] = _metric_stats(item_values, days)

    kpis = insight_engine.build_kpis(numeric_summary)
    # Trend-based risks (detect_risks) can't see physical inventory at all —
    # add stock-based risks (overstock/expiry, dead stock, low stock,
    # oversold items) computed from actual purchased-vs-sold quantities, so
    # something like "still sitting on a pile of rice that isn't selling"
    # actually shows up, not just big swings in a numeric column.
    stock_levels = compute_stock_levels(db, org_id)
    risks = insight_engine.detect_risks(numeric_summary) + insight_engine.detect_stock_risks(stock_levels)
    recommendations = insight_engine.generate_recommendations(risks)
    executive_summary = insight_engine.build_executive_summary(kpis, risks)
    # Built directly (not via build_revenue_trend_series) so it carries real
    # weekday/week labels instead of that function's generic "Day N".
    trend_series = {"labels": numeric_summary["Total Sales"]["labels"], "values": sales_values}

    dataset = existing or models.Dataset(
        organization_id=org_id,
        filename="Daily Shop Log",
        file_type="Manual Entry",
        storage_path="",
        source="daily_log",
    )
    dataset.filename = "Daily Shop Log"
    dataset.file_type = "Manual Entry"
    dataset.status = "parsed"
    dataset.row_count = len(days)
    dataset.column_count = len(numeric_summary)
    dataset.columns = list(numeric_summary.keys())
    dataset.categorical_columns = []
    dataset.numeric_summary = numeric_summary
    dataset.kpis = kpis
    dataset.executive_summary = executive_summary
    dataset.trend_series = trend_series
    dataset.region_series = region_series
    # Data changed, so any cached AI narrative from before is stale — clear
    # it rather than let the Forecast page keep showing an outdated insight.
    dataset.forecast_insight_cache = {}
    dataset.size_bytes = 0
    # Touch created_at so this becomes the "latest dataset" again whenever
    # entries change, matching how a fresh file upload would take over.
    dataset.created_at = datetime.utcnow()

    db.add(dataset)
    db.flush()

    db.query(models.Insight).filter(models.Insight.dataset_id == dataset.id).delete()
    for r in risks:
        db.add(
            models.Insight(
                organization_id=org_id,
                dataset_id=dataset.id,
                type="risk",
                severity=r["severity"],
                text=r["text"],
            )
        )
    for rec in recommendations:
        db.add(
            models.Insight(
                organization_id=org_id,
                dataset_id=dataset.id,
                type="recommendation",
                severity="Medium",
                text=rec,
            )
        )

    # Same chatbot-sync machinery file uploads get — a chat session tied to
    # this dataset, so questions asked about it flow into the Forecast page
    # the same way they do for uploaded documents.
    has_session = db.query(models.ChatSession).filter(models.ChatSession.dataset_id == dataset.id).first()
    if not has_session:
        db.add(models.ChatSession(organization_id=org_id, dataset_id=dataset.id, title="Daily Shop Log"))

    db.commit()
    db.refresh(dataset)
    return dataset


def list_day_summaries(db: Session, org_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    entries = (
        db.query(models.DailyEntry)
        .filter(models.DailyEntry.organization_id == org_id)
        .all()
    )
    by_day: Dict[Any, Dict[str, float]] = defaultdict(lambda: {"sales": 0.0, "purchases": 0.0, "count": 0})
    for e in entries:
        b = by_day[e.entry_date]
        if e.entry_type == "sale":
            b["sales"] += e.amount
        else:
            b["purchases"] += e.amount
        b["count"] += 1

    days = sorted(by_day.keys(), reverse=True)[:limit]
    return [
        {
            "entry_date": d,
            "total_sales": round(by_day[d]["sales"], 2),
            "total_purchases": round(by_day[d]["purchases"], 2),
            "net_profit": round(by_day[d]["sales"] - by_day[d]["purchases"], 2),
            "entry_count": int(by_day[d]["count"]),
        }
        for d in days
    ]


def compute_stock_levels(db: Session, org_id: str, low_stock_threshold: float = 5) -> List[Dict[str, Any]]:
    """Running stock on hand per item = everything purchased minus everything
    sold, across all logged days. Only meaningful for shops that both buy in
    and resell physical stock — if an item was only ever sold (e.g. a
    service line), it'll show a negative "on hand", which is a reasonable
    signal that purchases for it were never logged, not a bug."""
    entries = db.query(models.DailyEntry).filter(models.DailyEntry.organization_id == org_id).all()
    agg: Dict[str, Dict[str, Any]] = {}
    for e in entries:
        row = agg.setdefault(
            e.item_name, {"item_name": e.item_name, "category": e.category or "", "purchased": 0.0, "sold": 0.0}
        )
        if e.entry_type == "purchase":
            row["purchased"] += e.quantity
        else:
            row["sold"] += e.quantity
        if e.category:
            row["category"] = e.category

    result = []
    for row in agg.values():
        on_hand = round(row["purchased"] - row["sold"], 2)
        result.append(
            {
                "item_name": row["item_name"],
                "category": row["category"],
                "quantity_purchased": round(row["purchased"], 2),
                "quantity_sold": round(row["sold"], 2),
                "quantity_on_hand": on_hand,
                "low_stock": on_hand <= low_stock_threshold,
            }
        )
    result.sort(key=lambda r: r["quantity_on_hand"])
    return result
