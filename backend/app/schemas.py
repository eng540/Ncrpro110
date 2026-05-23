from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

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

# ---------- Remark Schemas ----------
class RemarkBase(BaseModel):
    remark_id: Optional[str] = None
    boq_code: Optional[str] = None
    type: Optional[str] = None
    severity: Optional[str] = "minor"
    description: Optional[str] = None
    action_required: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = "open"
    photo_ref: Optional[str] = None

class RemarkCreate(RemarkBase):
    latrine_id: int

class RemarkUpdate(BaseModel):
    status: Optional[str] = None
    closed_date: Optional[datetime] = None

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

# ---------- BoQ Dictionary Schemas (جديد) ----------
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

# ---------- Sync Engine Schemas ----------
class SyncOperation(BaseModel):
    id: str
    type: str
    timestamp: datetime
    local_uuid: Optional[str] = None
    data: Dict[str, Any]

class SyncRequest(BaseModel):
    operations: List[SyncOperation]

class SyncResponse(BaseModel):
    processed_ids: List[str]
    failed_ids: List[str]
    errors: Dict[str, str]
