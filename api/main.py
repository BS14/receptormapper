import hashlib
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

import boto3
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile

from src import assembler, binding, cache

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ReceptorMapper", version="3.0.0")

_UPLOAD_DIR = "/tmp/rm_uploads"
os.makedirs(_UPLOAD_DIR, exist_ok=True)


# ── S3 helpers ────────────────────────────────────────────────────────────────

def _s3_client():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def _upload_to_s3(local_path: str, s3_key: str) -> None:
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        return
    try:
        _s3_client().upload_file(local_path, bucket, s3_key)
        logger.info("Uploaded %s → s3://%s/%s", local_path, bucket, s3_key)
    except Exception:
        logger.exception("S3 upload failed: %s", s3_key)


def _presigned_url(s3_key: str, expires: int = 7 * 86400) -> Optional[str]:
    bucket = os.environ.get("S3_BUCKET")
    if not bucket or not s3_key:
        return None
    try:
        return _s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": s3_key},
            ExpiresIn=expires,
        )
    except Exception:
        logger.exception("Failed to generate presigned URL for %s", s3_key)
        return None


# ── File helpers ──────────────────────────────────────────────────────────────

def _save_bytes(data: bytes, job_id: str, filename: str) -> str:
    job_dir = os.path.join(_UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    dest = os.path.join(job_dir, filename)
    with open(dest, "wb") as f:
        f.write(data)
    return dest


def _cleanup(job_id: str) -> None:
    job_dir = os.path.join(_UPLOAD_DIR, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)


# ── Background prediction ─────────────────────────────────────────────────────

def _run_prediction(
    job_id: str,
    receptor_path: str,
    ligand_path: str,
    cache_hash: str,
    receptor_filename: str,
    ligand_filename: str,
) -> None:
    logger.info("Job %s started", job_id)
    try:
        cached = cache.get_by_key(cache_hash)
        if cached:
            cache.write_job_complete(job_id, cached)
            logger.info("Job %s fulfilled from cache", job_id)
            return

        _upload_to_s3(receptor_path, f"{job_id}/assets/{receptor_filename}")
        _upload_to_s3(ligand_path, f"{job_id}/assets/{ligand_filename}")

        binding_result = binding.predict(
            receptor_pdb_path=receptor_path,
            ligand_path=ligand_path,
            job_id=job_id,
        )

        result = assembler.build(binding_result)
        cache.set_by_key(cache_hash, result)
        cache.write_job_complete(job_id, result)
        logger.info("Job %s complete — flags=%d", job_id, result["summary"]["total_flags"])

    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        cache.write_job_failed(job_id, str(exc))
    finally:
        _cleanup(job_id)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", status_code=202)
async def predict(
    background_tasks: BackgroundTasks,
    receptor_pdb: UploadFile = File(...),
    ligand_file: UploadFile = File(...),
    job_name: str = Form(""),
):
    receptor_bytes = await receptor_pdb.read()
    ligand_bytes = await ligand_file.read()

    if not receptor_bytes:
        raise HTTPException(status_code=400, detail="receptor_pdb is empty")
    if not ligand_bytes:
        raise HTTPException(status_code=400, detail="ligand_file is empty")

    cache_hash = hashlib.sha256(receptor_bytes + ligand_bytes).hexdigest()
    receptor_filename = receptor_pdb.filename or "receptor.pdb"
    ligand_ext = Path(ligand_file.filename or "ligand.sdf").suffix or ".sdf"
    ligand_filename = ligand_file.filename or f"ligand{ligand_ext}"
    display_name = job_name or Path(receptor_filename).stem

    job_id = cache.create_job(display_name)
    receptor_path = _save_bytes(receptor_bytes, job_id, receptor_filename)
    ligand_path = _save_bytes(ligand_bytes, job_id, ligand_filename)

    background_tasks.add_task(
        _run_prediction,
        job_id, receptor_path, ligand_path,
        cache_hash, receptor_filename, ligand_filename,
    )
    return {"status": "queued", "job_id": job_id}


@app.get("/jobs")
def list_jobs():
    return {"jobs": cache.get_recent_jobs(10)}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = cache.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    status = job.get("status")

    if status == "complete":
        result = json.loads(job["result"])
        # Inject fresh presigned URL — key is stored in the result, URL generated here
        s3_key = result.get("binding", {}).get("docked_complex_key")
        if s3_key:
            url = _presigned_url(s3_key)
            if url:
                result["binding"]["docked_complex_url"] = url
        return {
            "status": "complete",
            "result": result,
            "meta": {"job_name": job.get("job_name", "")},
        }

    if status == "failed":
        return {"status": "failed", "error": job.get("error")}

    return {"status": status}
