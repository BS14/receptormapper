import hashlib
import json
import logging
import os
import time
import uuid

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger(__name__)

_JOBS_TABLE = os.environ.get("DYNAMODB_JOBS_TABLE", "prediction_jobs")
_CACHE_TABLE = os.environ.get("DYNAMODB_CACHE_TABLE", "prediction_cache")
_CACHE_TTL_DAYS = 30
_JOB_TTL_SECS = 86400  # 24 hours

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


def _cache_key(smiles: str, target: str, model: str, cell_panel: str = "lung") -> str:
    raw = f"{smiles}|{target}|{model}|{cell_panel}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Prediction cache ──────────────────────────────────────────────────────────

def get(smiles: str, target: str, model: str, cell_panel: str = "lung") -> dict | None:
    key = _cache_key(smiles, target, model, cell_panel)
    try:
        table = _db().Table(_CACHE_TABLE)
        resp = table.get_item(Key={"cache_key": key})
        item = resp.get("Item")
        if item:
            logger.info("Cache HIT for key %s", key[:16])
            return json.loads(item["result"])
    except Exception:
        logger.exception("Cache get failed for key %s", key[:16])
    return None


def set(smiles: str, target: str, model: str, result: dict, cell_panel: str = "lung") -> None:
    key = _cache_key(smiles, target, model, cell_panel)
    ttl = int(time.time()) + _CACHE_TTL_DAYS * 86400
    try:
        table = _db().Table(_CACHE_TABLE)
        table.put_item(Item={
            "cache_key": key,
            "result": json.dumps(result),
            "created_at": int(time.time()),
            "ttl": ttl,
        })
        logger.info("Cache SET for key %s", key[:16])
    except Exception:
        logger.exception("Cache set failed for key %s", key[:16])


# ── Job lifecycle ─────────────────────────────────────────────────────────────

def create_job(smiles: str, target: str, model: str, cell_panel: str, job_name: str = "") -> str:
    job_id = str(uuid.uuid4())
    name = job_name or (smiles[:20] + ("…" if len(smiles) > 20 else ""))
    try:
        table = _db().Table(_JOBS_TABLE)
        table.put_item(Item={
            "job_id": job_id,
            "job_name": name,
            "smiles": smiles,
            "target": target,
            "model": model,
            "cell_panel": cell_panel,
            "status": "queued",
            "created_at": int(time.time()),
            "ttl": int(time.time()) + _JOB_TTL_SECS,
        })
        logger.info("Job %s created — %s", job_id, name)
    except Exception:
        logger.exception("create_job failed for job %s", job_id)
    return job_id


def get_job(job_id: str) -> dict | None:
    try:
        table = _db().Table(_JOBS_TABLE)
        resp = table.get_item(Key={"job_id": job_id})
        return resp.get("Item")
    except Exception:
        logger.exception("get_job failed for job %s", job_id)
    return None


def get_recent_jobs(limit: int = 10) -> list:
    try:
        table = _db().Table(_JOBS_TABLE)
        resp = table.scan(
            FilterExpression=Attr("status").eq("complete"),
            ProjectionExpression="job_id, job_name, smiles, #m, created_at, completed_at",
            ExpressionAttributeNames={"#m": "model"},
        )
        items = sorted(resp.get("Items", []), key=lambda x: x.get("created_at", 0), reverse=True)
        return items[:limit]
    except Exception:
        logger.exception("get_recent_jobs failed")
    return []


def write_job_complete(job_id: str, result: dict) -> None:
    try:
        table = _db().Table(_JOBS_TABLE)
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #s = :s, #r = :r, completed_at = :ca, #ttl = :ttl",
            ExpressionAttributeNames={"#s": "status", "#r": "result", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":s": "complete",
                ":r": json.dumps(result),
                ":ca": int(time.time()),
                ":ttl": int(time.time()) + _JOB_TTL_SECS,
            },
        )
    except Exception:
        logger.exception("write_job_complete failed for job %s", job_id)


def write_job_failed(job_id: str, message: str) -> None:
    try:
        table = _db().Table(_JOBS_TABLE)
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #s = :s, #e = :e, completed_at = :ca, #ttl = :ttl",
            ExpressionAttributeNames={"#s": "status", "#e": "error", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":s": "failed",
                ":e": message,
                ":ca": int(time.time()),
                ":ttl": int(time.time()) + _JOB_TTL_SECS,
            },
        )
    except Exception:
        logger.exception("write_job_failed failed for job %s", job_id)
