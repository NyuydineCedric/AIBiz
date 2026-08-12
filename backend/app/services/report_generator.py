"""Generates downloadable PDF and Excel executive reports from a dashboard
summary (KPIs, executive summary, risks, recommendations) using reportlab
and openpyxl.
"""
import os
from datetime import datetime
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill


def generate_pdf_report(
    path: str,
    title: str,
    executive_summary: str,
    kpis: List[Dict[str, str]],
    risks: List[Dict[str, str]],
    recommendations: List[str],
) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc = SimpleDocTemplate(path, pagesize=letter, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleStyle", parent=styles["Title"], fontSize=20)
    heading_style = ParagraphStyle("HeadingStyle", parent=styles["Heading2"], spaceBefore=14, spaceAfter=6)
    body_style = styles["BodyText"]

    story = [
        Paragraph(title, title_style),
        Paragraph(datetime.utcnow().strftime("Generated %B %d, %Y"), body_style),
        Spacer(1, 16),
        Paragraph("Executive summary", heading_style),
        Paragraph(executive_summary, body_style),
    ]

    if kpis:
        story.append(Paragraph("Key metrics", heading_style))
        table_data = [["Metric", "Value", "Change"]] + [
            [k["label"], k["value"], k["change"]] for k in kpis
        ]
        table = Table(table_data, hAlign="LEFT", colWidths=[2.2 * inch, 2 * inch, 2.2 * inch])
        table.setStyle(
            TableStyle(
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
        )
        story.append(table)

    if risks:
        story.append(Paragraph("Detected risks", heading_style))
        for r in risks:
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
    kpis: List[Dict[str, str]],
    risks: List[Dict[str, str]],
    recommendations: List[str],
) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"

    header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)

    ws.append([title])
    ws["A1"].font = Font(size=14, bold=True)
    ws.append([datetime.utcnow().strftime("Generated %B %d, %Y")])
    ws.append([])

    ws.append(["Metric", "Value", "Change"])
    for cell in ws[ws.max_row]:
        cell.fill = header_fill
        cell.font = header_font
    for k in kpis:
        ws.append([k["label"], k["value"], k["change"]])

    ws.append([])
    ws.append(["Risks"])
    ws[f"A{ws.max_row}"].font = Font(bold=True)
    for r in risks:
        ws.append([r["severity"], r["text"]])

    ws.append([])
    ws.append(["Recommendations"])
    ws[f"A{ws.max_row}"].font = Font(bold=True)
    for rec in recommendations:
        ws.append([rec])

    for col, width in zip("ABC", (28, 20, 45)):
        ws.column_dimensions[col].width = width

    wb.save(path)
    return path
