from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from app import models, schemas, crud
from app.database import engine, get_db, Base
import os

# Create tables on startup
try:
    Base.metadata.create_all(bind=engine)
    print("Database tables verified/created")
except Exception as e:
    print(f"Warning: Could not create tables: {e}")

app = FastAPI(
    title="NRC Latrine Tracker",
    description="ECHO 2525 - Al-Zohra District HH Latrines Tracking System",
    version="1.0.0",
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
    return {"status": "healthy", "service": "running"}

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

@app.patch("/api/boq-items/{item_id}", response_model=schemas.BoqItemOut)
def update_boq_item(item_id: int, updates: schemas.BoqItemUpdate, db: Session = Depends(get_db)):
    item = crud.update_boq_item(db, item_id, updates)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ item not found")
    return item

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

@app.get("/api/dashboard/summary", response_model=schemas.DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db)):
    return crud.get_dashboard_summary(db)

@app.get("/api/dashboard/categories", response_model=List[schemas.CategoryProgress])
def category_progress(db: Session = Depends(get_db)):
    return crud.get_category_progress(db)

@app.post("/api/seed-latrines")
def seed_latrines(count: int = 110, db: Session = Depends(get_db)):
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
        return {"message": "NRC Latrine Tracker API", "project": "ECHO 2525", "status": "running", "frontend": "not built"}
