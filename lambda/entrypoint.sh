#!/bin/sh
set -e

echo "Waiting for DynamoDB at $AWS_ENDPOINT_URL..."
until python -c "
import boto3, os
boto3.client('dynamodb',
    endpoint_url=os.environ['AWS_ENDPOINT_URL'],
    region_name=os.environ.get('AWS_REGION','us-east-1'),
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID','fake'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY','fake')
).list_tables()
" 2>/dev/null; do
    echo "  DynamoDB not ready — retrying in 2s..."
    sleep 2
done

echo "DynamoDB ready. Creating tables..."
python /app/scripts/create_tables.py

echo "Seeding cache..."
python /app/scripts/seed_cache.py

echo "Starting ReceptorMapper API..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
