#!/bin/bash
# Alembic Migration Helper Script
# Usage: ./migrate.sh [command]
# Commands: upgrade, downgrade, revision, history, current

set -e

CMD=${1:-upgrade}

case $CMD in
  upgrade)
    echo "Running Alembic upgrade to head..."
    alembic upgrade head
    ;;
  downgrade)
    echo "Running Alembic downgrade -1..."
    alembic downgrade -1
    ;;
  revision)
    echo "Creating new revision..."
    read -p "Enter migration message: " msg
    alembic revision --autogenerate -m "$msg"
    ;;
  history)
    echo "Migration history:"
    alembic history --verbose
    ;;
  current)
    echo "Current revision:"
    alembic current
    ;;
  stamp)
    echo "Stamping database as current..."
    alembic stamp head
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Usage: ./migrate.sh [upgrade|downgrade|revision|history|current|stamp]"
    exit 1
    ;;
esac
