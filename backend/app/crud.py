import json
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app import models, schemas
from app.engine import generate_recommendation, DEFAULT_POLICIES
from datetime import datetime, timedelta

# ==========================================
#  LATRINE CRUD
# ==========================================
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

# ==========================================
#  BOQ ITEMS CRUD
# ==========================================
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

# ==========================================
#  REMARKS CRUD
# ==========================================
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

# ==========================================
#  DAILY LOG CRUD
# ==========================================
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
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)

    inspected = db.query(models.BoqItem).filter(
        models.BoqItem.inspection_date >= start_of_day,
        models.BoqItem.inspection_date <= end_of_day
    ).count()

    accepted = db.query(models.BoqItem).filter(
        models.BoqItem.quality_pass == 'pass',
        models.BoqItem.inspection_date >= start_of_day,
        models.BoqItem.inspection_date <= end_of_day
    ).count()

    remarks = db.query(models.Remark).filter(
        models.Remark.date_logged >= start_of_day,
        models.Remark.date_logged <= end_of_day
    ).count()

    return schemas.DailyLogStats(
        latrines_inspected=inspected,
        latrines_accepted=accepted,
        remarks_issued=remarks
    )

# ==========================================
#  DASHBOARD
# ==========================================
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

# ==========================================
#  BOQ DICTIONARY CRUD
# ==========================================
def get_boq_dictionary(db: Session):
    return db.query(models.BoqDictionary).filter(models.BoqDictionary.is_active == True).all()

def get_boq_dictionary_item(db: Session, boq_code: str):
    return db.query(models.BoqDictionary).filter(models.BoqDictionary.boq_code == boq_code).first()

def create_boq_dictionary_item(db: Session, item: schemas.BoqDictionaryCreate):
    db_item = models.BoqDictionary(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

def update_boq_dictionary_item(db: Session, boq_code: str, updates: schemas.BoqDictionaryUpdate):
    item = db.query(models.BoqDictionary).filter(models.BoqDictionary.boq_code == boq_code).first()
    if not item:
        return None
    for key, value in updates.dict(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item

def delete_boq_dictionary_item(db: Session, boq_code: str):
    item = db.query(models.BoqDictionary).filter(models.BoqDictionary.boq_code == boq_code).first()
    if not item:
        return None
    item.is_active = False
    db.commit()
    return item

def seed_boq_items(db: Session, latrine_id: int):
    dictionary = get_boq_dictionary(db)

    if not dictionary:
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
    else:
        items = [
            {
                'boq_code': d.boq_code,
                'category': d.category,
                'description_ar': d.description_ar,
                'description_en': d.description_en,
                'unit': d.unit,
                'planned_qty': d.default_qty
            }
            for d in dictionary
        ]

    for item in items:
        db_item = models.BoqItem(latrine_id=latrine_id, **item)
        db.add(db_item)
    db.commit()

# ==========================================
#  GOVERNANCE & DECISION ENGINE
# ==========================================
def seed_default_policies(db: Session):
    existing_names = {p.name for p in db.query(models.PolicyProfile.name).all()}
    new_policies = []
    for policy in DEFAULT_POLICIES:
        if policy["name"] not in existing_names:
            new_policies.append(models.PolicyProfile(**policy))
    if new_policies:
        db.bulk_save_objects(new_policies)
        db.commit()

def update_item_decision(db: Session, boq_item_id: int):
    item = db.query(models.BoqItem).filter(models.BoqItem.id == boq_item_id).first()
    if not item:
        return

    latrine = db.query(models.Latrine).filter(models.Latrine.id == item.latrine_id).first()

    seed_default_policies(db)

    policy = None
    if latrine.policy_id:
        policy = db.query(models.PolicyProfile).filter(models.PolicyProfile.id == latrine.policy_id).first()
    if not policy:
        policy = db.query(models.PolicyProfile).filter(models.PolicyProfile.is_default == True).first()

    if not policy:
        return

    open_remarks = db.query(models.Remark).filter(
        models.Remark.latrine_id == item.latrine_id,
        models.Remark.boq_code == item.boq_code,
        models.Remark.status == 'open'
    ).all()

    highest_severity = None
    if open_remarks:
        severities = [r.severity for r in open_remarks]
        if 'critical' in severities:
            highest_severity = 'critical'
        elif 'major' in severities:
            highest_severity = 'major'
        else:
            highest_severity = 'minor'

    recommendation = generate_recommendation(
        execution_pct=item.achievement_pct,
        quality_status=item.quality_pass,
        highest_remark_severity=highest_severity,
        policy_rules=policy.rules_json
    )

    decision = db.query(models.DecisionRecord).filter(models.DecisionRecord.boq_item_id == item.id).first()
    if not decision:
        decision = models.DecisionRecord(boq_item_id=item.id)
        db.add(decision)

    decision.execution_pct = item.achievement_pct
    decision.quality_status = item.quality_pass
    decision.highest_remark_severity = highest_severity

    decision.system_recommendation_code = recommendation["code"]
    decision.system_recommendation_note = recommendation["note"]
    decision.system_payment_pct = recommendation["payment_pct"]

    if not decision.human_decision_code:
        decision.final_state = "OPEN"

    db.commit()

def recalc_latrine_progress(db: Session, latrine_id: int):
    latrine = db.query(models.Latrine).filter(models.Latrine.id == latrine_id).with_for_update().first()
    if not latrine:
        return

    items = db.query(models.BoqItem).filter(models.BoqItem.latrine_id == latrine_id).all()
    if not items:
        return

    dictionary_items = db.query(models.BoqDictionary).filter(models.BoqDictionary.is_active == True).all()
    dynamic_prices = {item.boq_code: item.unit_price for item in dictionary_items}

    fallback_prices = {
        'A1': 10.0, 'A2': 14.0, 'A3': 5.0, 'A4': 70.0, 'A5': 40.0, 'A6': 5.0,
        'B1': 5.0, 'B2': 3.0, 'B3': 30.0,
        'C1': 70.0, 'C2': 20.0, 'C3': 40.0, 'C4': 30.0,
    }

    total_planned_cost = 0.0
    total_earned_value = 0.0
    total_physical_progress = 0.0

    for item in items:
        price = dynamic_prices.get(item.boq_code, fallback_prices.get(item.boq_code, 0.0))
        planned_qty = item.planned_qty or 0.0
        total_planned_cost += (planned_qty * price)

        achieved_qty = item.achieved_qty or 0.0
        total_physical_progress += (achieved_qty * price)

        decision = db.query(models.DecisionRecord).filter(models.DecisionRecord.boq_item_id == item.id).first()
        if decision:
            payment_pct = decision.human_payment_pct if decision.human_payment_pct is not None else decision.system_payment_pct
            total_earned_value += (planned_qty * (payment_pct / 100.0) * price)

    if total_planned_cost > 0:
        latrine.overall_pct = round((total_physical_progress / total_planned_cost) * 100, 2)
    else:
        latrine.overall_pct = 0.0

    if latrine.overall_pct >= 99.9:
        latrine.status = 'completed'
    elif latrine.overall_pct > 0:
        latrine.status = 'in_progress'
    else:
        latrine.status = 'not_started'

    db.commit()

def get_governance_items(db: Session, status_filter: str = None):
    query = db.query(models.DecisionRecord, models.BoqItem, models.Latrine)\
              .join(models.BoqItem, models.DecisionRecord.boq_item_id == models.BoqItem.id)\
              .join(models.Latrine, models.BoqItem.latrine_id == models.Latrine.id)

    if status_filter:
        query = query.filter(models.DecisionRecord.system_recommendation_code == status_filter)

    results = query.all()

    output = []
    for decision, item, latrine in results:
        output.append(schemas.GovernanceItemOut(
            decision_id=decision.id,
            boq_item_id=item.id,
            latrine_id=latrine.latrine_id,
            beneficiary_hh=latrine.beneficiary_hh,
            boq_code=item.boq_code,
            execution_pct=decision.execution_pct or 0.0,
            quality_status=decision.quality_status or "pending",
            highest_remark_severity=decision.highest_remark_severity,
            system_recommendation_code=decision.system_recommendation_code or "HOLD",
            system_recommendation_note=decision.system_recommendation_note,
            system_payment_pct=decision.system_payment_pct or 0.0,
            human_decision_code=decision.human_decision_code,
            human_payment_pct=decision.human_payment_pct,
            override_reason=decision.override_reason,
            final_state=decision.final_state or "OPEN"
        ))
    return output

def override_item_decision(db: Session, decision_id: int, override_data: schemas.DecisionOverrideUpdate):
    decision = db.query(models.DecisionRecord).filter(models.DecisionRecord.id == decision_id).first()
    if not decision:
        return None

    decision.human_decision_code = override_data.human_decision_code
    decision.human_payment_pct = override_data.human_payment_pct
    decision.override_reason = override_data.override_reason
    decision.approved_by = override_data.approved_by
    decision.approved_at = datetime.utcnow()
    decision.final_state = "LOCKED"

    db.commit()
    db.refresh(decision)

    item = db.query(models.BoqItem).filter(models.BoqItem.id == decision.boq_item_id).first()
    if item:
        recalc_latrine_progress(db, item.latrine_id)

    return decision

# ==========================================
#  SMART OBSERVATION ENGINE (قوالب الملاحظات)
# ==========================================
def get_remark_templates(db: Session):
    return db.query(models.RemarkTemplate).filter(models.RemarkTemplate.is_active == True).all()

def create_remark_template(db: Session, template: schemas.RemarkTemplateCreate):
    db_template = models.RemarkTemplate(**template.dict())
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

def update_remark_template(db: Session, template_code: str, updates: schemas.RemarkTemplateUpdate):
    template = db.query(models.RemarkTemplate).filter(
        models.RemarkTemplate.template_code == template_code
    ).with_for_update().first()
    if not template:
        return None
    for key, value in updates.dict(exclude_unset=True).items():
        setattr(template, key, value)
    template.version += 1
    db.commit()
    db.refresh(template)
    return template

def delete_remark_template(db: Session, template_code: str):
    template = db.query(models.RemarkTemplate).filter(
        models.RemarkTemplate.template_code == template_code
    ).first()
    if not template:
        return None
    template.is_active = False
    template.archived_at = datetime.utcnow()
    db.commit()
    return template

def seed_default_remark_templates(db: Session):
    default_templates = [
        {"template_code": "TPL-001", "title": "تطبيل في البلاط", "description": "وجود فراغات تحت البلاط تسبب صوتاً أجوفاً عند الطرق.", "default_action": "إزالة البلاط المطبل وإعادة تركيبه بمونة كافية.", "default_severity": "major", "boq_tags": ["A6"]},
        {"template_code": "TPL-002", "title": "تسريب مياه من التوصيلات", "description": "وجود تسريب مياه واضح من نقاط لحام المواسير أو المحابس.", "default_action": "فك الوصلة، وضع التيفلون/الغراء بشكل صحيح وإعادة الربط.", "default_severity": "critical", "boq_tags": ["B2", "E10"]},
        {"template_code": "TPL-003", "title": "عدم استواء اللياسة", "description": "سطح اللياسة غير مستوٍ ويظهر تموجات عند الفحص بالقدة.", "default_action": "صنفرة المناطق البارزة أو إعادة التلبيس للمناطق المعيبة.", "default_severity": "minor", "boq_tags": ["A3"]},
        {"template_code": "TPL-004", "title": "ميول غير كافٍ في الأرضية", "description": "تجمع مياه في أرضية الحمام بسبب عدم توجيه الميول نحو الصفاية.", "default_action": "إعادة تبليط الأرضية مع ضبط الميول بشكل صحيح.", "default_severity": "major", "boq_tags": ["A6"]},
        {"template_code": "GEN-001", "title": "مخلفات بناء في الموقع", "description": "ترك المقاول لمخلفات البناء والأنقاض داخل أو حول الحمام.", "default_action": "تنظيف الموقع بالكامل وترحيل المخلفات للمقالب المعتمدة.", "default_severity": "minor", "boq_tags": ["ALL"]},
        {"template_code": "GEN-002", "title": "عدم الالتزام بمعدات السلامة", "description": "العمال لا يرتدون معدات السلامة المهنية (خوذة، حذاء، قفازات).", "default_action": "إيقاف العمال المخالفين وتوفير معدات السلامة فوراً.", "default_severity": "major", "boq_tags": ["ALL"]},
    ]

    existing_codes = {t.template_code for t in db.query(models.RemarkTemplate.template_code).all()}

    new_templates = []
    for tpl in default_templates:
        if tpl["template_code"] not in existing_codes:
            new_templates.append(models.RemarkTemplate(**tpl, created_by="System Auto-Seeder"))

    if new_templates:
        db.bulk_save_objects(new_templates)
        db.commit()

# ==========================================
#  SYNC ENGINE PROCESSOR (مع تعقيم البيانات)
# ==========================================
def process_sync_queue(db: Session, sync_req: schemas.SyncRequest) -> schemas.SyncResponse:
    processed = []
    failed = []
    errors = {}
    latrines_to_recalc = set()
    items_to_recalc_decision = set()

    date_fields = {'closed_date', 'deadline', 'inspection_date', 'start_date', 'expected_completion', 'date_logged', 'date'}

    for op in sync_req.operations:
        try:
            op_data = op.payload

            if isinstance(op_data, str):
                try:
                    op_data = json.loads(op_data)
                except:
                    pass

            if isinstance(op_data, dict):
                for key in list(op_data.keys()):
                    if key in date_fields and isinstance(op_data[key], str):
                        try:
                            clean_date_str = op_data[key].replace('Z', '+00:00')
                            op_data[key] = datetime.fromisoformat(clean_date_str)
                        except ValueError:
                            pass

            if op.type == "UPDATE_BOQ":
                item_id = op_data.get("id")
                item = db.query(models.BoqItem).filter(models.BoqItem.id == item_id).first()
                if item:
                    for key, value in op_data.items():
                        if hasattr(item, key) and key != "id":
                            setattr(item, key, value)
                    if item.planned_qty and item.planned_qty > 0:
                        item.achievement_pct = round((item.achieved_qty / item.planned_qty) * 100, 2)
                    item.last_update = datetime.utcnow()
                    latrines_to_recalc.add(item.latrine_id)
                    items_to_recalc_decision.add(item.id)
                processed.append(op.seq)

            elif op.type == "CREATE_REMARK":
                remark_data = op_data.copy()
                local_uuid = remark_data.pop('local_uuid', None)
                remark_data.pop('sync_status', None)
                remark_data.pop('id', None)
                remark_data.pop('local_id', None)

                # 🌟 تعقيم البيانات: تحويل النصوص الفارغة إلى None لتفادي انتهاك القيد
                if remark_data.get('description') == "":
                    remark_data['description'] = None
                if remark_data.get('suffix_note') == "":
                    remark_data['suffix_note'] = None
                if remark_data.get('template_id') == "":
                    remark_data['template_id'] = None

                new_remark = models.Remark(**remark_data)
                new_remark.date_logged = datetime.utcnow()

                if local_uuid:
                    new_remark.remark_id = str(local_uuid)[:36]

                db.add(new_remark)
                db.flush()

                processed.append(op.seq)
                latrines_to_recalc.add(op_data.get("latrine_id"))

                if new_remark.boq_code:
                    related_item = db.query(models.BoqItem).filter(
                        models.BoqItem.latrine_id == new_remark.latrine_id,
                        models.BoqItem.boq_code == new_remark.boq_code
                    ).first()
                    if related_item:
                        items_to_recalc_decision.add(related_item.id)

            elif op.type == "UPDATE_REMARK":
                local_uuid = op_data.get("local_uuid")
                remark = None

                if local_uuid:
                    remark = db.query(models.Remark).filter(
                        models.Remark.remark_id == str(local_uuid)[:36]
                    ).first()

                if not remark and op_data.get("id"):
                    if int(op_data.get("id")) > 0:
                        remark = db.query(models.Remark).filter(
                            models.Remark.id == op_data.get("id")
                        ).first()

                if remark:
                    for key, value in op_data.items():
                        if hasattr(remark, key) and key not in ["id", "local_uuid", "sync_status", "local_id"]:
                            # 🌟 تعقيم البيانات: تحويل النصوص الفارغة للحقول الحساسة إلى None
                            if value == "" and key in ['description', 'suffix_note', 'template_id']:
                                value = None
                            setattr(remark, key, value)
                    remark.last_update = datetime.utcnow()
                    processed.append(op.seq)

                    if remark.boq_code:
                        related_item = db.query(models.BoqItem).filter(
                            models.BoqItem.latrine_id == remark.latrine_id,
                            models.BoqItem.boq_code == remark.boq_code
                        ).first()
                        if related_item:
                            items_to_recalc_decision.add(related_item.id)
                else:
                    failed.append(op.seq)
                    errors[str(op.seq)] = "Remark not found on server"

            elif op.type == "UPDATE_LATRINE":
                latrine_id = op_data.get("id")
                latrine = db.query(models.Latrine).filter(models.Latrine.id == latrine_id).first()
                if latrine:
                    for key, value in op_data.items():
                        if hasattr(latrine, key) and key != "id":
                            if isinstance(value, dict):
                                value = json.dumps(value)
                            setattr(latrine, key, value)
                    latrine.last_update = datetime.utcnow()
                processed.append(op.seq)

            elif op.type == "CREATE_DAILY_LOG":
                log_data = op_data.copy()
                log_data.pop('sync_status', None)
                log_data.pop('id', None)

                if 'notes' in log_data and isinstance(log_data['notes'], dict):
                    log_data['notes'] = json.dumps(log_data['notes'])

                new_log = models.DailyLog(**log_data)
                if not new_log.date:
                    new_log.date = datetime.utcnow()
                db.add(new_log)
                processed.append(op.seq)

            db.commit()

        except Exception as e:
            db.rollback()
            failed.append(op.seq)
            errors[str(op.seq)] = f"Error processing {op.type}: {str(e)}"

    for item_id in items_to_recalc_decision:
        update_item_decision(db, item_id)

    for lid in latrines_to_recalc:
        if lid:
            recalc_latrine_progress(db, lid)

    return schemas.SyncResponse(
        processed_ids=processed,
        failed_ids=failed,
        errors=errors
    )