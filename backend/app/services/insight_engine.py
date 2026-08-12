"""Turns a parsed dataset's numeric summary into KPIs, risks, recommendations,
an executive summary, and simple chart-ready series. Uses keyword heuristics
to guess which columns represent revenue, cost, customers, etc. so it works on
arbitrary business spreadsheets without a fixed schema.
"""
from typing import Any, Dict, List

import numpy as np
import pandas as pd

REVENUE_KEYWORDS = ["revenue", "sales", "income"]
COST_KEYWORDS = ["cost", "expense", "spend"]
CUSTOMER_KEYWORDS = ["customer", "retention", "churn"]
REGION_KEYWORDS = ["region", "branch", "location", "area", "store"]


def _match_column(columns: List[str], keywords: List[str]) -> str | None:
    for col in columns:
        low = col.lower()
        if any(kw in low for kw in keywords):
            return col
    return None


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

        value = stats["sum"] if stats["sum"] >= stats["mean"] else stats["mean"]
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
        return "Upload a business report (CSV, Excel, or PDF) to generate an AI executive summary."

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


def build_revenue_trend_series(df: pd.DataFrame | None, numeric_summary: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    if df is None or not numeric_summary:
        return {"labels": [], "values": []}

    columns = list(numeric_summary.keys())
    target_col = _match_column(columns, REVENUE_KEYWORDS) or (columns[0] if columns else None)
    if not target_col:
        return {"labels": [], "values": []}

    series = df[target_col].dropna().reset_index(drop=True)
    if series.empty:
        return {"labels": [], "values": []}

    buckets = min(6, max(1, len(series)))
    chunks = [pd.Series(c) for c in np.array_split(series.to_numpy(), buckets)]

    labels = [f"P{i + 1}" for i in range(len(chunks))]
    values = [round(float(c.mean()), 2) if len(c) else 0.0 for c in chunks]
    return {"labels": labels, "values": values}


def build_region_breakdown(df: pd.DataFrame | None, categorical_columns: List[str], numeric_summary: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    if df is None:
        return {"labels": [], "values": []}

    region_col = _match_column(categorical_columns, REGION_KEYWORDS)
    if not region_col:
        return {"labels": [], "values": []}

    columns = list(numeric_summary.keys())
    amount_col = _match_column(columns, REVENUE_KEYWORDS) or (columns[0] if columns else None)
    if not amount_col:
        return {"labels": [], "values": []}

    grouped = df.groupby(region_col)[amount_col].sum().sort_values(ascending=False).head(6)
    return {
        "labels": [str(x) for x in grouped.index.tolist()],
        "values": [round(float(v), 2) for v in grouped.values.tolist()],
    }
