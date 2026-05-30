from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

# ---------- Latrine Schemas ----------
class LatrineBase(BaseModel):
    latrine_id: str
    block_no: Optional[str] = "B01"
    gps_coordinates: Optional[str] = None
    beneficiary_hh: Optional[str] = None
    status: Optional[str] = "not_started"
    overall_pct: Optional[float] = 0.0
    start_date: Optional[datetime] = None
    expected_completion: Optional[datetime] = None
    site_engineer: Optional[str] = None

class LatrineCreate(LatrineBase):
    pass

class LatrineUpdate(BaseModel):
    status: Optional[str] = None
    overall_pct: Optional[float] = None
    site_engineer: Optional[str] = None
    start_date: Optional[datetime] = None
    expected_completion: Optional[datetime] = None

class LatrineOut(LatrineBase):
    id: int
    last_update: datetime
    remarks_count: int

    class Config:
        from_attributes = True

# ---------- BoQ Item Schemas ----------
class BoqItemBase(BaseModel):
    boq_code: str
    category: Optional[str] = None
    description_ar: Optional[str] = None
    description_en: Optional[str] = None
    unit: Optional[str] = None
    planned_qty: float = 0.0
    achieved_qty: float = 0.0
    achievement_pct: float = 0.0
    status: Optional[str] = "not_started"
    quality_pass: Optional[str] = "pending"

class BoqItemCreate(BoqItemBase):
    latrine_id: int

class BoqItemUpdate(BaseModel):
    achieved_qty: Optional[float] = None
    status: Optional[str] = None
    quality_pass: Optional[str] = None
    inspection_date: Optional[datetime] = None
    inspector: Optional[str] = None

class BoqItemBulkUpdate(BaseModel):
    item_id: int
    achieved_qty: Optional[float] = None
    status: Optional[str] = None
    quality_pass: Optional[str] = None

class BoqItemBulkRequest(BaseModel):
    items: List[BoqItemBulkUpdate]

class BoqItemOut(BoqItemBase):
    id: int
    latrine_id: int
    inspection_date: Optional[datetime] = None
    inspector: Optional[str] = None
    last_update: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# 🌟 SMART OBSERVATION ENGINE SCHEMAS (V3.0.0)
# ==========================================

class MediaType(str, Enum):
    IMAGE = "image"
    PDF = "pdf"
    VIDEO = "video"

class RemarkTemplateBase(BaseModel):
    template_code: str
    title: str
    description: str
    default_action: Optional[str] = None
    default_severity: Optional[str] = "minor"
    
    # 🌟 التصحيح 1: استخدام Field(default_factory=list) لمنع تداخل الذاكرة
    boq_tags: Optional[List[str]] = Field(default_factory=list)
    
    reference_media_url: Optional[str] = None
    media_type: Optional[MediaType] = None # 🌟 التصحيح 2: استخدام Enum
    is_active: Optional[bool] = True

class RemarkTemplateCreate(RemarkTemplateBase):
    created_by: Optional[str] = None

class RemarkTemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    default_action: Optional[str] = None
    default_severity: Optional[str] = None
    boq_tags: Optional[List[str]] = None
    reference_media_url: Optional[str] = None
    media_type: Optional[MediaType] = None
    is_active: Optional[bool] = None

class RemarkTemplateOut(RemarkTemplateBase):
    id: int
    version: int
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# 🌟 Remark (Legacy + Smart Hybrid)
# ==========================================

class RemarkBase(BaseModel):
    remark_id: Optional[str] = None
    boq_code: Optional[str] = None
    type: Optional[str] = None
    severity: Optional[str] = "minor"

    # Legacy
    description: Optional[str] = None

    # Smart
    template_id: Optional[int] = None
    suffix_note: Optional[str] = None

    action_required: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = "open"

    # Media
    photo_ref: Optional[str] = None
    evidence_photo_ref: Optional[str] = None

class RemarkCreate(RemarkBase):
    latrine_id: int

class RemarkUpdate(BaseModel):
    status: Optional[str] = None
    closed_date: Optional[datetime] = None
    suffix_note: Optional[str] = None
    action_required: Optional[str] = None
    severity: Optional[str] = None

class RemarkOut(RemarkBase):
    id: int
    latrine_id: int
    date_logged: datetime
    closed_date: Optional[datetime] = None
    last_update: Optional[datetime] = None

    class Config:
        from_attributes = True

# ---------- Daily Log Schemas ----------
class DailyLogBase(BaseModel):
    date: datetime
    engineer: Optional[str] = None
    latrines_inspected: Optional[int] = 0
    latrines_accepted: Optional[int] = 0
    remarks_issued: Optional[int] = 0
    weather: Optional[str] = None
    manpower: Optional[int] = 0
    equipment: Optional[str] = None
    notes: Optional[str] = None

class DailyLogCreate(DailyLogBase):
    pass

class DailyLogOut(DailyLogBase):
    id: int

    class Config:
        from_attributes = True

class DailyLogStats(BaseModel):
    latrines_inspected: int
    latrines_accepted: int
    remarks_issued: int

# ---------- Dashboard Schemas ----------
class DashboardSummary(BaseModel):
    total_latrines: int
    completed: int
    in_progress: int
    not_started: int
    accepted_items: int
    rejected_items: int
    open_remarks: int
    overdue_remarks: int
    overall_progress_pct: float

class CategoryProgress(BaseModel):
    category: str
    avg_achievement_pct: float

class EngineerPerformance(BaseModel):
    engineer: str
    inspected_today: int
    accepted_today: int

# ---------- BoQ Dictionary Schemas ----------
class BoqDictionaryBase(BaseModel):
    boq_code: str
    category: Optional[str] = None
    description_ar: Optional[str] = None
    description_en: Optional[str] = None
    unit: Optional[str] = None
    default_qty: float = 0.0
    unit_price: float = 0.0
    is_active: bool = True

class BoqDictionaryCreate(BoqDictionaryBase):
    pass

class BoqDictionaryUpdate(BaseModel):
    category: Optional[str] = None
    description_ar: Optional[str] = None
    description_en: Optional[str] = None
    unit: Optional[str] = None
    default_qty: Optional[float] = None
    unit_price: Optional[float] = None
    is_active: Optional[bool] = None

class BoqDictionaryOut(BoqDictionaryBase):
    id: int

    class Config:
        from_attributes = True

# ==========================================
# 🌟 GOVERNANCE & DECISION SCHEMAS
# ==========================================
class GovernanceItemOut(BaseModel):
    decision_id: int
    boq_item_id: int
    latrine_id: str
    beneficiary_hh: Optional[str] = None
    boq_code: str
    execution_pct: float
    quality_status: str
    highest_remark_severity: Optional[str] = None
    system_recommendation_code: str
    system_recommendation_note: Optional[str] = None
    system_payment_pct: float
    human_decision_code: Optional[str] = None
    human_payment_pct: Optional[float] = None
    override_reason: Optional[str] = None
    final_state: str

class DecisionOverrideUpdate(BaseModel):
    human_decision_code: str
    human_payment_pct: float
    override_reason: str
    approved_by: str

# ---------- Sync Engine Schemas ----------
class SyncOperation(BaseModel):
    seq: int
    type: str
    payload: Dict[str, Any]
    integrity: str

class SyncRequest(BaseModel):
    operations: List[SyncOperation]
    device_id: str
    protocol: int

class SyncResponse(BaseModel):
    processed_ids: List[int]
    failed_ids: List[int]
    errors: Dict[str, str]