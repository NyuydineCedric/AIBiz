"""Turns a parsed dataset's numeric summary into KPIs, risks, recommendations,
an executive summary, and simple chart-ready series. Uses keyword heuristics
to guess which columns represent revenue, cost, customers, etc. so it works on
arbitrary business spreadsheets without a fixed schema.
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

REVENUE_KEYWORDS = ["revenue", "sales", "income"]
COST_KEYWORDS = ["cost", "expense", "spend", "purchase"]
CUSTOMER_KEYWORDS = ["customer", "retention", "churn"]
REGION_KEYWORDS = ["region", "branch", "location", "area", "store"]

# Common geographic segment names used in real financial statements (e.g.
# Apple's 10-Q reports revenue by "Americas", "Europe", "Greater China", etc.
# rather than under a literal "region" column), used to detect region-like
# line items extracted from PDFs where there's no categorical column at all.
KNOWN_REGION_NAMES = [
    "americas", "north america", "south america", "latin america",
    "europe", "emea", "greater china", "china", "japan",
    "asia pacific", "asia-pacific", "apac", "rest of asia pacific",
    "middle east", "africa", "united states", "canada", "uk", "united kingdom",
]


def _match_column(columns: List[str], keywords: List[str]) -> str | None:
    for col in columns:
        low = col.lower()
        if any(kw in low for kw in keywords):
            return col
    return None


def week_of_month(d: date) -> int:
    """1-based week number within d's own month (day 1-7 -> Week 1, 8-14 ->
    Week 2, etc.) — resets every month rather than counting continuously,
    matching how a shop owner naturally thinks about "week 2 of August"."""
    return ((d.day - 1) // 7) + 1


def day_label(d: date) -> str:
    """e.g. "Aug Wk1 Mon" — used anywhere a chart shows daily-log data, so
    points read as real calendar days instead of anonymous "Day N" ticks.
    The month prefix disambiguates "Week 1" across different months."""
    return f"{d.strftime('%b')} Wk{week_of_month(d)} {d.strftime('%a')}"


def continue_day_labels(period_dates: Optional[List[str]], count: int) -> List[str]:
    """Extends a real date sequence (ISO strings, e.g. from a metric's
    period_dates) forward by `count` more calendar days, formatted the same
    way as day_label — used for the forecast (projected) segment of a chart
    so it reads as real upcoming days rather than reverting to "Day N"."""
    if not period_dates:
        return []
    try:
        last = date.fromisoformat(period_dates[-1])
    except (ValueError, TypeError):
        return []
    return [day_label(last + timedelta(days=i)) for i in range(1, count + 1)]


def detect_metric_column(question: str, numeric_summary: Dict[str, Dict[str, float]]) -> str | None:
    """Best-effort match of a natural-language question to one of the
    dataset's numeric columns, so the Forecast page can chart whatever
    metric the user actually asked about (cost, a named line item, etc.)
    instead of always revenue. Returns None if nothing matches, in which
    case callers should keep showing the default revenue trend."""
    if not numeric_summary:
        return None
    q = question.lower()
    columns = list(numeric_summary.keys())

    # 1) The column name itself appears in the question (longest names first,
    # so a specific line item like "Cost of Goods Sold" wins over a shorter
    # coincidental match).
    for col in sorted(columns, key=len, reverse=True):
        if col.lower() in q:
            return col

    # 2) Fall back to the same keyword groups used elsewhere in the app.
    for keywords in (REVENUE_KEYWORDS, COST_KEYWORDS, CUSTOMER_KEYWORDS):
        if any(kw in q for kw in keywords):
            col = _match_column(columns, keywords)
            if col:
                return col

    return None


def detect_metric_columns(
    question: str, numeric_summary: Dict[str, Dict[str, float]], max_columns: int = 4
) -> List[str]:
    """Like detect_metric_column, but returns every distinct column the
    question appears to name — e.g. "compare Rice and Sugar" matches both —
    so a chart can plot several metrics/products at once instead of only
    the single best match. Falls back to one keyword-group match (same
    logic as detect_metric_column) when no column is literally named, so a
    single-metric question still returns exactly one column as before."""
    if not numeric_summary:
        return []
    q = question.lower()
    columns = list(numeric_summary.keys())

    # Every column name literally present in the question, longest names
    # first so a specific line item wins over a shorter coincidental
    # substring, and so a shorter name that's itself a substring of an
    # already-matched longer one (e.g. "Sales" inside "Total Sales") isn't
    # double-counted as a separate match.
    found: List[str] = []
    remaining = q
    for col in sorted(columns, key=len, reverse=True):
        low = col.lower()
        if low and low in remaining:
            found.append(col)
            remaining = remaining.replace(low, " ")
        if len(found) >= max_columns:
            break

    if found:
        # Re-sort into the order they actually appear in the question (the
        # longest-first pass above is only for correct matching), so a chart
        # legend for "compare Rice and Sugar" lists Rice before Sugar.
        found.sort(key=lambda col: q.find(col.lower()))
        return found

    for keywords in (REVENUE_KEYWORDS, COST_KEYWORDS, CUSTOMER_KEYWORDS):
        if any(kw in q for kw in keywords):
            col = _match_column(columns, keywords)
            if col:
                return [col]

    return []


def current_value(stats: Dict[str, float]) -> float:
    """The "right now" figure for a line item, for display anywhere the UI
    says "currently at X" (KPI cards, region breakdowns, chatbot answers).

    For PDF/spreadsheet line items and daily-log metrics alike, we capture
    the actual per-period values (raw_values), e.g. one figure per reporting
    period or per logged day — in that case "current" should be the most
    recent period's real figure, not a sum across every period (summing a
    year of daily "Total Sales" produces a number that was never true on any
    single day, and is flatly wrong for a stock-like metric such as
    "Customer Count" or "Quantity on Hand"). raw_values is only ever
    populated for genuinely period-like data (data_parser caps tabular
    uploads at 200 rows before setting it at all), so no length cap is
    needed here — falls back to the old sum/mean heuristic only when no
    per-period values were captured at all, where "sum" over many
    transaction rows is a meaningful total.
    """
    raw_values = stats.get("raw_values")
    if raw_values:
        # A trailing 0 on a per-item daily-log series usually just means
        # "nothing logged for this specific item on those most-recent days"
        # (a shop rarely sells every product every day) rather than a
        # genuine crash to zero — so walk back to the most recent day this
        # line item actually had a real figure. Only report a literal 0
        # when the entire history is 0.
        for v in reversed(raw_values):
            if v:
                return v
        return raw_values[-1]
    return stats["sum"] if stats.get("sum", 0) >= stats.get("mean", 0) else stats.get("mean", 0.0)


def build_kpis(numeric_summary: Dict[str, Dict[str, float]]) -> List[Dict[str, str]]:
    if not numeric_summary:
        return []

    columns = list(numeric_summary.keys())
    picked: List[str] = []
    for keywords in (REVENUE_KEYWORDS, COST_KEYWORDS, CUSTOMER_KEYWORDS):
        col = _match_column(columns, keywords)
        if col and col not in picked:
            picked.append(col)

    for col in columns:
        if len(picked) >= 4:
            break
        if col not in picked:
            picked.append(col)

    kpis = []
    for col in picked[:4]:
        stats = numeric_summary[col]
        trend = stats["trend_pct"]
        is_cost_like = any(kw in col.lower() for kw in COST_KEYWORDS)
        if trend > 0:
            trend_label = "warn" if is_cost_like else "up"
        elif trend < 0:
            trend_label = "up" if is_cost_like else "down"
        else:
            trend_label = "warn"

        value = current_value(stats)
        kpis.append(
            {
                "label": col,
                "value": f"{value:,.2f}",
                "change": f"{'+' if trend >= 0 else ''}{trend}% vs. period start",
                "trend": trend_label,
            }
        )
    return kpis


def detect_risks(numeric_summary: Dict[str, Dict[str, float]]) -> List[Dict[str, str]]:
    risks: List[Dict[str, str]] = []
    for col, stats in numeric_summary.items():
        trend = stats["trend_pct"]
        low = col.lower()
        is_cost_like = any(kw in low for kw in COST_KEYWORDS)
        is_revenue_like = any(kw in low for kw in REVENUE_KEYWORDS)
        is_customer_like = any(kw in low for kw in CUSTOMER_KEYWORDS)

        if is_cost_like and trend > 10:
            risks.append(
                {
                    "severity": "High" if trend > 20 else "Medium",
                    "text": f"{col} rose {trend}% across the uploaded period — review spend drivers.",
                }
            )
        elif is_revenue_like and trend < -5:
            risks.append(
                {
                    "severity": "High" if trend < -15 else "Medium",
                    "text": f"{col} declined {abs(trend)}% across the uploaded period.",
                }
            )
        elif is_customer_like and trend < -5:
            risks.append(
                {
                    "severity": "Medium",
                    "text": f"{col} dropped {abs(trend)}% — possible early churn signal.",
                }
            )
        elif not is_cost_like and not is_revenue_like and not is_customer_like and abs(trend) > 25:
            risks.append(
                {
                    "severity": "Medium",
                    "text": f"{col} moved {trend}% across the uploaded period — worth a closer look.",
                }
            )
    return risks[:5]


def generate_recommendations(risks: List[Dict[str, str]]) -> List[str]:
    recs: List[str] = []
    for risk in risks:
        text = risk["text"].lower()
        if "rose" in text and "review spend" in text:
            recs.append(f"Audit and trim spend on the category driving: {risk['text']}")
        elif "declined" in text:
            recs.append(f"Investigate the drivers behind: {risk['text']} and consider a targeted promotion.")
        elif "churn" in text:
            recs.append("Launch a win-back campaign for customers showing early churn signals.")
        else:
            recs.append(f"Monitor closely next period: {risk['text']}")

    if not recs:
        recs.append("No significant risks detected in this dataset — maintain current strategy and re-check next period.")

    seen = set()
    unique_recs = []
    for r in recs:
        if r not in seen:
            unique_recs.append(r)
            seen.add(r)
    return unique_recs[:5]


def build_executive_summary(kpis: List[Dict[str, str]], risks: List[Dict[str, str]]) -> str:
    if not kpis:
        return "Log a day of sales/purchases, or upload a business report (CSV, Excel, or PDF), to generate an AI executive summary."

    lead = kpis[0]
    parts = [f"{lead['label']} is at {lead['value']} ({lead['change']})."]

    if len(kpis) > 1:
        second = kpis[1]
        parts.append(f"{second['label']} shows {second['change']}.")

    if risks:
        high = [r for r in risks if r["severity"] == "High"]
        if high:
            parts.append(f"Highest-priority risk: {high[0]['text']}")
        else:
            parts.append(f"Notable trend: {risks[0]['text']}")
    else:
        parts.append("No significant risks were detected in the uploaded data.")

    return " ".join(parts)


def _build_revenue_trend_from_summary(numeric_summary: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    """PDF fallback: when there's no dataframe (PDF uploads), use the raw
    per-period values captured for the best-matching revenue line item
    (e.g. 'Total net sales' with its Q-current/Q-prior/YTD-current/YTD-prior
    values) instead of returning an empty series."""
    columns = list(numeric_summary.keys())

    # Prefer a "total" revenue-style row if one exists, since individual
    # sub-lines (e.g. "Products", "Services") are less representative of
    # overall revenue trend than a combined total line.
    total_candidates = [c for c in columns if "total" in c.lower() and any(kw in c.lower() for kw in REVENUE_KEYWORDS)]
    target_col = total_candidates[0] if total_candidates else _match_column(columns, REVENUE_KEYWORDS)
    if not target_col:
        target_col = columns[0] if columns else None
    if not target_col:
        return {"labels": [], "values": []}

    raw_values = numeric_summary[target_col].get("raw_values")
    # Only bail if there's truly no data — a single logged day/period is
    # still real data worth showing (as a single point, with no forecast
    # line yet), not an error state. Requiring 2+ points here meant one day
    # of daily-log entries fell through to a "no revenue column found"
    # message that had nothing to do with the actual problem.
    if not raw_values:
        return {"labels": [], "values": []}

    labels = [f"Day {i + 1}" for i in range(len(raw_values))]
    return {"labels": labels, "values": raw_values}


def build_revenue_trend_series(df: pd.DataFrame | None, numeric_summary: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    if not numeric_summary:
        return {"labels": [], "values": []}

    if df is None:
        return _build_revenue_trend_from_summary(numeric_summary)

    columns = list(numeric_summary.keys())
    target_col = _match_column(columns, REVENUE_KEYWORDS) or (columns[0] if columns else None)
    if not target_col:
        return {"labels": [], "values": []}

    series = df[target_col].dropna().reset_index(drop=True)
    if series.empty:
        return {"labels": [], "values": []}

    buckets = min(6, max(1, len(series)))
    chunks = [pd.Series(c) for c in np.array_split(series.to_numpy(), buckets)]

    labels = [f"Day {i + 1}" for i in range(len(chunks))]
    values = [round(float(c.mean()), 2) if len(c) else 0.0 for c in chunks]
    return {"labels": labels, "values": values}


def _build_region_breakdown_from_summary(numeric_summary: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    """PDF fallback: financial statements often break out revenue by named
    geographic segments (e.g. 'Americas', 'Europe', 'Greater China') as their
    own line items rather than under a literal 'region' column. Detect those
    directly from the extracted line-item labels."""
    matches = []
    for label, stats in numeric_summary.items():
        low = label.lower().strip()
        if any(low == name or low.startswith(name) for name in KNOWN_REGION_NAMES):
            matches.append((label, current_value(stats)))

    if not matches:
        return {"labels": [], "values": []}

    matches.sort(key=lambda x: x[1], reverse=True)
    matches = matches[:6]
    return {
        "labels": [m[0] for m in matches],
        "values": [round(float(m[1]), 2) for m in matches],
    }


def build_region_breakdown(df: pd.DataFrame | None, categorical_columns: List[str], numeric_summary: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    if df is None:
        return _build_region_breakdown_from_summary(numeric_summary)

    region_col = _match_column(categorical_columns, REGION_KEYWORDS)
    if not region_col:
        # No literal "region"/"branch"/etc. category column — common in
        # "wide" spreadsheets that break regions out as their own columns
        # (e.g. "North America", "Europe", "Asia Pacific") rather than a
        # single category column + amount column. Same fallback the PDF
        # path uses: match known geography names directly against the
        # dataset's column names.
        return _build_region_breakdown_from_summary(numeric_summary)

    columns = list(numeric_summary.keys())
    amount_col = _match_column(columns, REVENUE_KEYWORDS) or (columns[0] if columns else None)
    if not amount_col:
        return {"labels": [], "values": []}

    grouped = df.groupby(region_col)[amount_col].sum().sort_values(ascending=False).head(6)
    return {
        "labels": [str(x) for x in grouped.index.tolist()],
        "values": [round(float(v), 2) for v in grouped.values.tolist()],
    }