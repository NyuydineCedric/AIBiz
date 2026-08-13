"""Parses uploaded CSV/Excel/PDF files into a structured, JSON-serializable summary
that the insight engine, forecast engine, and AI chat service can all consume.
"""
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from pypdf import PdfReader

try:
    import pdfplumber
except ImportError:  # pdfplumber is optional at import time; parse_pdf_file checks again
    pdfplumber = None


SUPPORTED_TABULAR = {".csv", ".xlsx", ".xls"}
SUPPORTED_PDF = {".pdf"}

# Matches lines like:
#   "Total Revenue         4,210,500.00"
#   "Net Income (Loss)     (120,340)"
#   "Operating Expenses    $3,102,000"
# Captures a label (leading text, letters/spaces/parens) and one or more
# trailing numeric tokens (handles multi-period statements with 2+ columns).
_LINE_ITEM_RE = re.compile(
    r"^([A-Za-z][A-Za-z &/\-,()]{2,60}?)\s{2,}((?:\(?\$?-?[\d,]+\.?\d*\)?\s*){1,4})$"
)
_NUMBER_TOKEN_RE = re.compile(r"\(?\$?-?[\d,]+\.?\d*\)?")


def detect_file_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".csv":
        return "CSV"
    if ext in (".xlsx", ".xls"):
        return "Excel"
    if ext == ".pdf":
        return "PDF"
    return "Unknown"


def _clean_number(token: str) -> Optional[float]:
    """Convert a token like '(120,340)', '$4,210,500.00', '-3,102,000' to a float.
    Parenthesized numbers are treated as negative (standard accounting notation).
    Returns None if the token can't be parsed.
    """
    token = token.strip()
    if not token:
        return None
    negative = token.startswith("(") and token.endswith(")")
    token = token.strip("()")
    token = token.replace("$", "").replace(",", "").strip()
    if token in ("", "-", "."):
        return None
    try:
        value = float(token)
    except ValueError:
        return None
    return -value if negative else value


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


def _extract_pdf_tables(path: str) -> List[pd.DataFrame]:
    """Use pdfplumber to pull out any real tables embedded in the PDF
    (common in financial statements with actual table structures)."""
    if pdfplumber is None:
        return []

    dataframes: List[pd.DataFrame] = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                for table in page.extract_tables():
                    if not table or len(table) < 2:
                        continue
                    header, *rows = table
                    header = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(header)]
                    df = pd.DataFrame(rows, columns=header)
                    dataframes.append(df)
    except Exception:
        return []
    return dataframes


def _coerce_table_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Attempt to convert object columns in an extracted PDF table to numeric,
    handling accounting notation ($, commas, parens for negatives)."""
    out = df.copy()
    for col in out.columns:
        if out[col].dtype == object:
            converted = out[col].apply(
                lambda v: _clean_number(str(v)) if pd.notna(v) else None
            )
            # Only replace the column if a meaningful share of values converted
            non_null = converted.notna().sum()
            if non_null > 0 and non_null >= max(1, len(converted) // 2):
                out[col] = converted
    return out


def _extract_line_items_from_text(text: str) -> Dict[str, Dict[str, float]]:
    """Fallback for PDFs with no extractable table structure: scan line-by-line
    for 'Label   Number [Number ...]' patterns typical of financial statement
    exports (e.g. 'Total Revenue    4,210,500.00  3,890,200.00')."""
    summary: Dict[str, Dict[str, float]] = {}

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = _LINE_ITEM_RE.match(raw_line.rstrip())
        if not match:
            continue

        label = match.group(1).strip()
        number_tokens = _NUMBER_TOKEN_RE.findall(match.group(2))
        values = [v for v in (_clean_number(t) for t in number_tokens) if v is not None]
        if not values:
            continue

        # Normalize label to a stable key (collapse whitespace, title case)
        key = re.sub(r"\s+", " ", label).strip()
        if not key or key in summary:
            continue

        first_val = values[0]
        last_val = values[-1]
        if first_val == 0:
            trend_pct = 0.0
        else:
            trend_pct = round(((last_val - first_val) / abs(first_val)) * 100, 2)

        summary[key] = {
            "mean": round(sum(values) / len(values), 2),
            "sum": round(sum(values), 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "trend_pct": trend_pct,
        }

    return summary


def parse_pdf_file(path: str, max_chars: int = 4000) -> Dict[str, Any]:
    reader = PdfReader(path)
    text_parts = []
    for page in reader.pages:
        text_parts.append(page.extract_text() or "")
    full_text = "\n".join(text_parts).strip()

    numeric_summary: Dict[str, Dict[str, float]] = {}
    columns: List[str] = []
    preview: List[Dict[str, str]] = []
    combined_df: Optional[pd.DataFrame] = None

    # 1) Try real table extraction first (best case: clean tabular financial statements)
    tables = _extract_pdf_tables(path)
    numeric_tables = []
    for table in tables:
        coerced = _coerce_table_numeric(table)
        numeric_cols = coerced.select_dtypes(include="number")
        if not numeric_cols.empty:
            numeric_tables.append(coerced)

    if numeric_tables:
        combined_df = pd.concat(numeric_tables, ignore_index=True, sort=False)
        numeric_summary = _numeric_column_summary(combined_df)
        columns = list(combined_df.columns)
        preview = combined_df.head(5).fillna("").astype(str).to_dict(orient="records")

    # 2) Fallback: regex line-item scan over raw text (handles narrative-style
    # statements where pdfplumber can't detect table borders/structure)
    if not numeric_summary and full_text:
        numeric_summary = _extract_line_items_from_text(full_text)
        columns = list(numeric_summary.keys())

    return {
        "row_count": len(reader.pages),
        "column_count": len(columns),
        "columns": columns,
        "categorical_columns": [],
        "numeric_summary": numeric_summary,
        "preview": preview,
        "text_excerpt": full_text[:max_chars],
        "dataframe": combined_df,
    }


def parse_file(path: str, filename: Optional[str] = None) -> Dict[str, Any]:
    filename = filename or os.path.basename(path)
    ext = os.path.splitext(filename)[1].lower()

    if ext in SUPPORTED_TABULAR:
        return parse_tabular_file(path)
    if ext in SUPPORTED_PDF:
        return parse_pdf_file(path)

    raise ValueError(f"Unsupported file type: {ext}")