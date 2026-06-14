import hashlib
import json
import logging
import os
import time
import uuid

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger(__name__)

# Single table — composite key: PK (HASH) + SK (RANGE)
# Jobs:  PK = "JOB#{job_id}",     SK = "METADATA"
# Cache: PK = "CACHE#{sha256}",   SK = "RESULT"
_TABLE = os.environ.get("DYNAMODB_TABLE", "receptormapper_jobs")
_TTL_SECS = 86400  # 24 hours for both jobs and cache

_dynamodb = None


def _db():
    global _dynamodb
    if _dynamodb is None:
        kwargs = {"region_name": os.environ.get("AWS_REGION", "us-east-1")}
        endpoint = os.environ.get("AWS_ENDPOINT_URL")
        if endpoint:
            kwargs["endpoint_url"] = endpoint
        _dynamodb = boto3.resource("dynamodb", **kwargs)
    return _dynamodb


def _table():
    return _db().Table(_TABLE)


def _ttl() -> int:
    return int(time.time()) + _TTL_SECS


# ── Content-hash cache ────────────────────────────────────────────────────────

def get_by_key(cache_hash: str) -> dict | None:
    """Look up a cached docking result by SHA-256 content hash."""
    try:
        resp = _table().get_item(Key={"PK": f"CACHE#{cache_hash}", "SK": "RESULT"})
        item = resp.get("Item")
        if item:
            logger.info("Cache HIT for hash %s", cache_hash[:12])
            return json.loads(item["result"])
    except Exception:
        logger.exception("Cache get failed for hash %s", cache_hash[:12])
    return None


def set_by_key(cache_hash: str, result: dict) -> None:
    """Store a docking result by SHA-256 content hash. TTL: 24 h."""
    try:
        _table().put_item(Item={
            "PK": f"CACHE#{cache_hash}",
            "SK": "RESULT",
            "result": json.dumps(result),
            "created_at": int(time.time()),
            "ttl": _ttl(),
        })
        logger.info("Cache SET for hash %s", cache_hash[:12])
    except Exception:
        logger.exception("Cache set failed for hash %s", cache_hash[:12])


# ── Job lifecycle ─────────────────────────────────────────────────────────────

def create_job(job_name: str = "") -> str:
    job_id = str(uuid.uuid4())
    name = job_name or job_id[:8]
    try:
        _table().put_item(Item={
            "PK": f"JOB#{job_id}",
            "SK": "METADATA",
            "job_id": job_id,
            "job_name": name,
            "status": "queued",
            "created_at": int(time.time()),
            "ttl": _ttl(),
        })
        logger.info("Job %s created — %s", job_id, name)
    except Exception:
        logger.exception("create_job failed for %s", job_id)
    return job_id


def get_job(job_id: str) -> dict | None:
    try:
        resp = _table().get_item(Key={"PK": f"JOB#{job_id}", "SK": "METADATA"})
        return resp.get("Item")
    except Exception:
        logger.exception("get_job failed for %s", job_id)
    return None


def get_recent_jobs(limit: int = 10) -> list:
    try:
        resp = _table().scan(
            FilterExpression=Attr("status").eq("complete") & Attr("SK").eq("METADATA"),
            ProjectionExpression="job_id, job_name, created_at, completed_at",
        )
        items = sorted(resp.get("Items", []), key=lambda x: x.get("created_at", 0), reverse=True)
        return items[:limit]
    except Exception:
        logger.exception("get_recent_jobs failed")
    return []


def write_job_complete(job_id: str, result: dict) -> None:
    try:
        _table().update_item(
            Key={"PK": f"JOB#{job_id}", "SK": "METADATA"},
            UpdateExpression="SET #s = :s, #r = :r, completed_at = :ca, #ttl = :ttl",
            ExpressionAttributeNames={"#s": "status", "#r": "result", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":s": "complete",
                ":r": json.dumps(result),
                ":ca": int(time.time()),
                ":ttl": _ttl(),
            },
        )
    except Exception:
        logger.exception("write_job_complete failed for %s", job_id)


def write_job_failed(job_id: str, message: str) -> None:
    try:
        _table().update_item(
            Key={"PK": f"JOB#{job_id}", "SK": "METADATA"},
            UpdateExpression="SET #s = :s, #e = :e, completed_at = :ca, #ttl = :ttl",
            ExpressionAttributeNames={"#s": "status", "#e": "error", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":s": "failed",
                ":e": message,
                ":ca": int(time.time()),
                ":ttl": _ttl(),
            },
        )
    except Exception:
        logger.exception("write_job_failed failed for %s", job_id)
