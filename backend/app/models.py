from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from app.database import Base
import enum
from datetime import datetime

class LatrineStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ON_HOLD = "on_hold"
    REJECTED = "rejected"

class BoqStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    PENDING_INSPECTION = "pending_inspection"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    REWORK_REQUIRED = "rework_required"

class QualityPass(str, enum.Enum):
    PASS = "pass"
    FAIL = "fail"
    PENDING = "pending"

class RemarkSeverity(str, enum.Enum):
    MINOR = "minor"
    MAJOR = "major"
    CRITICAL = "critical"

class RemarkStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"
    OVERDUE = "overdue"

# MASTER REGISTRY
class Latrine(Base):
    __tablename__ = "latrines"

    id = Column(Integer, primary_key=True, index=True)
    latrine_id = Column(String(20), unique=True, index=True, nullable=False)  # LAT-001
    block_no = Column(String(10), default="B01")
    gps_coordinates = Column(String(50))
    beneficiary_hh = Column(String(20))
    status = Column(String(20), default=LatrineStatus.NOT_STARTED)
    overall_pct = Column(Float, default=0.0)
    start_date = Column(DateTime, nullable=True)
    expected_completion = Column(DateTime, nullable=True)
    site_engineer = Column(String(50))
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    remarks_count = Column(Integer, default=0)

    boq_items = relationship("BoqItem", back_populates="latrine", cascade="all, delete-orphan")
    remarks = relationship("Remark", back_populates="latrine", cascade="all, delete-orphan")

# BOQ TRACKING
class BoqItem(Base):
    __tablename__ = "boq_items"

    id = Column(Integer, primary_key=True, index=True)
    latrine_id = Column(Integer, ForeignKey("latrines.id"), nullable=False)
    boq_code = Column(String(10), nullable=False)  # A1, A2, etc.
    category = Column(String(50))
    description_ar = Column(Text)
    description_en = Column(Text)
    unit = Column(String(10))
    planned_qty = Column(Float, default=0.0)
    achieved_qty = Column(Float, default=0.0)
    achievement_pct = Column(Float, default=0.0)
    status = Column(String(20), default=BoqStatus.NOT_STARTED)
    inspection_date = Column(DateTime, nullable=True)
    inspector = Column(String(50))
    quality_pass = Column(String(10), default=QualityPass.PENDING)

    latrine = relationship("Latrine", back_populates="boq_items")

# REMARKS / DEFECTS
class Remark(Base):
    __tablename__ = "remarks"

    id = Column(Integer, primary_key=True, index=True)
    remark_id = Column(String(20), unique=True)
    latrine_id = Column(Integer, ForeignKey("latrines.id"), nullable=False)
    boq_code = Column(String(10))
    date_logged = Column(DateTime, default=datetime.utcnow)
    type = Column(String(50))  # Dimensional, Material, Workmanship, Safety
    severity = Column(String(20), default=RemarkSeverity.MINOR)
    description = Column(Text)
    action_required = Column(Text)
    deadline = Column(DateTime)
    status = Column(String(20), default=RemarkStatus.OPEN)
    closed_date = Column(DateTime, nullable=True)
    photo_ref = Column(String(100))

    latrine = relationship("Latrine", back_populates="remarks")

# DAILY LOG
class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.utcnow)
    engineer = Column(String(50))
    latrines_inspected = Column(Integer, default=0)
    latrines_accepted = Column(Integer, default=0)
    remarks_issued = Column(Integer, default=0)
    weather = Column(String(20))
    manpower = Column(Integer, default=0)
    equipment = Column(Text)
    notes = Column(Text)
