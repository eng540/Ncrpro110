from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from app import models, schemas, crud
from app.database import engine, get_db, Base
import os

# Create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="NRC Latrine Tracker",
    description="ECHO 2525 - Al-Zohra District HH Latrines Tracking System",
    version="1.0.0"
)

# CORS - allow Railway frontend + local dev
origins = [
    "http://localhost:3000",
    "https://localhost:3000",
    os.getenv("FRONTEND_URL", "")
]
# Remove empty strings
origins = [o for o in origins if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- HEALTH ----------
@app.get("/")
def root():
    return {"message": "NRC Latrine Tracker API", "project": "ECHO 2525", "status": "running"}

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")

# ---------- LATRINES ----------
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
    # Auto-create BoQ items
    crud.seed_boq_items(db, db_latrine.id)
    return db_latrine

@app.patch("/api/latrines/{latrine_id}", response_model=schemas.LatrineOut)
def patch_latrine(latrine_id: int, updates: schemas.LatrineUpdate, db: Session = Depends(get_db)):
    latrine = crud.update_latrine(db, latrine_id, updates)
    if not latrine:
        raise HTTPException(status_code=404, detail="Latrine not found")
    return latrine

# ---------- BOQ ITEMS ----------
@app.get("/api/boq-items", response_model=List[schemas.BoqItemOut])
def list_boq_items(latrine_id: Optional[int] = None, db: Session = Depends(get_db)):
    return crud.get_boq_items(db, latrine_id=latrine_id)

@app.patch("/api/boq-items/{item_id}", response_model=schemas.BoqItemOut)
def update_boq_item(item_id: int, updates: schemas.BoqItemUpdate, db: Session = Depends(get_db)):
    item = crud.update_boq_item(db, item_id, updates)
    if not item:
        raise HTTPException(status_code=404, detail="BoQ item not found")
    return item

# ---------- REMARKS ----------
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

# ---------- DASHBOARD ----------
@app.get("/api/dashboard/summary", response_model=schemas.DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db)):
    return crud.get_dashboard_summary(db)

@app.get("/api/dashboard/categories", response_model=List[schemas.CategoryProgress])
def category_progress(db: Session = Depends(get_db)):
    return crud.get_category_progress(db)

# ---------- BULK SEED (for setup) ----------
@app.post("/api/seed-latrines")
def seed_latrines(count: int = 110, db: Session = Depends(get_db)):
    """Seed N latrines with BoQ items. Use once during setup."""
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
