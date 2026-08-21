from datetime import date, datetime
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


# ---------- Daily Entry ----------

class DailyEntryIn(BaseModel):
    entry_type: str  # "sale" | "purchase"
    item_name: str
    category: str = ""
    quantity: float = 1
    unit_price: float = 0
    notes: str = ""


class DailyEntryBulkRequest(BaseModel):
    entry_date: date
    entries: List[DailyEntryIn]


class DailyEntryOut(BaseModel):
    id: str
    entry_date: date
    entry_type: str
    item_name: str
    category: str
    quantity: float
    unit_price: float
    amount: float
    notes: str
    created_at: datetime

    class Config:
        from_attributes = True


class DaySummaryOut(BaseModel):
    entry_date: date
    total_sales: float
    total_purchases: float
    net_profit: float
    entry_count: int


class StockItemOut(BaseModel):
    item_name: str
    category: str
    quantity_purchased: float
    quantity_sold: float
    quantity_on_hand: float
    low_stock: bool


# ---------- Products (catalog) ----------

class ProductIn(BaseModel):
    name: str
    category: str = ""
    default_unit_price: float = 0


class ProductOut(BaseModel):
    id: str
    name: str
    category: str
    default_unit_price: float
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
    forecast: SeriesOut
    risks: List[InsightOut]
    recommendations: List[InsightOut]


class MetricSeriesOut(BaseModel):
    """One metric's actual + forecast lines — e.g. "Rice" or "Total Sales".
    The Forecast page renders one of these per chat-detected metric, so
    asking about two products at once draws two lines on the same chart."""

    metric_label: str
    actual: SeriesOut
    forecast_labels: List[str]
    forecast_values: List[float]
    lower_bound: List[float]
    upper_bound: List[float]
    trend: str
    slope_per_period: float = 0.0


class ForecastDetail(BaseModel):
    has_data: bool
    series: List[MetricSeriesOut] = []
    note: str = ""
    ai_insight: str = ""
    # Flat fields mirroring series[0] — kept so anything still reading the
    # old single-metric shape (older frontend build, other integration)
    # keeps working unchanged.
    actual: SeriesOut = SeriesOut(labels=[], values=[])
    forecast_labels: List[str] = []
    forecast_values: List[float] = []
    lower_bound: List[float] = []
    upper_bound: List[float] = []
    trend: str = "flat"
    slope_per_period: float = 0.0
    metric_label: str = "Revenue"


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


class ChatSessionOut(BaseModel):
    id: str
    title: str
    dataset_id: Optional[str] = None
    dataset_filename: Optional[str] = None
    dataset_status: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


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