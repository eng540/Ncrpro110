FROM node:18-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package.json .
RUN npm install
COPY frontend/ .
RUN npm run build

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

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app

# Copy React build into backend static folder
COPY --from=frontend-builder /frontend/build ./app/static

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

ENV PYTHONPATH=/app

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
