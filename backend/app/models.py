import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
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
    size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="datasets")


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


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=gen_id)
    organization_id = Column(String, ForeignKey("organizations.id"))
    user_id = Column(String, ForeignKey("users.id"))
    role = Column(String, nullable=False)  # user | ai
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="chat_messages")


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
