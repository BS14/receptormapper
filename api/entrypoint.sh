#!/bin/sh
set -e

# create_tables.py is idempotent (catches ResourceInUseException).
# Runs against real AWS DynamoDB when AWS_ENDPOINT_URL is unset,
# or against a local container when it is set.
echo "Ensuring DynamoDB table exists..."
python /app/scripts/create_tables.py

# Seed demo jobs only in local dev mode (when pointing at a local container)
if [ -n "$AWS_ENDPOINT_URL" ]; then
  echo "Local mode — seeding cache..."
  python /app/scripts/seed_cache.py
fi

echo "Starting ReceptorMapper API..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
