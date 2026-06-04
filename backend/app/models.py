# AUTH-PATCH 2026-06-02: إضافة نماذج User, Role, AuditLog وربط المهندس بالحمامات
# 2026-06-03: إضافة before_photo_ref و after_photo_ref في Remark

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum, Boolean, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB
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

class MediaType(str, enum.Enum):
    IMAGE = "image"
    PDF = "pdf"
    VIDEO = "video"

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
    status = Column(String(20), default=LatrineStatus.NOT_STARTED.value)
    overall_pct = Column(Float, default=0.0)
    start_date = Column(DateTime, nullable=True)
    expected_completion = Column(DateTime, nullable=True)
    site_engineer = Column(String(100))
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    remarks_count = Column(Integer, default=0)

    policy_id = Column(Integer, ForeignKey("policy_profiles.id"), nullable=True)
    assigned_engineer_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # AUTH-PATCH

    boq_items = relationship("BoqItem", back_populates="latrine", cascade="all, delete-orphan")
    remarks = relationship("Remark", back_populates="latrine", cascade="all, delete-orphan")
    policy = relationship("PolicyProfile")
    assigned_engineer = relationship("User", back_populates="assigned_latrines")    # AUTH-PATCH

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
    status = Column(String(20), default=BoqStatus.NOT_STARTED.value)
    inspection_date = Column(DateTime, nullable=True)
    inspector = Column(String(50))
    quality_pass = Column(String(10), default=QualityPass.PENDING.value)
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    latrine = relationship("Latrine", back_populates="boq_items")
    decision_record = relationship("DecisionRecord", back_populates="boq_item", uselist=False, cascade="all, delete-orphan")

# ==========================================
# 3. SMART OBSERVATION ENGINE
# ==========================================
class RemarkTemplate(Base):
    __tablename__ = "remark_templates"

    id = Column(Integer, primary_key=True, index=True)
    template_code = Column(String(20), unique=True, index=True, nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    default_action = Column(Text)
    default_severity = Column(String(20), default=RemarkSeverity.MINOR.value)
    boq_tags = Column(JSONB, default=list)
    reference_media_url = Column(String(500), nullable=True)
    media_type = Column(Enum(MediaType, name="media_type_enum", create_type=True), nullable=True)
    is_active = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    created_by = Column(String(100), index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    archived_at = Column(DateTime, nullable=True)

    remarks = relationship("Remark", back_populates="template", passive_deletes=True)

Index("ix_remark_templates_boq_tags", RemarkTemplate.boq_tags, postgresql_using="gin")

class Remark(Base):
    __tablename__ = "remarks"
    __table_args__ = (
        CheckConstraint(
            "((template_id IS NULL) AND (description IS NOT NULL)) OR "
            "((template_id IS NOT NULL) AND (description IS NULL))",
            name="ck_remark_mode_strict"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    remark_id = Column(String(36), unique=True)
    latrine_id = Column(Integer, ForeignKey("latrines.id"), nullable=False)
    boq_code = Column(String(10))
    template_id = Column(Integer, ForeignKey("remark_templates.id", ondelete="SET NULL"), nullable=True)
    date_logged = Column(DateTime, default=datetime.utcnow)
    type = Column(String(50))
    severity = Column(String(20), default=RemarkSeverity.MINOR.value)
    description = Column(Text, nullable=True)
    suffix_note = Column(Text, nullable=True)
    action_required = Column(Text)
    deadline = Column(DateTime)
    status = Column(String(20), default=RemarkStatus.OPEN.value)
    closed_date = Column(DateTime, nullable=True)
    evidence_photo_ref = Column(String(100), nullable=True)
    before_photo_ref = Column(String(200), nullable=True)
    after_photo_ref = Column(String(200), nullable=True)
    last_update = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    latrine = relationship("Latrine", back_populates="remarks")
    template = relationship("RemarkTemplate", back_populates="remarks")

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
# 6. GOVERNANCE & POLICIES
# ==========================================
class PolicyProfile(Base):
    __tablename__ = "policy_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    description = Column(Text)
    is_default = Column(Boolean, default=False)
    rules_json = Column(JSONB, nullable=False)

class DecisionRecord(Base):
    __tablename__ = "decision_records"

    id = Column(Integer, primary_key=True, index=True)
    boq_item_id = Column(Integer, ForeignKey("boq_items.id"), unique=True, nullable=False)
    execution_pct = Column(Float)
    quality_status = Column(String(20))
    highest_remark_severity = Column(String(20), nullable=True)
    system_recommendation_code = Column(String(50))
    system_recommendation_note = Column(Text)
    system_payment_pct = Column(Float)
    human_decision_code = Column(String(50), nullable=True)
    human_payment_pct = Column(Float, nullable=True)
    override_reason = Column(Text, nullable=True)
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    final_state = Column(String(20), default="OPEN")

    boq_item = relationship("BoqItem", back_populates="decision_record")

# ==========================================
# 7. AUTHENTICATION & AUTHORIZATION (AUTH-PATCH)
# ==========================================
class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    permissions = Column(JSONB, nullable=False, default=list)
    description = Column(Text)

    users = relationship("User", back_populates="role")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=True)
    full_name = Column(String(100), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    role = relationship("Role", back_populates="users")
    assigned_latrines = relationship("Latrine", back_populates="assigned_engineer")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    old_values = Column(JSONB, nullable=True)
    new_values = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
