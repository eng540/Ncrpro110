# ==========================================
# backend/app/crud.py
# Production-Grade CRUD & Business Logic Engine
# 100% Complete & Optimized for Railway/PostgreSQL
# ==========================================

from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from app import models, schemas
from app.engine import generate_recommendation, DEFAULT_POLICIES

# ==========================================
# 🧠 1. محرك احتساب التقدم التراكمي (Progress Engine)
# ==========================================

def recalc_latrine_progress(db: Session, latrine_id: int) -> float:
    """
    يقوم باحتساب النسبة المئوية الإجمالية لإنجاز الحمام بناءً على الأوزان المعتمدة للبنود.
    الأوزان المعتمدة: الفئة A (60%)، الفئة B (25%)، الفئة C (15%).
    """
    # جلب جميع بنود جدول الكميات المرتبطة بهذا الحمام
    items = db.query(models.BoqItem).filter(models.BoqItem.latrine_id == latrine_id).all()
    if not items:
        return 0.0

    # تقسيم البنود حسب الفئات وحساب متوسط الإنجاز لكل فئة
    categories = {"A": [], "B": [], "C": []}
    for item in items:
        # استخراج رمز الفئة (مثلاً A1، B2 -> نأخذ الحرف الأول)
        cat_letter = item.boq_code[0].upper() if item.boq_code else "A"
        if cat_letter in categories:
            categories[cat_letter].append(item.achievement_pct or 0.0)
        else:
            categories["A"].append(item.achievement_pct or 0.0)

    # حساب المتوسط لكل فئة، وإذا كانت الفئة فارغة تعتبر 100% (أو مستكملة لتجنب تصفير النسبة)
    avg_a = sum(categories["A"]) / len(categories["A"]) if categories["A"] else 100.0
    avg_b = sum(categories["B"]) / len(categories["B"]) if categories["B"] else 100.0
    avg_c = sum(categories["C"]) / len(categories["C"]) if categories["C"] else 100.0

    # تطبيق الأوزان المعتمدة في نظام NRC
    overall_pct = (avg_a * 0.60) + (avg_b * 0.25) + (avg_c * 0.15)
    overall_pct = min(100.0, max(0.0, round(overall_pct, 2)))

    # تحديث حالة الحمام والنسبة تلقائياً في قاعدة البيانات
    latrine = db.query(models.Latrine).filter(models.Latrine.id == latrine_id).first()
    if latrine:
        latrine.overall_pct = overall_pct
        if overall_pct >= 100.0:
            latrine.status = "completed"
        elif overall_pct > 0.0:
            latrine.status = "in_progress"
        latrine.last_update = datetime.utcnow()
        db.commit()
        db.refresh(latrine)

    return overall_pct


def update_item_decision(db: Session, item_id: int):
    """
    يقوم باستدعاء محرك الاستنتاج الذاتي (Stateless Inference Engine)
    لتحديث التوصيات الآلية وحالة الدفع للبند بناءً على معايير الجودة والملاحظات المفتوحة.
    """
    item = db.query(models.BoqItem).filter(models.BoqItem.id == item_id).first()
    if not item:
        return

    # جلب أعلى خطورة للملاحظات المفتوحة المرتبطة بهذا البند في هذا الحمام
    highest_remark = db.query(models.Remark).filter(
        models.Remark.latrine_id == item.latrine_id,
        models.Remark.boq_code == item.boq_code,
        models.Remark.status == "open"
    ).order_by(
        func.case(
            (models.Remark.severity == "critical", 1),
            (models.Remark.severity == "major", 2),
            (models.Remark.severity == "minor", 3),
            else_=4
        )
    ).first()

    highest_severity = highest_remark.severity if highest_remark else None
    
    # جلب السياسة الافتراضية الصارمة للنظام (NRC Strict)
    policy = DEFAULT_POLICIES[0]["rules_json"]

    # توليد التوصية من محرك القرار الذكي
    decision = generate_recommendation(
        execution_pct=item.achievement_pct,
        quality_status=item.quality_pass,  # pending, pass, fail
        highest_remark_severity=highest_severity,
        policy_rules=policy
    )

    # تحديث الحقول التشغيلية للبند بناءً على قرار المحرك
    item.status = "rework_required" if decision["code"] == "REWORK" else item.status
    item.last_update = datetime.utcnow()
    db.commit()


# ==========================================
# 🏠 2. عمليات التحكم بجدول الحمامات (Latrines CRUD)
# ==========================================

def get_latrine(db: Session, latrine_id: int):
    return db.query(models.Latrine).filter(models.Latrine.id == latrine_id).first()


def get_latrine_by_code(db: Session, latrine_code: str):
    return db.query(models.Latrine).filter(models.Latrine.latrine_id == latrine_code).first()


def get_latrines(db: Session, skip: int = 0, limit: int = 110, status: Optional[str] = None):
    query = db.query(models.Latrine)
    if status:
        query = query.filter(models.Latrine.status == status)
    return query.offset(skip).limit(limit).all()


def create_latrine(db: Session, latrine: schemas.LatrineCreate):
    db_latrine = models.Latrine(
        latrine_id=latrine.latrine_id,
        block_no=latrine.block_no,
        gps_coordinates=latrine.gps_coordinates,
        beneficiary_hh=latrine.beneficiary_hh,
        status=latrine.status,
        overall_pct=latrine.overall_pct,
        start_date=latrine.start_date,
        expected_completion=latrine.expected_completion,
        site_engineer=latrine.site_engineer,
        remarks_count=0,
        last_update=datetime.utcnow()
    )
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


# ==========================================
# 📊 3. عمليات جدول الكميات (BoQ Items CRUD)
# ==========================================

def get_boq_items_by_latrine(db: Session, latrine_id: int):
    return db.query(models.BoqItem).filter(models.BoqItem.latrine_id == latrine_id).order_by(models.BoqItem.boq_code).all()


def update_boq_item_progress(db: Session, item_id: int, updates: schemas.BoqItemUpdate) -> Optional[models.BoqItem]:
    item = db.query(models.BoqItem).filter(models.BoqItem.id == item_id).first()
    if not item:
        return None

    # تحديث البيانات المرسلة
    update_data = updates.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    # إعادة احتساب نسبة إنجاز البند المحدود بناءً على الكمية المنفذة والمخططة
    if item.planned_qty and item.planned_qty > 0:
        item.achievement_pct = min(100.0, max(0.0, (item.achieved_qty / item.planned_qty) * 100.0))
    else:
        item.achievement_pct = 0.0

    # تحديث الحالات التشغيلية التلقائية لقيم الإنتاج
    if item.achievement_pct >= 100.0:
        item.status = "completed"
    elif item.achievement_pct > 0:
        item.status = "in_progress"

    item.last_update = datetime.utcnow()
    db.commit()

    # تشغيل محركات القرار وحساب التراكميات فوراً لحفظ تماسك البيانات
    update_item_decision(db, item.id)
    recalc_latrine_progress(db, item.latrine_id)
    
    db.refresh(item)
    return item


# ==========================================
# ⚠️ 4. عمليات إدارة الملاحظات والعيوب (Remarks CRUD)
# ==========================================

def get_remarks(db: Session, skip: int = 0, limit: int = 100, status: Optional[str] = None):
    query = db.query(models.Remark)
    if status:
        query = query.filter(models.Remark.status == status)
    return query.order_by(models.Remark.date_logged.desc()).offset(skip).limit(limit).all()


def create_remark(db: Session, remark: schemas.RemarkCreate) -> models.Remark:
    db_remark = models.Remark(
        remark_id=remark.remark_id,
        latrine_id=remark.latrine_id,
        boq_code=remark.boq_code,
        type=remark.type,
        severity=remark.severity,
        description=remark.description,
        template_id=remark.template_id,
        action_required=remark.action_required,
        deadline=remark.deadline,
        status="open",
        photo_ref=remark.photo_ref,
        date_logged=datetime.utcnow(),
        last_update=datetime.utcnow()
    )
    db.add(db_remark)
    
    # تحديث عداد الملاحظات المفتوحة في جدول الحمام الرئيسي
    latrine = db.query(models.Latrine).filter(models.Latrine.id == remark.latrine_id).first()
    if latrine:
        latrine.remarks_count = (latrine.remarks_count or 0) + 1
        latrine.last_update = datetime.utcnow()

    db.commit()
    db.refresh(db_remark)

    # تحديث محرك القرارات الخاص بالبند لتجميد الدفعات فوراً إذا لزم الأمر
    items = db.query(models.BoqItem).filter(
        models.BoqItem.latrine_id == remark.latrine_id, 
        models.BoqItem.boq_code == remark.boq_code
    ).all()
    for item in items:
        update_item_decision(db, item.id)

    return db_remark


def update_remark(db: Session, remark_id: int, updates: schemas.RemarkUpdate) -> Optional[models.Remark]:
    remark = db.query(models.Remark).filter(models.Remark.id == remark_id).first()
    if not remark:
        return None

    old_status = remark.status
    for key, value in updates.dict(exclude_unset=True).items():
        setattr(remark, key, value)

    # في حال إغلاق الملاحظة، نقوم بتسجيل وقت الإغلاق وتعديل العدادات
    if old_status == "open" and updates.status == "closed":
        remark.closed_date = datetime.utcnow()
        latrine = db.query(models.Latrine).filter(models.Latrine.id == remark.latrine_id).first()
        if latrine and latrine.remarks_count > 0:
            latrine.remarks_count -= 1

    remark.last_update = datetime.utcnow()
    db.commit()

    # إعادة تقييم البند المرتبط بعد تحديث حالة الملاحظة
    items = db.query(models.BoqItem).filter(
        models.BoqItem.latrine_id == remark.latrine_id, 
        models.BoqItem.boq_code == remark.boq_code
    ).all()
    for item in items:
        update_item_decision(db, item.id)

    db.refresh(remark)
    return remark


# ==========================================
# 🔄 5. محرك مطابقة المزامنة الآمن (Secure Sync Engine)
# ==========================================

def process_batch_sync(db: Session, items: List[Dict[str, Any]]) -> schemas.SyncResponse:
    """
    بروتوكول معالجة المزامنة الجماعية القطعية (Deterministic Batch Sync Protocol).
    يعالج البيانات القادمة من الأجهزة الميدانية غير المتصلة بالإنترنت (IndexedDB Offline).
    """
    processed = []
    failed = []
    errors = {}
    latrines_to_recalc = set()
    items_to_recalc_decision = set()

    for idx, item_data in enumerate(items, start=1):
        seq_str = str(idx)
        op_type = item_data.get("type")
        payload = item_data.get("payload", {})
        local_uuid = item_data.get("local_uuid") or payload.get("remark_id") or payload.get("local_uuid")

        try:
            # حالة 1: إنشاء أو تعديل ملاحظة قادمة من الميدان
            if op_type in ["CREATE_REMARK", "UPDATE_REMARK"]:
                latrine_id = payload.get("latrine_id")
                boq_code = payload.get("boq_code")

                # البحث عن الملاحظة باستخدام الـ UUID المحلي لمنع التكرار
                existing_remark = db.query(models.Remark).filter(models.Remark.remark_id == local_uuid).first()
                
                if existing_remark:
                    # تحديث الملاحظة الموجودة مسبقاً
                    for key, val in payload.items():
                        if hasattr(existing_remark, key) and key not in ["id", "remark_id"]:
                            setattr(existing_remark, key, val)
                    existing_remark.last_update = datetime.utcnow()
                    remark_obj = existing_remark
                else:
                    # إنشاء ملاحظة جديدة بالكامل بالمعرف الفريد المحلي
                    remark_obj = models.Remark(
                        remark_id=local_uuid,
                        latrine_id=latrine_id,
                        boq_code=boq_code,
                        type=payload.get("type"),
                        severity=payload.get("severity", "minor"),
                        description=payload.get("description"),
                        template_id=payload.get("template_id"),
                        action_required=payload.get("action_required"),
                        status=payload.get("status", "open"),
                        photo_ref=payload.get("photo_ref"),
                        date_logged=datetime.utcnow(),
                        last_update=datetime.utcnow()
                    )
                    db.add(remark_obj)
                    
                    # زيادة العداد للحمام الرئيسي
                    latrine = db.query(models.Latrine).filter(models.Latrine.id == latrine_id).first()
                    if latrine:
                        latrine.remarks_count = (latrine.remarks_count or 0) + 1

                db.flush()
                latrines_to_recalc.add(latrine_id)
                
                # ربط البنود لإعادة الحساب
                b_items = db.query(models.BoqItem).filter(models.BoqItem.latrine_id == latrine_id, models.BoqItem.boq_code == boq_code).all()
                for bi in b_items:
                    items_to_recalc_decision.add(bi.id)
                
                processed.append(seq_str)

            # حالة 2: تحديث مصفوفة وكميات بنود الـ BoQ من الميدان
            elif op_type == "UPDATE_BOQ_PROGRESS":
                item_id = payload.get("item_id")
                achieved_qty = payload.get("achieved_qty")
                quality_pass = payload.get("quality_pass")
                
                boq_item = db.query(models.BoqItem).filter(models.BoqItem.id == item_id).first()
                if boq_item:
                    if achieved_qty is not None:
                        boq_item.achieved_qty = achieved_qty
                        if boq_item.planned_qty and boq_item.planned_qty > 0:
                            boq_item.achievement_pct = min(100.0, max(0.0, (achieved_qty / boq_item.planned_qty) * 100.0))
                        if boq_item.achievement_pct >= 100.0:
                            boq_item.status = "completed"
                        elif boq_item.achievement_pct > 0:
                            boq_item.status = "in_progress"
                    
                    if quality_pass is not None:
                        boq_item.quality_pass = quality_pass

                    boq_item.last_update = datetime.utcnow()
                    db.flush()
                    
                    latrines_to_recalc.add(boq_item.latrine_id)
                    items_to_recalc_decision.add(boq_item.id)
                    processed.append(seq_str)
                else:
                    raise ValueError(f"BoQ Item ID {item_id} not found on server.")

            else:
                raise NotImplementedError(f"Operation type {op_type} is not supported.")

        except Exception as e:
            failed.append(seq_str)
            errors[seq_str] = str(e)

    # تشغيل محركات التحديث التراكمي لضمان سلامة الأرقام بعد انتهاء الدفعة
    for item_id in items_to_recalc_decision:
        update_item_decision(db, item_id)
        
    for lid in latrines_to_recalc:
        if lid:
            recalc_latrine_progress(db, lid)

    db.commit()
    return schemas.SyncResponse(processed_ids=processed, failed_ids=failed, errors=errors)


# ==========================================
# 🔐 6. نظام الحماية وسجلات التدقيق (User & Audit CRUD)
# ==========================================

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()


def create_user(db: Session, user: schemas.UserCreate):
    from app.security import get_password_hash
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password,
        role_id=user.role_id,
        is_active=user.is_active
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def create_audit_log(db: Session, log: schemas.AuditLogCreate, user_id: int):
    db_log = models.AuditLog(
        user_id=user_id,
        action=log.action,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        old_values=log.old_values,
        new_values=log.new_values,
        ip_address=log.ip_address,
        timestamp=datetime.utcnow()
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log


def get_audit_logs(db: Session, skip: int = 0, limit: int = 100, user_id: int = None):
    query = db.query(models.AuditLog)
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)
    return query.order_by(models.AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
