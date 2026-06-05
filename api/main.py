import logging

from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from src import admet, assembler, binding, cache, cellline, offtarget, tanimoto, validator

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ReceptorMapper")


class PredictRequest(BaseModel):
    job_id: str
    smiles: str
    target_sequence: str
    model: str = "MPNN_CNN_BindingDB_IC50"
    cell_panel: str = "lung"


def _run_prediction(job_id: str, smiles: str, target_seq: str, model_name: str, cell_panel: str) -> None:
    logger.info("Job %s started — model=%s panel=%s", job_id, model_name, cell_panel)

    ok, err = validator.validate(smiles, target_seq)
    if not ok:
        cache.write_job_failed(job_id, err)
        return

    cached = cache.get(smiles, target_seq, model_name, cell_panel)
    if cached:
        cache.write_job_complete(job_id, cached)
        logger.info("Job %s fulfilled from cache", job_id)
        return

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

    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        cache.write_job_failed(job_id, str(exc))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", status_code=202)
def predict(req: PredictRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        _run_prediction,
        req.job_id,
        req.smiles.strip(),
        req.target_sequence.strip(),
        req.model,
        req.cell_panel,
    )
    return {"status": "queued", "job_id": req.job_id}
