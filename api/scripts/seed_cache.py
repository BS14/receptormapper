"""
Seeds the local DynamoDB table with a few completed docking job records
so the Recent Predictions sidebar is populated in local dev.

Run after create_tables.py:
  cd api && python scripts/seed_cache.py
"""
import json
import os
import time
import uuid

import boto3

ENDPOINT = os.environ.get("AWS_ENDPOINT_URL", "http://localhost:8000")
REGION   = os.environ.get("AWS_REGION", "us-east-1")
TABLE    = os.environ.get("DYNAMODB_TABLE", "receptormapper_jobs")

dynamo = boto3.resource(
    "dynamodb",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "fake"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "fake"),
)

table = dynamo.Table(TABLE)
TTL   = int(time.time()) + 86400  # 24 h

SEEDS = [
    ("Erlotinib / EGFR (1IEP)",   -9.2, 0.90, "strong"),
    ("Imatinib / ABL1 (2HYY)",    -8.7, 0.85, "strong"),
    ("Aspirin / COX-1 (1EQG)",    -5.1, 0.60, "moderate"),
]

for name, delta_g, confidence, strength in SEEDS:
    import math
    pic50 = -delta_g / 1.420
    job_id = str(uuid.uuid4())
    now = int(time.time())
    result = {
        "binding": {
            "pIC50": round(pic50, 2),
            "delta_g": round(delta_g, 2),
            "ic50_nM": round(10 ** (9 - pic50), 1),
            "confidence": confidence,
            "strength": strength,
        },
        "flags": [],
        "summary": {"total_flags": 0},
    }
    table.put_item(Item={
        "PK": f"JOB#{job_id}",
        "SK": "METADATA",
        "job_id": job_id,
        "job_name": name,
        "status": "complete",
        "result": json.dumps(result),
        "created_at": now - 300,
        "completed_at": now - 120,
        "ttl": TTL,
    })
    print(f"Seeded: {name}")

print("Done — 3 demo docking jobs seeded.")
