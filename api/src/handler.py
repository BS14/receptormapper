import json
import logging
import os

from . import admet, assembler, binding, cache, cellline, offtarget, tanimoto, validator

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def lambda_handler(event: dict, context) -> dict:
    job_id = event.get("job_id", "unknown")
    smiles = (event.get("smiles") or "").strip()
    target_seq = (event.get("target_sequence") or "").strip()
    model_name = event.get("model", "MPNN_CNN_BindingDB_IC50")
    cell_panel = event.get("cell_panel", "lung")

    logger.info("Job %s started — model=%s panel=%s", job_id, model_name, cell_panel)

    # --- Validate inputs ---
    ok, err = validator.validate(smiles, target_seq)
    if not ok:
        cache.write_job_failed(job_id, err)
        return {"statusCode": 400, "body": json.dumps({"error": err})}

    # --- Cache check ---
    cached = cache.get(smiles, target_seq, model_name, cell_panel)
    if cached:
        cache.write_job_complete(job_id, cached)
        logger.info("Job %s fulfilled from cache", job_id)
        return {"statusCode": 200, "body": json.dumps(cached)}

    # --- Full prediction pipeline ---
    try:
        binding_result = binding.predict(smiles, target_seq, model_name)
        offtarget_result = offtarget.score(smiles, model_name)
        cellline_result = cellline.predict(smiles, cell_panel)
        admet_result = admet.calculate(smiles)
        tanimoto_result = tanimoto.similarity(smiles, model_name)

        result = assembler.build(
            binding=binding_result,
            offtarget=offtarget_result,
            cellline=cellline_result,
            admet=admet_result,
            tanimoto=tanimoto_result,
            smiles=smiles,
            target=target_seq,
        )

        cache.set(smiles, target_seq, model_name, result, cell_panel)
        cache.write_job_complete(job_id, result)
        logger.info("Job %s complete — flags=%d", job_id, result["summary"]["total_flags"])
        return {"statusCode": 200, "body": json.dumps(result)}

    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        cache.write_job_failed(job_id, str(exc))
        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}
