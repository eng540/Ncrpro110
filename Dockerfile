FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY entrypoint.sh .

# CRITICAL: Git doesn't preserve execute permissions, must chmod in Dockerfile
RUN chmod +x entrypoint.sh

ENV PYTHONPATH=/app
ENV PORT=8000

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
