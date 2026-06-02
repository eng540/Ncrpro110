import json
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app import models, schemas
from app.engine import generate_recommendation, DEFAULT_POLICIES
from datetime import datetime, timedelta

# ==========================================
#  USER & AUDIT CRUD (AUTH-PATCH inserted)
# ==========================================

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

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

def update_user(db: Session, user_id: int, updates: schemas.UserUpdate):
    user = get_user(db, user_id)
    if not user:
        return None
    update_data = updates.dict(exclude_unset=True)
    if "password" in update_data:
        from app.security import get_password_hash
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))
    for key, value in update_data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user

def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username(db, username)
    if not user:
        return None
    from app.security import verify_password
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user

def update_last_login(db: Session, user_id: int):
    user = get_user(db, user_id)
    if user:
        user.last_login = datetime.utcnow()
        db.commit()

def create_audit_log(db: Session, log: schemas.AuditLogCreate, user_id: int):
    db_log = models.AuditLog(
        user_id=user_id,
        action=log.action,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        old_values=log.old_values,
        new_values=log.new_values,
        ip_address=log.ip_address
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def get_audit_logs(db: Session, skip: int = 0, limit: int = 100, user_id: int = None, action: str = None):
    query = db.query(models.AuditLog)
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)
    if action:
        query = query.filter(models.AuditLog.action == action)
    return query.order_by(models.AuditLog.timestamp.desc()).offset(skip).limit(limit).all()

def seed_default_admin(db: Session):
    import os
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_password:
        # لا ننشئ admin إذا لم تُحدد كلمة السر في البيئة (آمن)
        return
    existing = get_user_by_username(db, admin_username)
    if existing:
        # تحديث placeholder إذا كان موجوداً وغير نشط
        if existing.email == "admin@nrc.org" and existing.full_name == "Placeholder" and not existing.is_active:
            from app.security import get_password_hash
            existing.hashed_password = get_password_hash(admin_password)
            existing.is_active = True
            existing.username = admin_username
            db.commit()
        return
    admin_role = db.query(models.Role).filter(models.Role.name == "admin").first()
    if not admin_role:
        return
    from app.security import get_password_hash
    admin_user = models.User(
        username=admin_username,
        email=os.getenv("ADMIN_EMAIL", f"{admin_username}@nrc.org"),
        full_name="System Administrator",
        hashed_password=get_password_hash(admin_password),
        role_id=admin_role.id,
        is_active=True
    )
    db.add(admin_user)
    db.commit()

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

# ...(rest of file unchanged)...
