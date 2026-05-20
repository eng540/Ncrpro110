from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from app import models, schemas, crud
from app.database import engine, get_db, Base
from app import reports
from io import BytesIO
import os
from datetime import datetime
import openpyxl

# Create tables on startup (fallback for dev)
try:
    Base.metadata.create_all(bind=engine)
    print("Database tables verified/created")
except Exception as e:
    print(f"Warning: Could not create tables: {e}")

app = FastAPI(
    title="NRC Latrine Tracker",
    description="Dynamic SaaS Platform - Multi-Project WASH & Shelter Tracking",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== API ROUTES (all under /api) ==========

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "running", "version": "2.0.0", "mode": "dynamic_saas"}

@app.get("/api/latrines", response_model=List[schemas.LatrineOut])
def list_latrines(skip: int = 0, limit: int = 100, status: Optional[str] = None, db: Session = Depends(get_db)):
    return crud.get_latrines(db, skip=skip, limit=limit, status=status)

@app.get("/api/latrines/{latrine_id}", response_model=schemas.LatrineOut)
def get_latrine(latrine_id: int, db: Session = Depends(get_db)):
    latrine = crud.get_latrine(db, latrine_id)
    if not latrine:
        raise HTTPException(status_code=404, detail="Latrine not found")
    return latrine

@app.post("/api/latrines", response_model=schemas.LatrineOut)
def create_latrine(latrine: schemas.LatrineCreate, db: Session = Depends(get_db)):
    existing = crud.get_latrine_by_code(db, latrine.latrine_id)
    if existing:
        raise HTTPException(status_code=400, detail="Latrine ID already exists")
    db_latrine = crud.create_latrine(db, latrine)
    crud.seed_boq_items(db, db_latrine.id)
    return db_latrine

@app.patch("/api/latrines/{latrine_id}", response_model=schemas.LatrineOut)
def patch_latrine(latrine_id: int, updates: schemas.LatrineUpdate, db: Session = Depends(get_db)):
    latrine = crud.update_latrine(db, latrine_id, updates)
    if not latrine:
        raise HTTPException(status_code=404, detail="Latrine not found")
    return latrine

@app.get("/api/boq-items", response_model=List[schemas.BoqItemOut])
def list_boq_items(latrine_id: Optional[int] = None, db: Session = Depends(get_db)):
    return crud.get_boq_items(db, latrine_id=latrine_id)

@app.patch("/api/boq-items/bulk")
def bulk_update_boq_items(
    request: schemas.BoqItemBulkRequest,
    db: Session = Depends(get_db)
):
    try:
        result = crud.bulk_update_boq_items(db, request.items)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk update failed: {str(e)}")

@app.patch("/api/boq-items/{item_id}", response_model=schemas.BoqItemOut)
def update_boq_item(item_id: int, updates: schemas.BoqItemUpdate, db: Session = Depends(get_db)):
    item = crud.update_boq_item(db, item_id, updates)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ item not found")
    return item

@app.get("/api/remarks", response_model=List[schemas.RemarkOut])
def list_remarks(latrine_id: Optional[int] = None, status: Optional[str] = None, db: Session = Depends(get_db)):
    return crud.get_remarks(db, latrine_id=latrine_id, status=status)

@app.post("/api/remarks", response_model=schemas.RemarkOut)
def create_remark(remark: schemas.RemarkCreate, db: Session = Depends(get_db)):
    return crud.create_remark(db, remark)

@app.patch("/api/remarks/{remark_id}", response_model=schemas.RemarkOut)
def patch_remark(remark_id: int, updates: schemas.RemarkUpdate, db: Session = Depends(get_db)):
    remark = crud.update_remark(db, remark_id, updates)
    if not remark:
        raise HTTPException(status_code=404, detail="Remark not found")
    return remark

# ---------- Daily Log Endpoints ----------
@app.post("/api/daily-logs", response_model=schemas.DailyLogOut)
def create_daily_log(log: schemas.DailyLogCreate, db: Session = Depends(get_db)):
    return crud.create_daily_log(db, log)

@app.get("/api/daily-logs", response_model=List[schemas.DailyLogOut])
def list_daily_logs(
    skip: int = 0, 
    limit: int = 30,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    return crud.get_daily_logs(db, skip=skip, limit=limit, from_date=from_date, to_date=to_date)

@app.get("/api/daily-logs/stats")
def get_daily_stats(date: Optional[datetime] = None, db: Session = Depends(get_db)):
    target_date = date or datetime.utcnow()
    return crud.get_daily_log_stats(db, target_date)

# ---------- Dashboard ----------
@app.get("/api/dashboard/summary", response_model=schemas.DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db)):
    return crud.get_dashboard_summary(db)

@app.get("/api/dashboard/categories", response_model=List[schemas.CategoryProgress])
def category_progress(db: Session = Depends(get_db)):
    return crud.get_category_progress(db)

# ---------- Reports Endpoints ----------
@app.get("/api/reports/summary")
def download_summary_pdf(db: Session = Depends(get_db)):
    try:
        pdf_bytes = reports.generate_summary_pdf(db)
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=summary_report.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/reports/ipc")
def download_ipc_excel(db: Session = Depends(get_db)):
    try:
        excel_bytes = reports.generate_ipc_excel(db)
        return StreamingResponse(
            BytesIO(excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=ipc_report.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/reports/remarks")
def download_remarks_pdf(
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    try:
        pdf_bytes = reports.generate_remarks_pdf(db, from_date, to_date)
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=remarks_report.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

# ---------- Sync Engine Endpoint ----------
@app.post("/api/sync", response_model=schemas.SyncResponse)
def sync_offline_data(request: schemas.SyncRequest, db: Session = Depends(get_db)):
    try:
        return crud.process_sync_queue(db, request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Critical Sync Failure: {str(e)}")

# ==========================================
# 🌟 ADMIN & DYNAMIC CONTROL ENDPOINTS (جديد)
# ==========================================

# ---------- BoQ Dictionary Management ----------
@app.get("/api/admin/boq-dictionary", response_model=List[schemas.BoqDictionaryOut])
def list_boq_dictionary(db: Session = Depends(get_db)):
    """جلب قائمة البنود والأسعار من القاموس الديناميكي"""
    return crud.get_boq_dictionary(db)

@app.post("/api/admin/boq-dictionary", response_model=schemas.BoqDictionaryOut)
def create_dictionary_item(item: schemas.BoqDictionaryCreate, db: Session = Depends(get_db)):
    """إضافة بند جديد للقاموس"""
    existing = crud.get_boq_dictionary_item(db, item.boq_code)
    if existing:
        raise HTTPException(status_code=400, detail=f"BoQ code {item.boq_code} already exists")
    return crud.create_boq_dictionary_item(db, item)

@app.patch("/api/admin/boq-dictionary/{boq_code}", response_model=schemas.BoqDictionaryOut)
def update_dictionary_item(boq_code: str, updates: schemas.BoqDictionaryUpdate, db: Session = Depends(get_db)):
    """تحديث بند في القاموس (السعر، الوصف، إلخ)"""
    item = crud.update_boq_dictionary_item(db, boq_code, updates)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ Dictionary item not found")
    return item

@app.delete("/api/admin/boq-dictionary/{boq_code}")
def delete_dictionary_item(boq_code: str, db: Session = Depends(get_db)):
    """إلغاء تفعيل بند (Soft Delete)"""
    item = crud.delete_boq_dictionary_item(db, boq_code)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ Dictionary item not found")
    return {"message": f"BoQ {boq_code} deactivated successfully"}

# ---------- Excel Import Engine ----------
@app.post("/api/admin/import-beneficiaries")
async def import_beneficiaries(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    استيراد ملف Excel يحتوي على بيانات المستفيدين والحمامات.

    الأعمدة المتوقعة:
    - A: رقم الحمام (Latrine ID) - مطلوب
    - B: اسم المستفيد (Beneficiary HH) - اختياري
    - C: المربع/القرية (Block No) - اختياري (افتراضي: B01)
    - D: المهندس المسؤول (Site Engineer) - اختياري
    - E: إحداثيات GPS - اختياري
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="يجب رفع ملف Excel (.xlsx أو .xls)")

    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(filename=BytesIO(contents), data_only=True)
        ws = wb.active

        updated_count = 0
        created_count = 0
        errors = []

        # تخطي الصف الأول (العناوين)
        for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row or not row[0]:
                continue  # تخطي الصفوف الفارغة

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
                    # تحديث الحمام الموجود
                    if beneficiary:
                        existing.beneficiary_hh = beneficiary
                    if block_no and block_no != "B01":
                        existing.block_no = block_no
                    if engineer:
                        existing.site_engineer = engineer
                    if gps:
                        existing.gps_coordinates = gps
                    existing.last_update = datetime.utcnow()
                    updated_count += 1
                else:
                    # إنشاء حمام جديد
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
async def import_boq_dictionary(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    استيراد قاموس البنود والأسعار من ملف Excel.

    الأعمدة المتوقعة:
    - A: كود البند (BoQ Code) - مطلوب
    - B: الفئة (Category) - اختياري
    - C: الوصف العربي - اختياري
    - D: الوصف الإنجليزي - اختياري
    - E: الوحدة (Unit) - اختياري
    - F: الكمية الافتراضية (Default Qty) - اختياري
    - G: سعر الوحدة (Unit Price) - مطلوب
    """
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
                    # تحديث البند الموجود
                    if category:
                        existing.category = category
                    if description_ar:
                        existing.description_ar = description_ar
                    if description_en:
                        existing.description_en = description_en
                    if unit:
                        existing.unit = unit
                    existing.default_qty = default_qty
                    existing.unit_price = unit_price
                    existing.is_active = True
                    updated_count += 1
                else:
                    # إنشاء بند جديد
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

        return {
            "message": "تم استيراد القاموس بنجاح",
            "imported": imported_count,
            "updated": updated_count,
            "errors": errors if errors else None
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"خطأ أثناء معالجة الملف: {str(e)}")

# ---------- Legacy Seeding (للتوافق مع النسخ القديمة) ----------
@app.post("/api/seed-latrines")
def seed_latrines(count: int = 110, db: Session = Depends(get_db)):
    """توليد حمامات تجريبية (للاختبار فقط)"""
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

# ========== REACT FRONTEND (serve static files) ==========
static_dir = os.path.join(os.path.dirname(__file__), "static")

if os.path.exists(static_dir) and os.path.exists(os.path.join(static_dir, "index.html")):

    @app.get("/")
    async def serve_react_root():
        return FileResponse(os.path.join(static_dir, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_react_catchall(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API Route Not Found")

        file_path = os.path.join(static_dir, full_path)

        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)

        return FileResponse(os.path.join(static_dir, "index.html"))
else:
    @app.get("/")
    def root():
        return {"message": "NRC Latrine Tracker API", "version": "2.0.0", "status": "running", "frontend": "not built"}
