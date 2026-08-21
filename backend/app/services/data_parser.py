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

        if len(series) <= 36:
            # Small, period-like table (e.g. one row per month) — use the
            # actual first and last values, same method the PDF parser uses
            # for its line items, so the same underlying data produces the
            # same trend % regardless of whether it was uploaded as a PDF
            # or a spreadsheet.
            first_val = float(series.iloc[0])
            last_val = float(series.iloc[-1])
            if first_val == 0:
                trend_pct = 0.0
            else:
                trend_pct = round(((last_val - first_val) / abs(first_val)) * 100, 2)
        else:
            # Larger, transaction-level dataset — a single first/last row
            # would be noisy, so compare the average of the first third of
            # rows to the average of the last third instead.
            first_mean = first_chunk[col].dropna().mean()
            last_mean = last_chunk[col].dropna().mean()
            if pd.isna(first_mean) or first_mean == 0 or pd.isna(last_mean):
                trend_pct = 0.0
            else:
                trend_pct = round(float((last_mean - first_mean) / abs(first_mean)) * 100, 2)

        entry = {
            "mean": round(float(series.mean()), 2),
            "sum": round(float(series.sum()), 2),
            "min": round(float(series.min()), 2),
            "max": round(float(series.max()), 2),
            "trend_pct": trend_pct,
        }
        # Capture per-row values too (in original row order) so a "current
        # value" for this column can use the most recent row instead of a
        # sum across every row — only meaningful (and only stored) for
        # small, period-like tables (e.g. one row per month); large,
        # transaction-level datasets skip this since insight_engine only
        # ever consults it for small row counts anyway.
        if len(series) <= 200:
            entry["raw_values"] = [round(float(v), 2) for v in series.tolist()]
        summary[col] = entry
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


def _dedupe_columns(columns: List[str]) -> List[str]:
    """Ensure column names are unique so DataFrame column indexing always
    returns a Series, not a DataFrame (pdfplumber often yields duplicate or
    blank headers from merged/spanning table cells)."""
    seen: Dict[str, int] = {}
    result = []
    for col in columns:
        base = col if col else "col"
        if base not in seen:
            seen[base] = 0
            result.append(base)
        else:
            seen[base] += 1
            result.append(f"{base}_{seen[base]}")
    return result


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
                    header = [str(h).strip() if h else "" for h in header]
                    header = _dedupe_columns(header)
                    try:
                        df = pd.DataFrame(rows, columns=header)
                    except Exception:
                        continue
                    dataframes.append(df)
    except Exception as exc:  # noqa: BLE001
        print(f"[data_parser] pdfplumber table extraction failed: {exc!r}")
        return []
    return dataframes


def _coerce_table_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Attempt to convert object columns in an extracted PDF table to numeric,
    handling accounting notation ($, commas, parens for negatives)."""
    out = df.copy()
    # Guard against any remaining duplicate column names (defensive, since
    # _extract_pdf_tables already dedupes, but this keeps this function safe
    # if called with arbitrary tables elsewhere).
    if out.columns.duplicated().any():
        out.columns = _dedupe_columns([str(c) for c in out.columns])

    for col in out.columns:
        series = out[col]
        if not isinstance(series, pd.Series):
            continue
        if series.dtype == object:
            converted = series.apply(
                lambda v: _clean_number(str(v)) if pd.notna(v) else None
            )
            non_null = converted.notna().sum()
            if non_null > 0 and non_null >= max(1, len(converted) // 2):
                out[col] = converted
    return out


_NUM_TOKEN_ONLY_RE = re.compile(r"^\(?-?\$?[\d,]+\.?\d*\)?$|^[—–\-]+$|^\((?:\d{1,2}|[a-z])\)$", re.IGNORECASE)
_FOOTNOTE_TOKEN_RE = re.compile(r"^\((?:\d{1,2}|[a-z])\)$", re.IGNORECASE)
_DASH_ONLY_RE = re.compile(r"^[—–]+$")
_DATE_LABEL_RE = re.compile(r"^(january|february|march|april|may|june|july|august|september|october|november|december)\b", re.IGNORECASE)

# A bare 4-digit token like "2025" or "2026." with no comma, decimal, $, or
# parens is almost always a calendar year mentioned in prose (e.g. "...early
# fiscal 2026.") rather than a real financial figure — real financial values
# in that range are virtually always comma-formatted ("2,025") or otherwise
# marked. Used to strip stray year mentions that would otherwise get parsed
# as trailing numeric line-item values from wrapped narrative text.
_BARE_YEAR_RE = re.compile(r"^(19|20)\d{2}\.?$")


def _extract_rows_by_position(path: str) -> List[str]:
    """Reconstruct logical table rows using each word's vertical position on
    the page. This recovers row structure that pypdf's plain text extraction
    often destroys (it can merge an entire multi-column table into one long
    run-on line with no row breaks), and works even when the PDF has no
    visible gridlines for pdfplumber's extract_tables() to detect."""
    if pdfplumber is None:
        return []

    rows: List[str] = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                words = page.extract_words(keep_blank_chars=False)
                if not words:
                    continue
                words.sort(key=lambda w: (round(w["top"]), w["x0"]))

                current_top: Optional[int] = None
                current_row: List[dict] = []
                for w in words:
                    top = round(w["top"])
                    if current_top is None or abs(top - current_top) <= 3:
                        current_row.append(w)
                        current_top = top if current_top is None else current_top
                    else:
                        current_row.sort(key=lambda x: x["x0"])
                        rows.append(" ".join(x["text"] for x in current_row))
                        current_row = [w]
                        current_top = top
                if current_row:
                    current_row.sort(key=lambda x: x["x0"])
                    rows.append(" ".join(x["text"] for x in current_row))
    except Exception as exc:  # noqa: BLE001
        print(f"[data_parser] pdfplumber word-position extraction failed: {exc!r}")
        return []
    return rows


def _extract_line_items_from_rows(rows: List[str]) -> Dict[str, Dict[str, float]]:
    """Parse reconstructed rows of the form 'Label word(s)  num1  num2  num3'
    into KPI-shaped entries, by scanning each row from the end for trailing
    numeric tokens (handles accounting notation and multi-period statements
    with 2-4 value columns)."""
    summary: Dict[str, Dict[str, float]] = {}

    for row in rows:
        cleaned = row.replace("$", " ")
        tokens = cleaned.split()
        if len(tokens) < 2:
            continue

        num_tokens: List[str] = []
        i = len(tokens) - 1
        while i >= 0 and _NUM_TOKEN_ONLY_RE.match(tokens[i]):
            num_tokens.insert(0, tokens[i])
            i -= 1
        label_tokens = tokens[: i + 1]

        if not label_tokens or not num_tokens:
            continue

        label = " ".join(label_tokens).strip(" :")
        if not label or not re.search(r"[A-Za-z]", label):
            continue

        # Skip date/column-header rows like "September 28, 2024 September 30, ..."
        # which aren't real line items, just table headers.
        if _DATE_LABEL_RE.match(label):
            continue

        # Drop a leading footnote marker like "(1)" that landed at the start
        # of the numeric block (right after the label) rather than being a
        # real value, but only if there's other real numeric data present.
        if len(num_tokens) > 1 and _FOOTNOTE_TOKEN_RE.match(num_tokens[0]):
            num_tokens = num_tokens[1:]

        # Drop any other footnote markers (e.g. "(b)", "(c)") that appear
        # interspersed among the real values, common in reconciliation
        # tables with per-column footnote references.
        non_footnote = [t for t in num_tokens if not _FOOTNOTE_TOKEN_RE.match(t)]
        if non_footnote:
            num_tokens = non_footnote

        # Em-dashes represent "no value" / zero in accounting statements, not
        # a parse failure — drop them rather than treating the token as data.
        num_tokens = [t for t in num_tokens if not _DASH_ONLY_RE.match(t)]
        if not num_tokens:
            continue

        # Drop stray calendar-year mentions picked up from wrapped narrative
        # text (e.g. "...targeted for early fiscal 2026.") so they aren't
        # mistaken for real financial figures.
        num_tokens = [t for t in num_tokens if not _BARE_YEAR_RE.match(t)]
        if not num_tokens:
            continue

        values = [v for v in (_clean_number(t) for t in num_tokens) if v is not None]
        if not values:
            continue

        key = re.sub(r"\s+", " ", label).strip()
        if not key or key in summary:
            continue

        first_val, last_val = values[0], values[-1]
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
            "raw_values": [round(v, 2) for v in values],
        }

    return summary


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
        number_tokens = [t for t in _NUMBER_TOKEN_RE.findall(match.group(2)) if not _BARE_YEAR_RE.match(t)]
        if not number_tokens:
            continue
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
            "raw_values": [round(v, 2) for v in values],
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
        try:
            coerced = _coerce_table_numeric(table)
        except Exception as exc:  # noqa: BLE001
            print(f"[data_parser] Skipping one extracted table due to error: {exc!r}")
            continue
        numeric_cols = coerced.select_dtypes(include="number")
        if not numeric_cols.empty:
            numeric_tables.append(coerced)

    if numeric_tables:
        combined_df = pd.concat(numeric_tables, ignore_index=True, sort=False)
        numeric_summary = _numeric_column_summary(combined_df)
        columns = list(combined_df.columns)
        preview = combined_df.head(5).fillna("").astype(str).to_dict(orient="records")

    # 2) Fallback: reconstruct rows from word positions on the page (handles
    # PDFs with no visible table gridlines, and financial statements where
    # pypdf's plain text extraction merges the whole table into one run-on
    # line with no row breaks).
    if not numeric_summary:
        rows = _extract_rows_by_position(path)
        numeric_summary = _extract_line_items_from_rows(rows)
        columns = list(numeric_summary.keys())

    # 3) Last resort: regex line-item scan over pypdf's flattened text (works
    # when the PDF genuinely has one item per line, e.g. simple exports).
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