import logging
import math
import os

logger = logging.getLogger(__name__)

_model = None
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "MPNN_CNN_BindingDB")


def _load_model():
    global _model
    if _model is not None:
        return _model
    try:
        from DeepPurpose import DTI as dti_models
        _model = dti_models.load_pretrained(_MODEL_DIR)
        logger.info("DeepPurpose model loaded from %s", _MODEL_DIR)
    except Exception:
        logger.warning("Could not load DeepPurpose model — using descriptor fallback")
        _model = "fallback"
    return _model


def predict(smiles: str, target: str, model_name: str = "MPNN_CNN_BindingDB_IC50") -> dict:
    model = _load_model()

    pic50: float
    if model != "fallback" and model is not None:
        try:
            y = model.predict([smiles], [target])
            pic50 = float(y[0])
        except Exception:
            logger.exception("DeepPurpose inference failed — using fallback")
            pic50 = _descriptor_pic50(smiles)
    else:
        pic50 = _descriptor_pic50(smiles)

    pic50 = max(3.0, min(10.0, pic50))
    ic50_nm = 10 ** (9 - pic50)
    delta_g = -1.364 * pic50  # kcal/mol approximation at 37 °C

    return {
        "pIC50": round(pic50, 2),
        "delta_g": round(delta_g, 2),
        "ic50_nM": round(ic50_nm, 2),
        "confidence": _base_confidence(pic50),
        "strength": _strength_label(pic50),
    }


def _descriptor_pic50(smiles: str) -> float:
    """
    Heuristic fallback using RDKit descriptors.
    Produces deterministic, physically plausible estimates when the
    DeepPurpose model weights are absent (dev / CI environment).
    """
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return 5.0
        mw = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        tpsa = Descriptors.TPSA(mol)
        rings = Descriptors.RingCount(mol)
        score = (
            4.2
            + min(mw / 500.0, 1.0) * 1.5
            + min(max(logp, 0), 5.0) / 5.0 * 1.0
            - tpsa / 200.0 * 0.6
            + min(rings, 4) * 0.1
        )
        return score
    except Exception:
        return 5.0


def _base_confidence(pic50: float) -> float:
    if pic50 >= 7.0:
        return 0.85
    if pic50 >= 5.0:
        return 0.75
    return 0.60


def _strength_label(pic50: float) -> str:
    if pic50 >= 7.0:
        return "strong"
    if pic50 >= 5.0:
        return "moderate"
    return "weak"
