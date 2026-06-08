# AUTH-PATCH 2026-06-02: إضافة OAuth2, RBAC, Audit Log, Rate Limiting, CORS مقيد (مصلح)
# 2026-06-03: إضافة endpoint /api/admin/roles
# 2026-06-03: إصلاح أمني – إضافة require_write_permission إلى /api/sync
# 2026-06-03: إضافة endpoint /api/evidence/presigned-url و /api/evidence/view لدعم الصور
# 2026-06-08: تعديل لدعم Cloudflare R2

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import os
from io import BytesIO
import openpyxl
from contextlib import asynccontextmanager
import logging
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import uuid

from app import models, schemas, crud, security
from app.database import engine, get_db, SessionLocal, Base
from app import reports

# ==========================================
# Rate Limiting (AUTH-PATCH)
# ==========================================
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

logger = logging.getLogger(__name__)

# ==========================================
# Lifespan with seeding (مصلح: يضمن وجود yield)
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        crud.seed_default_policies(db)
        crud.seed_default_remark_templates(db)
        crud.seed_default_admin(db)          # AUTH-PATCH
        print("Default policies, remark templates, and admin user seeded successfully.")
        yield   # هذا السطر ضروري جداً - بدونه لن يعمل التطبيق
    except Exception as e:
        print(f"Failed to seed defaults: {e}")
        # لا نعيد رفع الاستثناء لمنع فشل بدء التشغيل
    finally:
        db.close()

# ==========================================
# FastAPI App
# ==========================================
app = FastAPI(
    title="NRC Latrine Tracker",
    description="Dynamic SaaS Platform - Multi-Project WASH & Shelter Tracking",
    version="3.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# ==========================================
# Rate Limiter setup
# ==========================================
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ==========================================
# CORS (AUTH-PATCH: restricted origins)
# ==========================================
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://yourdomain.railway.app").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ==========================================
# CLOUDFLARE R2 (IMAGE STORAGE)
# ==========================================
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET_NAME", "nrc-latrine-evidence")
R2_ENDPOINT = os.getenv("R2_ENDPOINT_URL")
MAX_IMAGE_SIZE = int(os.getenv("MAX_IMAGE_SIZE_MB", 2)) * 1024 * 1024
ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

if R2_ACCESS_KEY and R2_SECRET_KEY and R2_ENDPOINT:
    s3_client = boto3.client('s3', endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY, aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version='s3v4'), region_name='auto')
else:
    s3_client = None

# ==========================================
# AUTHENTICATION ENDPOINTS (AUTH-PATCH)
# ==========================================
@app.post("/api/token", response_model=schemas.Token)
@limiter.limit("5/minute")
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        security.log_audit(db, None, "LOGIN_FAILED", request=request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    crud.update_last_login(db, user.id)
    access_token_expires = timedelta(hours=security.ACCESS_TOKEN_EXPIRE_HOURS)
    access_token = security.create_access_token(
        data={"sub": user.id, "role": user.role.name if user.role else "viewer"},
        expires_delta=access_token_expires
    )
    security.log_audit(db, user.id, "LOGIN_SUCCESS", request=request)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": schemas.UserOut.model_validate(user)
    }

@app.get("/api/me", response_model=schemas.UserOut)
async def read_current_user(current_user: models.User = Depends(security.get_current_active_user)):
    return current_user

# ==========================================
# USER MANAGEMENT (ADMIN ONLY)
# ==========================================
@app.post("/api/admin/users", response_model=schemas.UserOut)
async def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
    request: Request = None
):
    existing = crud.get_user_by_username(db, user.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    if user.email:
        existing_email = crud.get_user_by_email(db, user.email)
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already exists")
    new_user = crud.create_user(db, user)
    security.log_audit(db, current_user.id, "CREATE_USER", "user", new_user.id, new_values=user.dict(), request=request)
    return new_user

@app.get("/api/admin/users", response_model=List[schemas.UserOut])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    return db.query(models.User).offset(skip).limit(limit).all()

@app.patch("/api/admin/users/{user_id}", response_model=schemas.UserOut)
async def update_user(
    user_id: int,
    updates: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
    request: Request = None
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_values = {k: getattr(user, k) for k in updates.dict(exclude_unset=True).keys()}
    updated = crud.update_user(db, user_id, updates)
    security.log_audit(db, current_user.id, "UPDATE_USER", "user", user_id, old_values=old_values, new_values=updates.dict(exclude_unset=True), request=request)
    return updated

@app.get("/api/admin/audit-logs", response_model=List[schemas.AuditLogOut])
async def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    return crud.get_audit_logs(db, skip=skip, limit=limit, user_id=user_id, action=action)

# ==========================================
# ROLES ENDPOINT (لإدارة المستخدمين)
# ==========================================
@app.get("/api/admin/roles", response_model=List[schemas.RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    """إرجاع قائمة جميع الأدوار (للاستخدام في لوحة الإدارة)"""
    return db.query(models.Role).all()

# ==========================================
# HEALTH CHECK
# ==========================================
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "running", "version": "3.0.0", "mode": "dynamic_saas"}

# ==========================================
# LATRINES (محمية)
# ==========================================
@app.get("/api/latrines", response_model=List[schemas.LatrineOut])
def list_latrines(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    query = db.query(models.Latrine)
    if current_user.role and current_user.role.name == "engineer":
        query = query.filter(models.Latrine.assigned_engineer_id == current_user.id)
    if status:
        query = query.filter(models.Latrine.status == status)
    return query.offset(skip).limit(limit).all()

@app.get("/api/latrines/{latrine_id}", response_model=schemas.LatrineOut)
def get_latrine(
    latrine_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    latrine = crud.get_latrine(db, latrine_id)
    if not latrine:
        raise HTTPException(status_code=404, detail="Latrine not found")
    if current_user.role and current_user.role.name == "engineer":
        if latrine.assigned_engineer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not assigned to this latrine")
    return latrine

@app.post("/api/latrines", response_model=schemas.LatrineOut)
def create_latrine(
    latrine: schemas.LatrineCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_role(["latrines:write", "*"])),
    request: Request = None
):
    existing = crud.get_latrine_by_code(db, latrine.latrine_id)
    if existing:
        raise HTTPException(status_code=400, detail="Latrine ID already exists")
    db_latrine = crud.create_latrine(db, latrine)
    security.log_audit(db, current_user.id, "CREATE_LATRINE", "latrine", db_latrine.id, new_values=latrine.dict(), request=request)
    crud.seed_boq_items(db, db_latrine.id)
    return db_latrine

@app.patch("/api/latrines/{latrine_id}", response_model=schemas.LatrineOut)
def patch_latrine(
    latrine_id: int,
    updates: schemas.LatrineUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_role(["latrines:write", "*"])),
    request: Request = None
):
    existing = crud.get_latrine(db, latrine_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Latrine not found")
    if current_user.role and current_user.role.name == "engineer":
        if existing.assigned_engineer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not assigned to this latrine")
    old_values = {k: getattr(existing, k) for k in updates.dict(exclude_unset=True).keys()}
    latrine = crud.update_latrine(db, latrine_id, updates)
    security.log_audit(db, current_user.id, "UPDATE_LATRINE", "latrine", latrine_id, old_values=old_values, new_values=updates.dict(exclude_unset=True), request=request)
    return latrine

# ==========================================
# BOQ ITEMS
# ==========================================
@app.get("/api/boq-items", response_model=List[schemas.BoqItemOut])
def list_boq_items(
    latrine_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    if current_user.role and current_user.role.name == "engineer":
        assigned_ids = [l.id for l in db.query(models.Latrine.id).filter(models.Latrine.assigned_engineer_id == current_user.id).all()]
        if latrine_id:
            if latrine_id not in assigned_ids:
                raise HTTPException(status_code=403, detail="Not assigned")
        else:
            if assigned_ids:
                return db.query(models.BoqItem).filter(models.BoqItem.latrine_id.in_(assigned_ids)).all()
            else:
                return []
    return crud.get_boq_items(db, latrine_id=latrine_id)

@app.patch("/api/boq-items/{item_id}", response_model=schemas.BoqItemOut)
def update_boq_item(
    item_id: int,
    updates: schemas.BoqItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_role(["boq_items:write", "*"])),
    request: Request = None
):
    item = crud.update_boq_item(db, item_id, updates)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ item not found")
    security.log_audit(db, current_user.id, "UPDATE_BOQ_ITEM", "boq_item", item_id, new_values=updates.dict(exclude_unset=True), request=request)
    return item

@app.patch("/api/boq-items/bulk")
def bulk_update_boq_items(
    request_data: schemas.BoqItemBulkRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_role(["boq_items:write", "*"]))
):
    try:
        result = crud.bulk_update_boq_items(db, request_data.items)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk update failed: {str(e)}")

# ==========================================
# REMARKS
# ==========================================
@app.get("/api/remarks", response_model=List[schemas.RemarkOut])
def list_remarks(
    latrine_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    if current_user.role and current_user.role.name == "engineer":
        assigned_ids = [l.id for l in db.query(models.Latrine.id).filter(models.Latrine.assigned_engineer_id == current_user.id).all()]
        if latrine_id:
            if latrine_id not in assigned_ids:
                raise HTTPException(status_code=403, detail="Not assigned")
        else:
            return db.query(models.Remark).filter(models.Remark.latrine_id.in_(assigned_ids)).all()
    return crud.get_remarks(db, latrine_id=latrine_id, status=status)

@app.post("/api/remarks", response_model=schemas.RemarkOut)
def create_remark(
    remark: schemas.RemarkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_role(["remarks:write", "*"])),
    request: Request = None
):
    db_remark = crud.create_remark(db, remark)
    security.log_audit(db, current_user.id, "CREATE_REMARK", "remark", db_remark.id, new_values=remark.dict(), request=request)
    return db_remark

@app.patch("/api/remarks/{remark_id}", response_model=schemas.RemarkOut)
def patch_remark(
    remark_id: int,
    updates: schemas.RemarkUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_role(["remarks:write", "*"])),
    request: Request = None
):
    remark = crud.update_remark(db, remark_id, updates)
    if not remark:
        raise HTTPException(status_code=404, detail="Remark not found")
    security.log_audit(db, current_user.id, "UPDATE_REMARK", "remark", remark_id, new_values=updates.dict(exclude_unset=True), request=request)
    return remark

# ==========================================
# DAILY LOGS
# ==========================================
@app.post("/api/daily-logs", response_model=schemas.DailyLogOut)
def create_daily_log(
    log: schemas.DailyLogCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_role(["daily_logs:write", "*"]))
):
    return crud.create_daily_log(db, log)

@app.get("/api/daily-logs", response_model=List[schemas.DailyLogOut])
def list_daily_logs(
    skip: int = 0,
    limit: int = 30,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    return crud.get_daily_logs(db, skip=skip, limit=limit, from_date=from_date, to_date=to_date)

@app.get("/api/daily-logs/stats")
def get_daily_stats(
    date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    target_date = date or datetime.utcnow()
    return crud.get_daily_log_stats(db, target_date)

# ==========================================
# DASHBOARD
# ==========================================
@app.get("/api/dashboard/summary", response_model=schemas.DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    return crud.get_dashboard_summary(db)

@app.get("/api/dashboard/categories", response_model=List[schemas.CategoryProgress])
def category_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    return crud.get_category_progress(db)

# ==========================================
# REPORTS
# ==========================================
@app.get("/api/reports/summary")
def download_summary_report(
    format: str = "pdf",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_viewer)
):
    try:
        if format == "excel":
            excel_bytes = reports.generate_summary_excel(db)
            return StreamingResponse(
                BytesIO(excel_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=summary_report.xlsx"}
            )
        else:
            pdf_bytes = reports.generate_summary_pdf(db)
            return StreamingResponse(
                BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=summary_report.pdf"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/reports/ipc")
def download_ipc_report(
    format: str = "excel",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_viewer)
):
    try:
        if format == "pdf":
            pdf_bytes = reports.generate_ipc_pdf(db)
            return StreamingResponse(
                BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=ipc_report.pdf"}
            )
        else:
            excel_bytes = reports.generate_ipc_excel(db)
            return StreamingResponse(
                BytesIO(excel_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=ipc_report.xlsx"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/reports/remarks")
def download_remarks_report(
    format: str = "pdf",
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_viewer)
):
    try:
        if format == "excel":
            excel_bytes = reports.generate_remarks_excel(db, from_date, to_date)
            return StreamingResponse(
                BytesIO(excel_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=remarks_report.xlsx"}
            )
        else:
            pdf_bytes = reports.generate_remarks_pdf(db, from_date, to_date)
            return StreamingResponse(
                BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=remarks_report.pdf"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/reports/daily-logs")
def download_daily_logs_report(
    format: str = "pdf",
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_viewer)
):
    try:
        if format == "excel":
            excel_bytes = reports.generate_daily_logs_excel(db, from_date, to_date)
            return StreamingResponse(
                BytesIO(excel_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=site_diary_report.xlsx"}
            )
        else:
            pdf_bytes = reports.generate_daily_logs_pdf(db, from_date, to_date)
            return StreamingResponse(
                BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=site_diary_report.pdf"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/reports/matrix")
def download_matrix_report(
    format: str = "excel",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_viewer)
):
    try:
        if format == "pdf":
            pdf_bytes = reports.generate_matrix_pdf(db)
            return StreamingResponse(
                BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=matrix_report.pdf"}
            )
        else:
            excel_bytes = reports.generate_matrix_excel(db)
            return StreamingResponse(
                BytesIO(excel_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=matrix_report.xlsx"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

# ==========================================
# SYNC ENGINE (مع تطبيق الصلاحيات)
# ==========================================
@app.post("/api/sync", response_model=schemas.SyncResponse)
def sync_offline_data(
    request: schemas.SyncRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_write_permission()),
    req: Request = None
):
    """
    مزامنة البيانات غير المتصلة (Offline Sync)
    تتطلب صلاحية كتابة (أي دور له :write أو admin)
    """
    try:
        security.log_audit(
            db, 
            current_user.id, 
            "SYNC_REQUEST", 
            "batch", 
            None, 
            new_values={"operation_count": len(request.operations)},
            request=req
        )

        result = crud.process_sync_queue(db, request)

        security.log_audit(
            db,
            current_user.id,
            "SYNC_COMPLETE",
            "batch",
            None,
            new_values={"processed": len(result.processed_ids), "failed": len(result.failed_ids)},
            request=req
        )

        return result
    except Exception as e:
        logger.error(f"Sync failed for user {current_user.username}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Critical Sync Failure: {str(e)}")

# ==========================================
# ADMIN & DYNAMIC CONTROL ENDPOINTS
# ==========================================
@app.get("/api/admin/boq-dictionary", response_model=List[schemas.BoqDictionaryOut])
def list_boq_dictionary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    return crud.get_boq_dictionary(db)

@app.post("/api/admin/boq-dictionary", response_model=schemas.BoqDictionaryOut)
def create_dictionary_item(
    item: schemas.BoqDictionaryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    existing = crud.get_boq_dictionary_item(db, item.boq_code)
    if existing:
        raise HTTPException(status_code=400, detail=f"BoQ code {item.boq_code} already exists")
    return crud.create_boq_dictionary_item(db, item)

@app.patch("/api/admin/boq-dictionary/{boq_code}", response_model=schemas.BoqDictionaryOut)
def update_dictionary_item(
    boq_code: str,
    updates: schemas.BoqDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    item = crud.update_boq_dictionary_item(db, boq_code, updates)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ Dictionary item not found")
    return item

@app.delete("/api/admin/boq-dictionary/{boq_code}")
def delete_dictionary_item(
    boq_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    item = crud.delete_boq_dictionary_item(db, boq_code)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ Dictionary item not found")
    return {"message": f"BoQ {boq_code} deactivated successfully"}

@app.post("/api/admin/import-beneficiaries")
async def import_beneficiaries(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
    request: Request = None
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="يجب رفع ملف Excel (.xlsx أو .xls)")
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(filename=BytesIO(contents), data_only=True)
        ws = wb.active
        updated_count = 0
        created_count = 0
        errors = []
        for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row or not row[0]:
                continue
            try:
                latrine_id = str(row[0]).strip()
                if not latrine_id:
                    continue
                beneficiary = str(row[1]).strip() if len(row) > 1 and row[1] else None
                block_no = str(row[2]).strip() if len(row) > 2 and row[2] else "B01"
                engineer = str(row[3]).strip() if len(row) > 3 and row[3] else None
                gps = str(row[4]).strip() if len(row) > 4 and row[4] else None
                existing = crud.get_latrine_by_code(db, latrine_id)
                if existing:
                    if beneficiary: existing.beneficiary_hh = beneficiary
                    if block_no and block_no != "B01": existing.block_no = block_no
                    if engineer: existing.site_engineer = engineer
                    if gps: existing.gps_coordinates = gps
                    existing.last_update = datetime.utcnow()
                    updated_count += 1
                else:
                    new_latrine = schemas.LatrineCreate(
                        latrine_id=latrine_id,
                        beneficiary_hh=beneficiary,
                        block_no=block_no,
                        site_engineer=engineer,
                        gps_coordinates=gps,
                        status="not_started",
                        overall_pct=0.0
                    )
                    db_latrine = crud.create_latrine(db, new_latrine)
                    crud.seed_boq_items(db, db_latrine.id)
                    created_count += 1
            except Exception as row_error:
                errors.append(f"خطأ في الصف {idx}: {str(row_error)}")
                continue
        db.commit()
        security.log_audit(db, current_user.id, "IMPORT_BENEFICIARIES", "batch", None, new_values={"created": created_count, "updated": updated_count}, request=request)
        return {
            "message": "تم الاستيراد بنجاح",
            "updated": updated_count,
            "created": created_count,
            "errors": errors if errors else None,
            "total_processed": updated_count + created_count
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ أثناء معالجة الملف: {str(e)}")

@app.post("/api/admin/import-boq-dictionary")
async def import_boq_dictionary(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
    request: Request = None
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="يجب رفع ملف Excel (.xlsx أو .xls)")
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(filename=BytesIO(contents), data_only=True)
        ws = wb.active
        imported_count = 0
        updated_count = 0
        errors = []
        for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row or not row[0]:
                continue
            try:
                boq_code = str(row[0]).strip().upper()
                if not boq_code:
                    continue
                category = str(row[1]).strip() if len(row) > 1 and row[1] else None
                description_ar = str(row[2]).strip() if len(row) > 2 and row[2] else None
                description_en = str(row[3]).strip() if len(row) > 3 and row[3] else None
                unit = str(row[4]).strip() if len(row) > 4 and row[4] else None
                default_qty = float(row[5]) if len(row) > 5 and row[5] is not None else 0.0
                unit_price = float(row[6]) if len(row) > 6 and row[6] is not None else 0.0
                existing = crud.get_boq_dictionary_item(db, boq_code)
                if existing:
                    if category: existing.category = category
                    if description_ar: existing.description_ar = description_ar
                    if description_en: existing.description_en = description_en
                    if unit: existing.unit = unit
                    existing.default_qty = default_qty
                    existing.unit_price = unit_price
                    existing.is_active = True
                    updated_count += 1
                else:
                    new_item = schemas.BoqDictionaryCreate(
                        boq_code=boq_code,
                        category=category,
                        description_ar=description_ar,
                        description_en=description_en,
                        unit=unit,
                        default_qty=default_qty,
                        unit_price=unit_price,
                        is_active=True
                    )
                    crud.create_boq_dictionary_item(db, new_item)
                    imported_count += 1
            except Exception as row_error:
                errors.append(f"خطأ في الصف {idx}: {str(row_error)}")
                continue
        db.commit()
        security.log_audit(db, current_user.id, "IMPORT_BOQ_DICTIONARY", "batch", None, new_values={"imported": imported_count, "updated": updated_count}, request=request)
        return {
            "message": "تم استيراد القاموس بنجاح",
            "imported": imported_count,
            "updated": updated_count,
            "errors": errors if errors else None
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ أثناء معالجة الملف: {str(e)}")

# ==========================================
# GOVERNANCE ENDPOINTS
# ==========================================
@app.get("/api/admin/governance-items", response_model=List[schemas.GovernanceItemOut])
def get_governance_items(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    return crud.get_governance_items(db, status_filter)

@app.post("/api/admin/governance-items/{decision_id}/override")
def override_decision(
    decision_id: int,
    override_data: schemas.DecisionOverrideUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
    request: Request = None
):
    decision = crud.override_item_decision(db, decision_id, override_data)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision record not found")
    security.log_audit(db, current_user.id, "OVERRIDE_DECISION", "decision_record", decision_id, new_values=override_data.dict(), request=request)
    return {"message": "Decision overridden successfully", "new_state": decision.final_state}

@app.post("/api/admin/governance-backfill")
def backfill_governance_decisions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    all_items = db.query(models.BoqItem).all()
    processed_count = 0
    for item in all_items:
        decision = db.query(models.DecisionRecord).filter(models.DecisionRecord.boq_item_id == item.id).first()
        if not decision:
            crud.update_item_decision(db, item.id)
            processed_count += 1
    latrines = db.query(models.Latrine).all()
    for latrine in latrines:
        crud.recalc_latrine_progress(db, latrine.id)
    return {"message": f"Successfully backfilled decisions for {processed_count} items."}

# ==========================================
# SMART OBSERVATION ENGINE ENDPOINTS
# ==========================================
@app.get("/api/remark-templates", response_model=List[schemas.RemarkTemplateOut])
def list_remark_templates(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_active_user)
):
    return crud.get_remark_templates(db)

@app.post("/api/admin/remark-templates", response_model=schemas.RemarkTemplateOut)
def create_remark_template(
    template: schemas.RemarkTemplateCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    return crud.create_remark_template(db, template)

@app.patch("/api/admin/remark-templates/{template_code}", response_model=schemas.RemarkTemplateOut)
def update_remark_template(
    template_code: str,
    updates: schemas.RemarkTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    template = crud.update_remark_template(db, template_code, updates)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@app.delete("/api/admin/remark-templates/{template_code}")
def delete_remark_template(
    template_code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    template = crud.delete_remark_template(db, template_code)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": f"Template {template_code} archived successfully"}

# ==========================================
# LEGACY SEEDING
# ==========================================
@app.post("/api/seed-latrines")
def seed_latrines(
    count: int = 110,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin)
):
    created = []
    for i in range(1, count + 1):
        code = f"LAT-{str(i).zfill(3)}"
        existing = crud.get_latrine_by_code(db, code)
        if existing:
            continue
        latrine = schemas.LatrineCreate(
            latrine_id=code,
            block_no=f"B{(i//10)+1:02d}",
            gps_coordinates=f"14.{2000+i}N, 43.{1000+i}E",
            beneficiary_hh=f"HH-{1000+i}",
            status="not_started",
            overall_pct=0.0,
            site_engineer="Eng. Ahmed" if i % 3 == 0 else "Eng. Khalid" if i % 3 == 1 else "Eng. Saleh"
        )
        db_latrine = crud.create_latrine(db, latrine)
        crud.seed_boq_items(db, db_latrine.id)
        created.append(code)
    return {"created": len(created), "codes": created[:5]}

# ==========================================
# IMAGE ENDPOINTS (CLOUDFLARE R2)
# ==========================================
@app.post("/api/evidence/presigned-url")
async def get_presigned_url(
    content_type: str = Query(...),
    current_user: models.User = Depends(security.require_role(["remarks:write", "*"]))
):
    if not s3_client:
        raise HTTPException(503, "Storage not configured")
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, "Unsupported type")
    ext = EXT_MAP.get(content_type, "jpg")
    file_id = str(uuid.uuid4())
    key = f"evidence/user_{current_user.id}/{file_id}.{ext}"
    try:
        presigned = s3_client.generate_presigned_post(
            Bucket=R2_BUCKET, Key=key,
            Fields={},
            Conditions=[
                ["content-length-range", 1, MAX_IMAGE_SIZE],
                ["eq", "$Content-Type", content_type]
            ],
            ExpiresIn=3600
        )
        return {"presigned_data": presigned, "key": key}
    except ClientError as e:
        raise HTTPException(500, str(e))

@app.get("/api/evidence/view")
async def view_evidence(
    key: str = Query(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(security.require_role(["remarks:read", "*"]))
):
    remark = db.query(models.Remark).filter(
        (models.Remark.before_photo_ref == key) | (models.Remark.after_photo_ref == key)
    ).first()
    if not remark:
        raise HTTPException(404, "Image not found")
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': R2_BUCKET, 'Key': key},
            ExpiresIn=900
        )
        return RedirectResponse(url)
    except ClientError:
        raise HTTPException(404, "File missing")

# ==========================================
# REACT FRONTEND (serve static files)
# ==========================================
static_dir = os.path.join(os.path.dirname(__file__), "static")

def get_no_cache_response(file_path: str):
    response = FileResponse(file_path)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

if os.path.exists(static_dir) and os.path.exists(os.path.join(static_dir, "index.html")):
    @app.get("/")
    async def serve_react_root():
        return get_no_cache_response(os.path.join(static_dir, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_react_catchall(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API Route Not Found")
        file_path = os.path.join(static_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            if full_path == "service-worker.js" or full_path == "index.html":
                return get_no_cache_response(file_path)
            return FileResponse(file_path)
        return get_no_cache_response(os.path.join(static_dir, "index.html"))
else:
    @app.get("/")
    def root():
        return {"message": "NRC Latrine Tracker API", "version": "3.0.0", "status": "running", "frontend": "not built"}
