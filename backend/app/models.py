import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Date, ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return str(uuid.uuid4())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    industry = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="organization")
    datasets = relationship("Dataset", back_populates="organization")
    insights = relationship("Insight", back_populates="organization")
    reports = relationship("Report", back_populates="organization")
    chat_messages = relationship("ChatMessage", back_populates="organization")
    chat_sessions = relationship("ChatSession", back_populates="organization")
    daily_entries = relationship("DailyEntry", back_populates="organization")
    products = relationship("Product", back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="owner")
    organization_id = Column(String, ForeignKey("organizations.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")
    notification_pref = relationship(
        "NotificationPreference", back_populates="user", uselist=False
    )


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), unique=True)
    risk_alerts = Column(Boolean, default=True)
    weekly_report_emails = Column(Boolean, default=True)
    forecast_updates = Column(Boolean, default=False)

    user = relationship("User", back_populates="notification_pref")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    status = Column(String, default="processing")
    # "upload" (parsed from a CSV/Excel/PDF file) or "daily_log" (rebuilt from
    # DailyEntry rows) — lets daily_aggregator find-and-update its one running
    # dataset per org instead of creating a new row on every entry.
    source = Column(String, default="upload")
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    columns = Column(JSON, default=list)
    categorical_columns = Column(JSON, default=list)
    numeric_summary = Column(JSON, default=dict)
    kpis = Column(JSON, default=list)
    executive_summary = Column(Text, default="")
    trend_series = Column(JSON, default=dict)
    region_series = Column(JSON, default=dict)
    text_excerpt = Column(Text, default="")
    # Cached AI forecast narratives, keyed by periods_ahead (as a string, e.g.
    # "3"/"6"/"12") so the Forecast page's AI insight persists across visits
    # instead of being regenerated (and re-worded) every time the page loads.
    forecast_insight_cache = Column(JSON, default=dict)
    size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="datasets")
    chat_sessions = relationship("ChatSession", back_populates="dataset")


class DailyEntry(Base):
    """A single line item a shop owner logs for a given day — either a sale
    (something sold to a customer) or a purchase (stock/inventory bought in).
    A day is made up of many of these; daily_aggregator.py rolls all of an
    organization's entries up into the same Dataset shape the rest of the
    app already knows how to read (KPIs, trend, forecast, chat), so no
    downstream code needs to know entries even exist."""
    __tablename__ = "daily_entries"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    entry_date = Column(Date, nullable=False, index=True)
    entry_type = Column(String, nullable=False)  # "sale" | "purchase"
    item_name = Column(String, nullable=False)
    category = Column(String, default="")
    quantity = Column(Float, default=0.0)
    unit_price = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)  # quantity * unit_price, stored so it survives price changes later
    notes = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="daily_entries")


class Product(Base):
    """A reusable catalog entry the shop owner sets up once (name, category,
    a default price) so logging a day's sales/purchases is picking from a
    dropdown instead of retyping the same item name every time — retyping
    is also how the same product ends up as two different metrics ("Rice"
    vs "rice ") when charted, so a catalog fixes that too."""
    __tablename__ = "products"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    name = Column(String, nullable=False)
    category = Column(String, default="")
    default_unit_price = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="products")


class Insight(Base):
    __tablename__ = "insights"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=True)
    type = Column(String, nullable=False)  # risk | recommendation
    severity = Column(String, default="Medium")  # High | Medium
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="insights")


class ChatSession(Base):
    """A single chat thread, automatically created for each uploaded
    document so the user can see and revisit separate conversations per
    file, similar to chat history in other AI apps."""
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=True)
    title = Column(String, nullable=False, default="New chat")
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="chat_sessions")
    dataset = relationship("Dataset", back_populates="chat_sessions")
    messages = relationship(
        "ChatMessage", back_populates="session", order_by="ChatMessage.created_at"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=True)
    user_id = Column(String, ForeignKey("users.id"))
    role = Column(String, nullable=False)  # user | ai
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="chat_messages")
    session = relationship("ChatSession", back_populates="messages")


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    title = Column(String, nullable=False)
    description = Column(String, default="")
    report_type = Column(String, default="summary")
    pdf_path = Column(String, nullable=True)
    xlsx_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="reports")