"""Parses uploaded CSV/Excel/PDF files into a structured, JSON-serializable summary
that the insight engine, forecast engine, and AI chat service can all consume.
"""
import os
from typing import Any, Dict, Optional, Tuple

import pandas as pd
from pypdf import PdfReader


SUPPORTED_TABULAR = {".csv", ".xlsx", ".xls"}
SUPPORTED_PDF = {".pdf"}


def detect_file_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".csv":
        return "CSV"
    if ext in (".xlsx", ".xls"):
        return "Excel"
    if ext == ".pdf":
        return "PDF"
    return "Unknown"


def _numeric_column_summary(df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    """For every numeric column, compute mean/sum/min/max and a simple trend:
    percent change between the average of the first third of rows and the
    average of the last third of rows (a lightweight stand-in for a real
    time-series trend when no reliable date column is present).
    """
    summary: Dict[str, Dict[str, float]] = {}
    numeric_df = df.select_dtypes(include="number")
    n = len(numeric_df)
    if n == 0:
        return summary

    third = max(1, n // 3)
    first_chunk = numeric_df.iloc[:third]
    last_chunk = numeric_df.iloc[-third:]

    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if series.empty:
            continue
        first_mean = first_chunk[col].dropna().mean()
        last_mean = last_chunk[col].dropna().mean()
        if pd.isna(first_mean) or first_mean == 0 or pd.isna(last_mean):
            trend_pct = 0.0
        else:
            trend_pct = round(float((last_mean - first_mean) / abs(first_mean)) * 100, 2)

        summary[col] = {
            "mean": round(float(series.mean()), 2),
            "sum": round(float(series.sum()), 2),
            "min": round(float(series.min()), 2),
            "max": round(float(series.max()), 2),
            "trend_pct": trend_pct,
        }
    return summary


def _read_tabular(path: str, ext: str) -> pd.DataFrame:
    if ext == ".csv":
        return pd.read_csv(path)
    return pd.read_excel(path)


def parse_tabular_file(path: str) -> Dict[str, Any]:
    ext = os.path.splitext(path)[1].lower()
    df = _read_tabular(path, ext)
    df.columns = [str(c).strip() for c in df.columns]

    categorical_cols = [
        c for c in df.select_dtypes(include=["object", "category"]).columns
    ]

    return {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "columns": list(df.columns),
        "categorical_columns": categorical_cols,
        "numeric_summary": _numeric_column_summary(df),
        "preview": df.head(5).fillna("").astype(str).to_dict(orient="records"),
        "dataframe": df,  # kept in-memory only for the current request; not persisted as-is
    }


def parse_pdf_file(path: str, max_chars: int = 4000) -> Dict[str, Any]:
    reader = PdfReader(path)
    text_parts = []
    for page in reader.pages:
        text_parts.append(page.extract_text() or "")
    full_text = "\n".join(text_parts).strip()

    return {
        "row_count": len(reader.pages),
        "column_count": 0,
        "columns": [],
        "categorical_columns": [],
        "numeric_summary": {},
        "preview": [],
        "text_excerpt": full_text[:max_chars],
        "dataframe": None,
    }


def parse_file(path: str, filename: Optional[str] = None) -> Dict[str, Any]:
    filename = filename or os.path.basename(path)
    ext = os.path.splitext(filename)[1].lower()

    if ext in SUPPORTED_TABULAR:
        return parse_tabular_file(path)
    if ext in SUPPORTED_PDF:
        return parse_pdf_file(path)

    raise ValueError(f"Unsupported file type: {ext}")
