# AUTH-PATCH 2026-06-02: ШҘШ¶Ш§ЩҒШ© schemas Ш§Щ„Щ…ШіШӘШ®ШҜЩ…ЩҠЩҶ ЩҲШ§Щ„ШЈШҜЩҲШ§Шұ ЩҲШ§Щ„ЩҖ Token ЩҲ Audit Log

from pydantic import BaseModel, Field, EmailStr
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
    assigned_engineer_id: Optional[int] = None

class LatrineOut(LatrineBase):
    id: int
    last_update: datetime
    remarks_count: int
    assigned_engineer_id: Optional[int] = None

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

# ---------- Remark Template Schemas ----------
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
    boq_tags: Optional[List[str]] = Field(default_factory=list)
    reference_media_url: Optional[str] = None
    media_type: Optional[MediaType] = None
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

# ---------- Remark Schemas ----------
class RemarkBase(BaseModel):
    remark_id: Optional[str] = None
    boq_code: Optional[str] = None
    type: Optional[str] = None
    severity: Optional[str] = "minor"
    description: Optional[str] = None
    template_id: Optional[int] = None
    suffix_note: Optional[str] = None
    action_required: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = "open"
    photo_ref: Optional[str] = None
    evidence_photo_ref: Optional[str] = None
    before_photo_ref: Optional[str] = None
    after_photo_ref: Optional[str] = None

class RemarkCreate(RemarkBase):
    latrine_id: int

class RemarkUpdate(BaseModel):
    status: Optional[str] = None
    closed_date: Optional[datetime] = None
    suffix_note: Optional[str] = None
    action_required: Optional[str] = None
    severity: Optional[str] = None
    before_photo_ref: Optional[str] = None
    after_photo_ref: Optional[str] = None

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

# ---------- Governance Schemas ----------
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

# ==========================================
# AUTHENTICATION & AUTHORIZATION SCHEMAS (AUTH-PATCH)
# ==========================================

# ---------- Role Schemas ----------
class RoleBase(BaseModel):
    name: str
    permissions: List[str] = []
    description: Optional[str] = None

class RoleCreate(RoleBase):
    pass

class RoleOut(RoleBase):
    id: int

    class Config:
        from_attributes = True

# ---------- User Schemas ----------
class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_active: bool = True

class UserCreate(UserBase):
    password: str
    role_id: int

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None
    is_active: Optional[bool] = None

class UserOut(UserBase):
    id: int
    role_id: int
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

# ---------- Token Schemas ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[datetime] = None
    role: Optional[str] = None

# ---------- Audit Log Schemas ----------
class AuditLogCreate(BaseModel):
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None

class AuditLogOut(AuditLogCreate):
    id: int
    user_id: Optional[int] = None
    timestamp: datetime

    class Config:
        from_attributes = True