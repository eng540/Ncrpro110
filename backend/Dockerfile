FROM python:3.11-slim

WORKDIR /app

# Install system deps for psycopg2 + Arabic fonts support
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    wget \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Download Amiri Arabic font (OFL license) — Critical for Arabic PDF reports
RUN mkdir -p /app/fonts && \
    wget -q "https://github.com/google/fonts/raw/main/ofl/amiri/Amiri-Regular.ttf" -O /app/fonts/Amiri-Regular.ttf && \
    wget -q "https://github.com/google/fonts/raw/main/ofl/amiri/Amiri-Bold.ttf" -O /app/fonts/Amiri-Bold.ttf && \
    fc-cache -f -v

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic/ ./alembic/
COPY app/ ./app/

ENV PYTHONPATH=/app
ENV PORT=8000

EXPOSE 8000

# Run migrations then start server
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
