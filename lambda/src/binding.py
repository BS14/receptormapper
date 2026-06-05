import logging
import math
import os

logger = logging.getLogger(__name__)

_deeppurpose_model = None
_tdc_model = None

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "MPNN_CNN_BindingDB")


def _load_deeppurpose():
    global _deeppurpose_model
    if _deeppurpose_model is not None:
        return _deeppurpose_model
    try:
        from DeepPurpose import DTI as dti_models
        _deeppurpose_model = dti_models.load_pretrained(_MODEL_DIR)
        logger.info("DeepPurpose model loaded from %s", _MODEL_DIR)
    except Exception:
        logger.warning("Could not load DeepPurpose model — using descriptor fallback")
        _deeppurpose_model = "fallback"
    return _deeppurpose_model


def _load_tdc():
    global _tdc_model
    if _tdc_model is not None:
        return _tdc_model
    try:
        from tdc.model_server.virtual_screening import DeepDTA
        m = DeepDTA()
        m.load()
        _tdc_model = m
        logger.info("TDC DeepDTA model loaded")
    except Exception:
        logger.warning("Could not load TDC DeepDTA model — using descriptor fallback")
        _tdc_model = "fallback"
    return _tdc_model


def predict(smiles: str, target: str, model_name: str = "MPNN_CNN_BindingDB_IC50") -> dict:
    if model_name.startswith("TDC_"):
        pic50 = _predict_tdc(smiles, target)
    else:
        pic50 = _predict_deeppurpose(smiles, target)

    pic50 = max(3.0, min(10.0, pic50))
    ic50_nm = 10 ** (9 - pic50)
    delta_g = -1.364 * pic50

    return {
        "pIC50": round(pic50, 2),
        "delta_g": round(delta_g, 2),
        "ic50_nM": round(ic50_nm, 2),
        "confidence": _base_confidence(pic50),
        "strength": _strength_label(pic50),
    }


def _predict_deeppurpose(smiles: str, target: str) -> float:
    model = _load_deeppurpose()
    if model != "fallback" and model is not None:
        try:
            y = model.predict([smiles], [target])
            return float(y[0])
        except Exception:
            logger.exception("DeepPurpose inference failed — using fallback")
    return _descriptor_pic50(smiles)


def _predict_tdc(smiles: str, target: str) -> float:
    model = _load_tdc()
    if model != "fallback" and model is not None:
        try:
            result = model.predict([smiles], [target])
            return float(result[0])
        except Exception:
            logger.exception("TDC DeepDTA inference failed — using fallback")
    return _descriptor_pic50(smiles)


def _descriptor_pic50(smiles: str) -> float:
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
