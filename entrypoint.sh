#!/bin/bash
set -e

echo "========================================"
echo "NRC Latrine Tracker - Starting up..."
echo "========================================"

# 1. تنفيذ التحديثات على قاعدة البيانات (إضافة الأعمدة الجديدة)
echo "Running database migrations..."
alembic upgrade head

# 2. تشغيل الخادم
echo "Starting uvicorn server..."
# نستخدم $PORT الذي يوفره Railway تلقائياً، أو 8000 كافتراضي
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"