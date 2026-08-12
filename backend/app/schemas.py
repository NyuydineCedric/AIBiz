from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, EmailStr


# ---------- Auth ----------

class SignupRequest(BaseModel):
    full_name: str
    company: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    organization_id: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Uploads ----------

class DatasetOut(BaseModel):
    id: str
    filename: str
    file_type: str
    status: str
    row_count: int
    column_count: int
    columns: List[str]
    size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Dashboard ----------

class KpiOut(BaseModel):
    label: str
    value: str
    change: str
    trend: str


class SeriesOut(BaseModel):
    labels: List[str]
    values: List[float]


class InsightOut(BaseModel):
    id: str
    type: str
    severity: str
    text: str

    class Config:
        from_attributes = True


class DashboardSummary(BaseModel):
    has_data: bool
    kpis: List[KpiOut]
    executive_summary: str
    revenue_trend: SeriesOut
    region_breakdown: SeriesOut
    risks: List[InsightOut]
    recommendations: List[InsightOut]


# ---------- Chat ----------

class ChatRequest(BaseModel):
    question: str


class ChatMessageOut(BaseModel):
    id: str
    role: str
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    answer: str
    history: List[ChatMessageOut]


# ---------- Reports ----------

class ReportGenerateRequest(BaseModel):
    report_type: str = "summary"
    title: Optional[str] = None


class ReportOut(BaseModel):
    id: str
    title: str
    description: str
    report_type: str
    created_at: datetime
    has_pdf: bool
    has_xlsx: bool

    class Config:
        from_attributes = True


# ---------- Settings ----------

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None


class NotificationPreferencesUpdate(BaseModel):
    risk_alerts: Optional[bool] = None
    weekly_report_emails: Optional[bool] = None
    forecast_updates: Optional[bool] = None


class NotificationPreferencesOut(BaseModel):
    risk_alerts: bool
    weekly_report_emails: bool
    forecast_updates: bool

    class Config:
        from_attributes = True
