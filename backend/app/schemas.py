from pydantic import BaseModel, field_validator
from typing import Optional, List
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

    @field_validator('item_id', mode='before')
    @classmethod
    def validate_item_id(cls, v):
        if isinstance(v, str):
            return int(v)
        return v

    @field_validator('achieved_qty', mode='before')
    @classmethod
    def validate_achieved(cls, v):
        if v is None or v == "" or v == "null":
            return None
        return float(v)

class BoqItemOut(BoqItemBase):
    id: int
    latrine_id: int
    inspection_date: Optional[datetime] = None
    inspector: Optional[str] = None

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

    class Config:
        from_attributes = True

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
