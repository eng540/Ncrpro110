#!/bin/bash
set -e

echo "========================================"
echo "NRC Latrine Tracker - Starting up..."
echo "========================================"

# Check DATABASE_URL
echo "DATABASE_URL is set: ${DATABASE_URL:+YES}"

# Create tables using SQLAlchemy (fallback, works without Alembic)
echo "Creating database tables..."
python -c "
from app.database import engine
from app.models import Base
try:
    Base.metadata.create_all(bind=engine)
    print('SUCCESS: Database tables created/verified')
except Exception as e:
    print(f'ERROR creating tables: {e}')
    import sys
    sys.exit(1)
"

echo "Starting uvicorn server..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info
