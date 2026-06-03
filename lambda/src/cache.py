import hashlib
import json
import logging
import os
import time

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger(__name__)

_JOBS_TABLE = os.environ.get("DYNAMODB_JOBS_TABLE", "prediction_jobs")
_CACHE_TABLE = os.environ.get("DYNAMODB_CACHE_TABLE", "prediction_cache")
_CACHE_TTL_DAYS = 30

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


def write_job_complete(job_id: str, result: dict) -> None:
    try:
        table = _db().Table(_JOBS_TABLE)
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression=(
                "SET #s = :s, #r = :r, completed_at = :ca"
            ),
            ExpressionAttributeNames={"#s": "status", "#r": "result"},
            ExpressionAttributeValues={
                ":s": "complete",
                ":r": json.dumps(result),
                ":ca": int(time.time()),
            },
        )
    except Exception:
        logger.exception("write_job_complete failed for job %s", job_id)


def write_job_failed(job_id: str, message: str) -> None:
    try:
        table = _db().Table(_JOBS_TABLE)
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #s = :s, #e = :e, completed_at = :ca",
            ExpressionAttributeNames={"#s": "status", "#e": "error"},
            ExpressionAttributeValues={
                ":s": "failed",
                ":e": message,
                ":ca": int(time.time()),
            },
        )
    except Exception:
        logger.exception("write_job_failed failed for job %s", job_id)
