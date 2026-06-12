import json
import logging
import os
import shutil
import tempfile
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile

from src import admet, assembler, binding, cache, cellline, offtarget, tanimoto, validator

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ReceptorMapper", version="2.0.0")

# Persistent scratch dir for uploaded files referenced by background tasks
_UPLOAD_DIR = "/tmp/rm_uploads"
os.makedirs(_UPLOAD_DIR, exist_ok=True)


def _save_upload(upload: UploadFile, job_id: str, suffix: str) -> str:
    job_dir = os.path.join(_UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    dest = os.path.join(job_dir, f"{upload.filename or ('file' + suffix)}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return dest


def _run_prediction(
    job_id: str,
    smiles: Optional[str],
    target_seq: Optional[str],
    model_name: str,
    cell_panel: str,
    receptor_pdb_path: Optional[str],
    ligand_path: Optional[str],
) -> None:
    logger.info("Job %s started — model=%s panel=%s", job_id, model_name, cell_panel)

    try:
        # Validate SMILES if provided; skip if user supplied a ligand file
        if smiles and not ligand_path:
            ok, err = validator.validate(smiles, target_seq or "A" * 20)
            if not ok:
                cache.write_job_failed(job_id, err)
                return

        cached = cache.get(smiles or "", target_seq or "", model_name, cell_panel)
        if cached and not receptor_pdb_path and not ligand_path:
            cache.write_job_complete(job_id, cached)
            logger.info("Job %s fulfilled from cache", job_id)
            return

        binding_result = binding.predict(
            smiles=smiles,
            target=target_seq,
            model_name=model_name,
            receptor_pdb_path=receptor_pdb_path,
            ligand_path=ligand_path,
            job_id=job_id,
        )
        offtarget_result = offtarget.score(smiles or "", model_name)
        cellline_result = cellline.predict(smiles or "", cell_panel)
        admet_result = admet.calculate(smiles or "")
        tanimoto_result = tanimoto.similarity(smiles or "", model_name)

        result = assembler.build(
            binding=binding_result,
            offtarget=offtarget_result,
            cellline=cellline_result,
            admet=admet_result,
            tanimoto=tanimoto_result,
            smiles=smiles or "",
            target=target_seq or "",
        )

        if smiles and target_seq and not receptor_pdb_path and not ligand_path:
            cache.set(smiles, target_seq, model_name, result, cell_panel)
        cache.write_job_complete(job_id, result)
        logger.info("Job %s complete — flags=%d", job_id, result["summary"]["total_flags"])

    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        cache.write_job_failed(job_id, str(exc))
    finally:
        # Clean up uploaded files
        job_dir = os.path.join(_UPLOAD_DIR, job_id)
        if os.path.exists(job_dir):
            shutil.rmtree(job_dir, ignore_errors=True)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", status_code=202)
async def predict(
    background_tasks: BackgroundTasks,
    smiles: Optional[str] = Form(None),
    target_sequence: Optional[str] = Form(None),
    model: str = Form("Vina"),
    cell_panel: str = Form("lung"),
    job_name: str = Form(""),
    receptor_pdb: Optional[UploadFile] = File(None),
    ligand_file: Optional[UploadFile] = File(None),
):
    if not smiles and not ligand_file:
        raise HTTPException(status_code=400, detail="Provide smiles or ligand_file")
    if not target_sequence and not receptor_pdb:
        raise HTTPException(status_code=400, detail="Provide target_sequence or receptor_pdb")

    display_name = job_name or (smiles[:20] + "…" if smiles and len(smiles) > 20 else smiles or "uploaded ligand")
    job_id = cache.create_job(
        smiles or "",
        target_sequence or "",
        model,
        cell_panel,
        display_name,
    )

    receptor_path = _save_upload(receptor_pdb, job_id, ".pdb") if receptor_pdb else None
    ligand_path = _save_upload(ligand_file, job_id, ".mol2") if ligand_file else None

    background_tasks.add_task(
        _run_prediction,
        job_id,
        smiles.strip() if smiles else None,
        target_sequence.strip() if target_sequence else None,
        model,
        cell_panel,
        receptor_path,
        ligand_path,
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
        return {
            "status": "complete",
            "result": json.loads(job["result"]),
            "meta": {
                "smiles": job.get("smiles"),
                "target": job.get("target"),
                "model": job.get("model"),
                "cell_panel": job.get("cell_panel"),
            },
        }
    if status == "failed":
        return {"status": "failed", "error": job.get("error")}
    return {"status": status}
