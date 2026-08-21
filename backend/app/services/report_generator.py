"""Generates downloadable PDF and Excel reports from a dashboard summary
(KPIs, executive summary, risks, recommendations, forecast) using reportlab
and openpyxl. Content is tailored per report_type — a "risk" report leads
with risk detail, a "forecast" report includes actual/projected numbers,
a "performance" report is KPI-focused, and "summary" is the general-purpose
default — rather than every type rendering the exact same generic page
under a different title.
"""
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

# Metrics like "Customer Count" or "Retention Rate" aren't monetary amounts —
# skip the currency suffix for those. Matches the same heuristic used on the
# frontend (isCurrencyMetric in Forecast.tsx) so a report and the on-screen
# chart never disagree about what's money and what isn't.
_NON_CURRENCY_KEYWORDS = ("rate", "percent", "count", "ratio")


def _is_currency_label(label: str) -> bool:
    return not any(kw in label.lower() for kw in _NON_CURRENCY_KEYWORDS)


def _fmt_kpi_value(value: str, label: str) -> str:
    return f"{value} FCFA" if _is_currency_label(label) else value


def _fmt_amount(value: float, label: str = "") -> str:
    formatted = f"{value:,.0f}"
    return f"{formatted} FCFA" if _is_currency_label(label) else formatted


SEVERITY_ORDER = {"High": 0, "Medium": 1, "Low": 2}


def _sorted_risks(risks: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return sorted(risks, key=lambda r: SEVERITY_ORDER.get(r.get("severity", "Medium"), 1))


def generate_pdf_report(
    path: str,
    title: str,
    report_type: str,
    executive_summary: str,
    kpis: List[Dict[str, str]],
    risks: List[Dict[str, str]],
    recommendations: List[str],
    forecast: Optional[Dict[str, Any]] = None,
) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc = SimpleDocTemplate(path, pagesize=letter, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleStyle", parent=styles["Title"], fontSize=20)
    heading_style = ParagraphStyle("HeadingStyle", parent=styles["Heading2"], spaceBefore=14, spaceAfter=6)
    body_style = styles["BodyText"]

    header_table_style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]
    )

    story = [
        Paragraph(title, title_style),
        Paragraph(datetime.utcnow().strftime("Generated %B %d, %Y"), body_style),
        Spacer(1, 16),
        Paragraph("Overview", heading_style),
        Paragraph(executive_summary or "No summary available yet.", body_style),
    ]

    if report_type == "forecast":
        story.append(Paragraph("Forecast", heading_style))
        if forecast and forecast.get("forecast_values"):
            metric_label = forecast.get("metric_label", "Revenue")
            trend = forecast.get("trend", "flat")
            direction_word = {"up": "trending up", "down": "trending down"}.get(trend, "roughly flat")
            story.append(
                Paragraph(
                    f"{metric_label} is {direction_word} over the projected period.",
                    body_style,
                )
            )
            if forecast.get("ai_insight"):
                story.append(Spacer(1, 4))
                story.append(Paragraph(forecast["ai_insight"], body_style))

            story.append(Spacer(1, 8))
            f_labels = forecast.get("forecast_labels") or []
            f_values = forecast.get("forecast_values") or []
            table_data = [["Period", f"Projected {metric_label}"]] + [
                [lbl, _fmt_amount(val, metric_label)] for lbl, val in zip(f_labels, f_values)
            ]
            table = Table(table_data, hAlign="LEFT", colWidths=[3 * inch, 3.4 * inch])
            table.setStyle(header_table_style)
            story.append(table)
        else:
            story.append(
                Paragraph(
                    "Not enough historical data yet to generate a forecast. Log more days of "
                    "sales/purchases, or upload a business report, then generate this report again.",
                    body_style,
                )
            )

    elif report_type == "risk":
        story.append(Paragraph("Risk breakdown", heading_style))
        ordered = _sorted_risks(risks)
        if ordered:
            high = sum(1 for r in ordered if r.get("severity") == "High")
            med = sum(1 for r in ordered if r.get("severity") == "Medium")
            low = sum(1 for r in ordered if r.get("severity") == "Low")
            story.append(
                Paragraph(f"{high} high, {med} medium, {low} low-severity risk(s) detected.", body_style)
            )
            story.append(Spacer(1, 6))
            for r in ordered:
                story.append(Paragraph(f"<b>[{r['severity']}]</b> {r['text']}", body_style))
                story.append(Spacer(1, 4))
        else:
            story.append(Paragraph("No risks detected in the current data.", body_style))

        if recommendations:
            story.append(Paragraph("Recommended actions", heading_style))
            for rec in recommendations:
                story.append(Paragraph(f"• {rec}", body_style))
                story.append(Spacer(1, 4))

    elif report_type == "performance":
        story.append(Paragraph("Performance metrics", heading_style))
        if kpis:
            table_data = [["Metric", "Value", "Change"]] + [
                [k["label"], _fmt_kpi_value(k["value"], k["label"]), k["change"]] for k in kpis
            ]
            table = Table(table_data, hAlign="LEFT", colWidths=[2.2 * inch, 2.2 * inch, 2.2 * inch])
            table.setStyle(header_table_style)
            story.append(table)
        else:
            story.append(Paragraph("No metrics available yet.", body_style))

    else:  # "summary" (default / general-purpose)
        if kpis:
            story.append(Paragraph("Key metrics", heading_style))
            table_data = [["Metric", "Value", "Change"]] + [
                [k["label"], _fmt_kpi_value(k["value"], k["label"]), k["change"]] for k in kpis
            ]
            table = Table(table_data, hAlign="LEFT", colWidths=[2.2 * inch, 2.2 * inch, 2.2 * inch])
            table.setStyle(header_table_style)
            story.append(table)

        if risks:
            story.append(Paragraph("Detected risks", heading_style))
            for r in _sorted_risks(risks):
                story.append(Paragraph(f"[{r['severity']}] {r['text']}", body_style))
                story.append(Spacer(1, 4))

        if recommendations:
            story.append(Paragraph("AI recommendations", heading_style))
            for rec in recommendations:
                story.append(Paragraph(f"• {rec}", body_style))
                story.append(Spacer(1, 4))

    doc.build(story)
    return path


def generate_xlsx_report(
    path: str,
    title: str,
    report_type: str,
    kpis: List[Dict[str, str]],
    risks: List[Dict[str, str]],
    recommendations: List[str],
    forecast: Optional[Dict[str, Any]] = None,
) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "Report"

    header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)

    ws.append([title])
    ws["A1"].font = Font(size=14, bold=True)
    ws.append([datetime.utcnow().strftime("Generated %B %d, %Y")])
    ws.append([])

    def header_row(cells: List[str]):
        ws.append(cells)
        for cell in ws[ws.max_row]:
            cell.fill = header_fill
            cell.font = header_font

    if report_type == "forecast":
        ws.append(["Forecast"])
        ws[f"A{ws.max_row}"].font = Font(bold=True)
        if forecast and forecast.get("forecast_values"):
            metric_label = forecast.get("metric_label", "Revenue")
            ws.append([f"Metric: {metric_label}", f"Trend: {forecast.get('trend', 'flat')}"])
            if forecast.get("ai_insight"):
                ws.append([forecast["ai_insight"]])
            ws.append([])
            header_row(["Period", f"Projected {metric_label} (FCFA)"])
            for lbl, val in zip(forecast.get("forecast_labels") or [], forecast.get("forecast_values") or []):
                ws.append([lbl, round(val, 0)])
        else:
            ws.append(["Not enough historical data yet to generate a forecast."])

    elif report_type == "risk":
        ws.append(["Risk breakdown"])
        ws[f"A{ws.max_row}"].font = Font(bold=True)
        ws.append([])
        header_row(["Severity", "Risk"])
        for r in _sorted_risks(risks):
            ws.append([r["severity"], r["text"]])
        if recommendations:
            ws.append([])
            ws.append(["Recommended actions"])
            ws[f"A{ws.max_row}"].font = Font(bold=True)
            for rec in recommendations:
                ws.append([rec])

    elif report_type == "performance":
        header_row(["Metric", "Value", "Change"])
        for k in kpis:
            ws.append([k["label"], _fmt_kpi_value(k["value"], k["label"]), k["change"]])

    else:  # summary
        header_row(["Metric", "Value", "Change"])
        for k in kpis:
            ws.append([k["label"], _fmt_kpi_value(k["value"], k["label"]), k["change"]])

        ws.append([])
        ws.append(["Risks"])
        ws[f"A{ws.max_row}"].font = Font(bold=True)
        for r in _sorted_risks(risks):
            ws.append([r["severity"], r["text"]])

        ws.append([])
        ws.append(["Recommendations"])
        ws[f"A{ws.max_row}"].font = Font(bold=True)
        for rec in recommendations:
            ws.append([rec])

    for col, width in zip("ABC", (28, 24, 45)):
        ws.column_dimensions[col].width = width

    wb.save(path)
    return path
