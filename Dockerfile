# Railway builds from repo ROOT, so we reference backend/ subfolder
FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app

ENV PYTHONPATH=/app
ENV PORT=8000

EXPOSE 8000

# Run migrations then start server
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
