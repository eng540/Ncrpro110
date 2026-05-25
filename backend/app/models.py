from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum, Boolean
from sqlalchemy.dialects.postgresql import JSONB # 🌟 استخدام JSONB لقوة الأداء في PostgreSQL
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

# ==========================================
# 1. MASTER REGISTRY
# ==========================================
class Latrine(Base):
    __tablename__ = "latrines"

    id = Column(Integer, primary_key=True, index=True)
    latrine_id = Column(String(20), unique=True, index=True, nullable=False)
    block_no = Column(String(10), default="B01")
    gps_coordinates = Column(String(50))
    beneficiary_hh = Column(String(100))
    status = Column(String(20), default=LatrineStatus.NOT_STARTED)
    overall_pct = Column(Float, default=0.0)
    start_date = Column(DateTime, nullable=True)
    expected_completion = Column(DateTime, nullable=True)
    site_engineer = Column(String(100))
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    remarks_count = Column(Integer, default=0)

    # 🌟 ربط الحمام بسياسة معينة (اختياري، إذا كان فارغاً يأخذ السياسة الافتراضية)
    policy_id = Column(Integer, ForeignKey("policy_profiles.id"), nullable=True)

    boq_items = relationship("BoqItem", back_populates="latrine", cascade="all, delete-orphan")
    remarks = relationship("Remark", back_populates="latrine", cascade="all, delete-orphan")
    policy = relationship("PolicyProfile")

# ==========================================
# 2. BOQ TRACKING
# ==========================================
class BoqItem(Base):
    __tablename__ = "boq_items"

    id = Column(Integer, primary_key=True, index=True)
    latrine_id = Column(Integer, ForeignKey("latrines.id"), nullable=False)
    boq_code = Column(String(10), nullable=False)
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
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    latrine = relationship("Latrine", back_populates="boq_items")
    decision_record = relationship("DecisionRecord", back_populates="boq_item", uselist=False, cascade="all, delete-orphan")

# ==========================================
# 3. REMARKS / DEFECTS
# ==========================================
class Remark(Base):
    __tablename__ = "remarks"

    id = Column(Integer, primary_key=True, index=True)
    remark_id = Column(String(36), unique=True)
    latrine_id = Column(Integer, ForeignKey("latrines.id"), nullable=False)
    boq_code = Column(String(10))
    date_logged = Column(DateTime, default=datetime.utcnow)
    type = Column(String(50))
    severity = Column(String(20), default=RemarkSeverity.MINOR)
    description = Column(Text)
    action_required = Column(Text)
    deadline = Column(DateTime)
    status = Column(String(20), default=RemarkStatus.OPEN)
    closed_date = Column(DateTime, nullable=True)
    photo_ref = Column(String(100))
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    latrine = relationship("Latrine", back_populates="remarks")

# ==========================================
# 4. DAILY LOG
# ==========================================
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
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ==========================================
# 5. MASTER BOQ DICTIONARY
# ==========================================
class BoqDictionary(Base):
    __tablename__ = "boq_dictionary"

    id = Column(Integer, primary_key=True, index=True)
    boq_code = Column(String(10), unique=True, index=True, nullable=False)
    category = Column(String(50))
    description_ar = Column(Text)
    description_en = Column(Text)
    unit = Column(String(10))
    default_qty = Column(Float, default=0.0)
    unit_price = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)

# ==========================================
# 6. GOVERNANCE & POLICIES (الطبقة الجديدة)
# ==========================================
class PolicyProfile(Base):
    """جدول السياسات (يخزن القواعد كـ JSON)"""
    __tablename__ = "policy_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False) # e.g., "NRC Strict", "Emergency"
    description = Column(Text)
    is_default = Column(Boolean, default=False)
    
    # 🌟 هنا يكمن السحر: تخزين مصفوفة القرار كـ JSON
    rules_json = Column(JSONB, nullable=False) 

class DecisionRecord(Base):
    """سجل القرار لكل بند (المصدر الوحيد للحقيقة)"""
    __tablename__ = "decision_records"

    id = Column(Integer, primary_key=True, index=True)
    boq_item_id = Column(Integer, ForeignKey("boq_items.id"), unique=True, nullable=False)
    
    # --- 1. المدخلات الخام (Snapshot of Reality) ---
    execution_pct = Column(Float)
    quality_status = Column(String(20))
    highest_remark_severity = Column(String(20), nullable=True)
    
    # --- 2. توصية النظام (Immutable Advisor) ---
    system_recommendation_code = Column(String(50)) # APPROVE, REWORK, HOLD, STOP
    system_recommendation_note = Column(Text)
    system_payment_pct = Column(Float)
    
    # --- 3. القرار البشري (Mutable Decider) ---
    human_decision_code = Column(String(50), nullable=True) # APPROVE, REJECT, OVERRIDE, HOLD
    human_payment_pct = Column(Float, nullable=True)
    override_reason = Column(Text, nullable=True)
    
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    
    # --- 4. الحالة النهائية (Derived State) ---
    final_state = Column(String(20), default="OPEN") # LOCKED, OPEN, DISPUTED

    boq_item = relationship("BoqItem", back_populates="decision_record")