from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from app import models, schemas
from datetime import datetime, timedelta

def get_latrine(db: Session, latrine_id: int):
    return db.query(models.Latrine).filter(models.Latrine.id == latrine_id).first()

def get_latrine_by_code(db: Session, code: str):
    return db.query(models.Latrine).filter(models.Latrine.latrine_id == code).first()

def get_latrines(db: Session, skip: int = 0, limit: int = 100, status: str = None):
    query = db.query(models.Latrine)
    if status:
        query = query.filter(models.Latrine.status == status)
    return query.offset(skip).limit(limit).all()

def create_latrine(db: Session, latrine: schemas.LatrineCreate):
    db_latrine = models.Latrine(**latrine.dict())
    db.add(db_latrine)
    db.commit()
    db.refresh(db_latrine)
    return db_latrine

def update_latrine(db: Session, latrine_id: int, updates: schemas.LatrineUpdate):
    db_latrine = get_latrine(db, latrine_id)
    if not db_latrine:
        return None
    for key, value in updates.dict(exclude_unset=True).items():
        setattr(db_latrine, key, value)
    db_latrine.last_update = datetime.utcnow()
    db.commit()
    db.refresh(db_latrine)
    return db_latrine

def get_boq_items(db: Session, latrine_id: int = None):
    query = db.query(models.BoqItem)
    if latrine_id:
        query = query.filter(models.BoqItem.latrine_id == latrine_id)
    return query.all()

def update_boq_item(db: Session, item_id: int, updates: schemas.BoqItemUpdate):
    item = db.query(models.BoqItem).filter(models.BoqItem.id == item_id).first()
    if not item:
        return None
    data = updates.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(item, key, value)
    if item.planned_qty and item.planned_qty > 0:
        item.achievement_pct = round((item.achieved_qty / item.planned_qty) * 100, 2)
    db.commit()
    db.refresh(item)
    recalc_latrine_progress(db, item.latrine_id)
    return item

def bulk_update_boq_items(db: Session, updates: List[schemas.BoqItemBulkUpdate]):
    updated_latrine_ids = set()
    for upd in updates:
        item = db.query(models.BoqItem).filter(models.BoqItem.id == upd.item_id).first()
        if not item:
            continue
        if upd.achieved_qty is not None:
            item.achieved_qty = upd.achieved_qty
        if upd.status is not None:
            item.status = upd.status
        if upd.quality_pass is not None:
            item.quality_pass = upd.quality_pass
        if item.planned_qty and item.planned_qty > 0:
            item.achievement_pct = round((item.achieved_qty / item.planned_qty) * 100, 2)
        updated_latrine_ids.add(item.latrine_id)
    db.commit()
    
    for upd in updates:
        item = db.query(models.BoqItem).filter(models.BoqItem.id == upd.item_id).first()
        if item:
            db.refresh(item)
            
    for lid in updated_latrine_ids:
        recalc_latrine_progress(db, lid)
        
    return {"updated_count": len(updates), "affected_latrines": len(updated_latrine_ids)}

def recalc_latrine_progress(db: Session, latrine_id: int):
    latrine = db.query(models.Latrine).filter(models.Latrine.id == latrine_id).with_for_update().first()
    if not latrine:
        return

    items = db.query(models.BoqItem).filter(models.BoqItem.latrine_id == latrine_id).all()
    if not items:
        return
    
    unit_prices = {
        'A1': 10.0, 'A2': 14.0, 'A3': 5.0, 'A4': 70.0, 'A5': 40.0, 'A6': 5.0,
        'B1': 5.0, 'B2': 3.0, 'B3': 30.0,
        'C1': 70.0, 'C2': 20.0, 'C3': 40.0, 'C4': 30.0,
    }
    
    total_planned_cost = 0.0
    total_earned_value = 0.0
    
    for item in items:
        price = unit_prices.get(item.boq_code, 0.0)
        planned_qty = item.planned_qty or 0.0
        achieved_qty = item.achieved_qty or 0.0
        total_planned_cost += (planned_qty * price)
        total_earned_value += (achieved_qty * price)
    
    if total_planned_cost > 0:
        latrine.overall_pct = round((total_earned_value / total_planned_cost) * 100, 2)
    else:
        latrine.overall_pct = 0.0
        
    if latrine.overall_pct >= 99.9:
        latrine.status = 'completed'
    elif latrine.overall_pct > 0:
        latrine.status = 'in_progress'
    else:
        latrine.status = 'not_started'
        
    db.commit()

def create_remark(db: Session, remark: schemas.RemarkCreate):
    db_remark = models.Remark(**remark.dict())
    db.add(db_remark)
    db.commit()
    db.refresh(db_remark)
    latrine = get_latrine(db, remark.latrine_id)
    if latrine:
        count = db.query(models.Remark).filter(
            models.Remark.latrine_id == remark.latrine_id,
            models.Remark.status.in_(['open', 'overdue'])
        ).count()
        latrine.remarks_count = count
        db.commit()
    return db_remark

def get_remarks(db: Session, latrine_id: int = None, status: str = None):
    query = db.query(models.Remark)
    if latrine_id:
        query = query.filter(models.Remark.latrine_id == latrine_id)
    if status:
        query = query.filter(models.Remark.status == status)
    return query.all()

def update_remark(db: Session, remark_id: int, updates: schemas.RemarkUpdate):
    remark = db.query(models.Remark).filter(models.Remark.id == remark_id).first()
    if not remark:
        return None
    for key, value in updates.dict(exclude_unset=True).items():
        setattr(remark, key, value)
    db.commit()
    db.refresh(remark)
    return remark

# ---------- Daily Log CRUD (جديد) ----------
def create_daily_log(db: Session, log: schemas.DailyLogCreate):
    db_log = models.DailyLog(**log.dict())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def get_daily_logs(db: Session, skip: int = 0, limit: int = 30, from_date: datetime = None, to_date: datetime = None):
    query = db.query(models.DailyLog)
    if from_date:
        query = query.filter(models.DailyLog.date >= from_date)
    if to_date:
        query = query.filter(models.DailyLog.date <= to_date)
    return query.order_by(models.DailyLog.date.desc()).offset(skip).limit(limit).all()

def get_daily_log_stats(db: Session, target_date: datetime):
    """حساب إحصائيات تلقائية من البيانات الموجودة"""
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    # عدد البنود التي تم فحصها اليوم (لها inspection_date)
    inspected = db.query(models.BoqItem).filter(
        models.BoqItem.inspection_date >= start_of_day,
        models.BoqItem.inspection_date <= end_of_day
    ).count()
    
    # عدد البنود المقبولة اليوم
    accepted = db.query(models.BoqItem).filter(
        models.BoqItem.quality_pass == 'pass',
        models.BoqItem.inspection_date >= start_of_day,
        models.BoqItem.inspection_date <= end_of_day
    ).count()
    
    # عدد الملاحظات المُنشأة اليوم
    remarks = db.query(models.Remark).filter(
        models.Remark.date_logged >= start_of_day,
        models.Remark.date_logged <= end_of_day
    ).count()
    
    return schemas.DailyLogStats(
        latrines_inspected=inspected,
        latrines_accepted=accepted,
        remarks_issued=remarks
    )

# ---------- Dashboard ----------
def get_dashboard_summary(db: Session):
    total = db.query(models.Latrine).count()
    completed = db.query(models.Latrine).filter(models.Latrine.status == 'completed').count()
    in_progress = db.query(models.Latrine).filter(models.Latrine.status == 'in_progress').count()
    not_started = db.query(models.Latrine).filter(models.Latrine.status == 'not_started').count()
    accepted = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'pass').count()
    rejected = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'fail').count()
    open_rem = db.query(models.Remark).filter(models.Remark.status == 'open').count()
    overdue_rem = db.query(models.Remark).filter(models.Remark.status == 'overdue').count()
    avg_progress = db.query(func.avg(models.Latrine.overall_pct)).scalar() or 0.0
    return schemas.DashboardSummary(
        total_latrines=total,
        completed=completed,
        in_progress=in_progress,
        not_started=not_started,
        accepted_items=accepted,
        rejected_items=rejected,
        open_remarks=open_rem,
        overdue_remarks=overdue_rem,
        overall_progress_pct=round(float(avg_progress), 2)
    )

def get_category_progress(db: Session):
    result = db.query(
        models.BoqItem.category,
        func.avg(models.BoqItem.achievement_pct).label('avg_pct')
    ).group_by(models.BoqItem.category).all()
    return [schemas.CategoryProgress(category=r[0], avg_achievement_pct=round(float(r[1] or 0), 2)) for r in result]

def seed_boq_items(db: Session, latrine_id: int):
    items = [
        {'boq_code': 'A1', 'category': 'A-Building & Concrete', 'description_ar': 'حفر وتسوية + أساس حجر', 'description_en': 'Excavation & Stone Foundation', 'unit': 'm3', 'planned_qty': 1.00},
        {'boq_code': 'A2', 'category': 'A-Building & Concrete', 'description_ar': 'جدران بلك مفرغ 15سم', 'description_en': 'Hollow Block Wall', 'unit': 'm2', 'planned_qty': 9.32},
        {'boq_code': 'A3', 'category': 'A-Building & Concrete', 'description_ar': 'لياسة داخلية وخارجية', 'description_en': 'Plaster', 'unit': 'm2', 'planned_qty': 3.20},
        {'boq_code': 'A4', 'category': 'A-Building & Concrete', 'description_ar': 'سقف خرسانة مسلحة', 'description_en': 'RC Roof', 'unit': 'Lum', 'planned_qty': 1.00},
        {'boq_code': 'A5', 'category': 'A-Building & Concrete', 'description_ar': 'كرسي عربي + كوع ريحة', 'description_en': 'Pan + UPVC', 'unit': 'No', 'planned_qty': 1.00},
        {'boq_code': 'A6', 'category': 'A-Building & Concrete', 'description_ar': 'بلاط موزايكو', 'description_en': 'Mosaic Tiles', 'unit': 'm2', 'planned_qty': 1.32},
        {'boq_code': 'B1', 'category': 'B-Septic & Pipes', 'description_ar': 'حفر بيارة قطر 1م', 'description_en': 'Septic Excavation', 'unit': 'm3', 'planned_qty': 2.00},
        {'boq_code': 'B2', 'category': 'B-Septic & Pipes', 'description_ar': 'تمديد UPVC 4 انش + تهوية', 'description_en': 'UPVC Drainage', 'unit': 'LM', 'planned_qty': 12.00},
        {'boq_code': 'B3', 'category': 'B-Septic & Pipes', 'description_ar': 'غطاء بيارة خرساني', 'description_en': 'Septic Cover', 'unit': 'No', 'planned_qty': 1.00},
        {'boq_code': 'C1', 'category': 'C-Doors & Windows', 'description_ar': 'باب حديد صاج', 'description_en': 'Steel Door', 'unit': 'No', 'planned_qty': 1.00},
        {'boq_code': 'C2', 'category': 'C-Doors & Windows', 'description_ar': 'نافذة ألمنيوم', 'description_en': 'Aluminum Window', 'unit': 'No', 'planned_qty': 1.00},
        {'boq_code': 'C3', 'category': 'C-Doors & Windows', 'description_ar': 'إضاءة شمسية 10واط', 'description_en': 'Solar Light', 'unit': 'No', 'planned_qty': 1.00},
        {'boq_code': 'C4', 'category': 'C-Doors & Windows', 'description_ar': 'لوحة معدنية + شعار', 'description_en': 'Logo Plate', 'unit': 'No', 'planned_qty': 1.00},
    ]
    for item in items:
        db_item = models.BoqItem(latrine_id=latrine_id, **item)
        db.add(db_item)
    db.commit()

# ---------- Sync Engine Processor (مُحدّث ومصحّح) ----------
def process_sync_queue(db: Session, sync_req: schemas.SyncRequest) -> schemas.SyncResponse:
    processed = []
    failed = []
    errors = {}
    latrines_to_recalc = set()

    # Transaction واحدة لكل batch — كل أو لا شيء
    try:
        for op in sync_req.operations:
            try:
                if op.type == "UPDATE_BOQ":
                    item_id = op.data.get("id")
                    item = db.query(models.BoqItem).filter(models.BoqItem.id == item_id).first()
                    if item:
                        for key, value in op.data.items():
                            if hasattr(item, key) and key != "id":
                                setattr(item, key, value)
                        if item.planned_qty and item.planned_qty > 0:
                            item.achievement_pct = round((item.achieved_qty / item.planned_qty) * 100, 2)
                        item.last_update = op.timestamp
                        latrines_to_recalc.add(item.latrine_id)
                        processed.append(op.id)
                    else:
                        failed.append(op.id)
                        errors[op.id] = "BoQ item not found"

                elif op.type == "CREATE_REMARK":
                    remark_data = op.data.copy()
                    local_uuid = remark_data.pop('local_uuid', None)
                    local_id = remark_data.pop('local_id', None)
                    
                    # التحقق من وجود latrine_id
                    latrine_id = remark_data.get("latrine_id")
                    if not latrine_id:
                        failed.append(op.id)
                        errors[op.id] = "Missing latrine_id"
                        continue
                    
                    # التحقق من عدم التكرار (idempotency)
                    if local_uuid:
                        existing = db.query(models.Remark).filter(
                            models.Remark.remark_id == local_uuid
                        ).first()
                        if existing:
                            # Remark موجود مسبقاً — تخطي الإنشاء
                            processed.append(op.id)
                            continue
                    
                    new_remark = models.Remark(**remark_data)
                    new_remark.date_logged = op.timestamp
                    if local_uuid:
                        new_remark.remark_id = local_uuid
                    
                    db.add(new_remark)
                    db.flush()  # للحصول على ID
                    processed.append(op.id)
                    latrines_to_recalc.add(latrine_id)

                elif op.type == "UPDATE_REMARK":
                    local_uuid = op.data.get("local_uuid")
                    remark = None
                    
                    if local_uuid:
                        remark = db.query(models.Remark).filter(
                            models.Remark.remark_id == local_uuid
                        ).first()
                    
                    if not remark and op.data.get("id"):
                        remark = db.query(models.Remark).filter(
                            models.Remark.id == op.data.get("id")
                        ).first()
                    
                    if remark:
                        for key, value in op.data.items():
                            if hasattr(remark, key) and key not in ["id", "local_uuid"]:
                                setattr(remark, key, value)
                        remark.last_update = op.timestamp
                        processed.append(op.id)
                    else:
                        failed.append(op.id)
                        errors[op.id] = "Remark not found"

                elif op.type == "UPDATE_LATRINE":
                    latrine_id = op.data.get("id")
                    latrine = db.query(models.Latrine).filter(models.Latrine.id == latrine_id).first()
                    if latrine:
                        for key, value in op.data.items():
                            if hasattr(latrine, key) and key != "id":
                                setattr(latrine, key, value)
                        latrine.last_update = op.timestamp
                        processed.append(op.id)
                    else:
                        failed.append(op.id)
                        errors[op.id] = "Latrine not found"

            except Exception as e:
                failed.append(op.id)
                errors[op.id] = str(e)
                # لا نفعل rollback هنا — نستمر لجمع كل الأخطاء

        # commit واحد في النهاية
        db.commit()
        
        # إعادة الحساب بعد الـcommit الناجح
        for lid in latrines_to_recalc:
            if lid:
                recalc_latrine_progress(db, lid)

    except Exception as e:
        db.rollback()
        # إذا فشل الـcommit الكلي، جميعهم فاشلون
        all_ids = [op.id for op in sync_req.operations]
        failed = list(set(all_ids) - set(processed))
        for op_id in failed:
            if op_id not in errors:
                errors[op_id] = f"Batch transaction failed: {str(e)}"

    return schemas.SyncResponse(
        processed_ids=processed,
        failed_ids=failed,
        errors=errors
    )
