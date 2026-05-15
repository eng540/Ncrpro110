# NRC Latrine Tracker - ECHO 2525

نظام تتبع إنجاز حمامات الأسر النازحة - مديرية الزهرة - محافظة الحديدة

## Architecture
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + **Alembic**
- **Frontend**: React (RTL Arabic UI)
- **Database**: PostgreSQL (Railway managed)
- **Hosting**: Railway.app (Docker)
- **Migrations**: Alembic (production-grade schema management)

## Database Migrations (Alembic)

This project uses **Alembic** for all database schema changes. Never run raw SQL scripts.

### Migration Commands

```bash
cd backend

# Apply all pending migrations (creates tables)
alembic upgrade head

# Create a new migration after changing models.py
alembic revision --autogenerate -m "add_photo_url_to_latrines"

# View migration history
alembic history --verbose

# Rollback one migration
alembic downgrade -1

# Check current DB version
alembic current

# Stamp existing DB (if migrating from raw SQL)
alembic stamp head
```

### Migration Files Location
```
backend/alembic/
├── alembic.ini          # Configuration
├── env.py               # Dynamic DATABASE_URL from env
├── script.py.mako       # Template for new migrations
└── versions/
    └── 001_create_all_tables.py   # Initial migration
```

## Quick Start (Local with Docker)

```bash
# 1. Clone and enter directory
cd nrc-latrine-tracker

# 2. Start all services (DB + Backend + Frontend)
docker-compose up --build

# Backend will auto-run: alembic upgrade head && uvicorn ...
# Wait for: "Running migrations..." then "Application startup complete"

# 3. Seed the 110 latrines
curl -X POST http://localhost:8000/api/seed-latrines

# 4. Open frontend
http://localhost:3000
```

## Railway Deployment Steps

### 1. Create Project on Railway
- Go to [railway.app](https://railway.app)
- New Project → Deploy from GitHub Repo

### 2. Add PostgreSQL Database
- Click "New" → Database → Add PostgreSQL
- Railway auto-injects `DATABASE_URL` into backend service

### 3. Deploy Backend
- Add service → GitHub Repo → select this repo
- Set root directory to `backend/` (or Railway auto-detects Dockerfile)
- The Dockerfile CMD runs migrations automatically:
  ```dockerfile
  CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
  ```
- Environment variables: `DATABASE_URL` is auto-set by Railway

### 4. Deploy Frontend
- **Option A**: Separate service (recommended for production)
  - New service → GitHub Repo → `frontend/`
  - Set `REACT_APP_API_URL=https://your-backend.railway.app/api`
- **Option B**: Single service (simpler for MVP)
  - Build React locally: `cd frontend && npm run build`
  - Copy `build/` to `backend/app/static/`
  - Mount in FastAPI:
    ```python
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory="app/static", html=True), name="static")
    ```

### 5. Seed Data
After first deploy, run once:
```bash
railway run -- curl -X POST https://YOUR-APP.railway.app/api/seed-latrines
```

### 6. Future Migrations on Railway
When you update `models.py` and push a new migration:
```bash
# Locally
cd backend
alembic revision --autogenerate -m "add_new_field"
git add alembic/versions/002_...py
git commit -m "Add migration"
git push

# Railway will auto-run alembic upgrade head on next deploy
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/latrines` | List all latrines |
| GET | `/api/latrines/{id}` | Get single latrine |
| POST | `/api/latrines` | Create new latrine |
| PATCH | `/api/latrines/{id}` | Update latrine status |
| GET | `/api/boq-items` | List BoQ items |
| PATCH | `/api/boq-items/{id}` | Update progress (auto-recalculates %) |
| GET | `/api/remarks` | List remarks |
| POST | `/api/remarks` | Add remark |
| PATCH | `/api/remarks/{id}` | Close remark |
| GET | `/api/dashboard/summary` | Dashboard KPIs |
| GET | `/api/dashboard/categories` | Category progress bars |
| POST | `/api/seed-latrines` | Bulk create 110 latrines + BoQ items |

## Database Schema (Managed by Alembic)

```
latrines (Master Registry)
├── id, latrine_id, block_no, gps_coordinates, beneficiary_hh
├── status, overall_pct, site_engineer, start_date, expected_completion
└── relations: boq_items[], remarks[]

boq_items (Bill of Quantities Tracking)
├── id, latrine_id, boq_code, category, description_ar, description_en
├── unit, planned_qty, achieved_qty, achievement_pct
├── status, quality_pass, inspection_date, inspector

remarks (Quality Control / Defects)
├── id, latrine_id, boq_code, type, severity, description
├── action_required, deadline, status, closed_date, photo_ref

daily_logs (Site Diary)
├── id, date, engineer, latrines_inspected, latrines_accepted
├── remarks_issued, weather, manpower, equipment, notes
```

## Why Alembic?

| Feature | Benefit |
|---------|---------|
| **Version Control** | Every schema change is a Git-tracked Python file |
| **Reversible** | `upgrade()` creates, `downgrade()` drops safely |
| **Production Safe** | Runs inside transactions; failures rollback automatically |
| **Team Sync** | All engineers share same migration history |
| **CI/CD Ready** | `alembic upgrade head` runs automatically on deploy |
| **No Raw SQL** | Migrations written in Python with SQLAlchemy types |
| **PostgreSQL Native** | Uses native ENUM types, indexes, constraints |

## Key Features
- ✅ **Alembic Migrations** - Production-grade schema evolution
- ✅ **RTL Arabic Interface** - Full right-to-left support
- ✅ **Auto-calculation** - Overall % rolls up from item → latrine → project
- ✅ **Weighted Progress** - A(60%) / B(25%) / C(15%) category weights
- ✅ **Quality Gates** - Pass/Fail/Pending per BoQ item
- ✅ **Remark Tracking** - Severity levels with auto-escalation
- ✅ **Payment Ready** - Export % complete for Interim Payment Certificates

## Next Steps / Enhancements
1. **Authentication**: Add JWT auth (engineer / supervisor / PM roles)
2. **Photo Upload**: S3/Cloudinary for geotagged photos
3. **QR Codes**: Generate printable QR stickers per latrine
4. **Mobile App**: Capacitor/Flutter wrapper for offline field use
5. **GIS Map**: Mapbox/Leaflet for GPS visualization
6. **Reports**: `/api/reports/weekly` PDF generation
7. **Notifications**: Email/SMS for overdue remarks

## License
Internal NRC WASH & Shelter Department use.
