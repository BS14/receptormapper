import logging
import os
import pickle

logger = logging.getLogger(__name__)

_FPS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "MPNN_CNN_BindingDB", "train_fps.pkl"
)
_train_fps = None


def _load_fps():
    global _train_fps
    if _train_fps is not None:
        return _train_fps
    if not os.path.exists(_FPS_PATH):
        logger.warning("train_fps.pkl not found at %s — Tanimoto will use defaults", _FPS_PATH)
        _train_fps = []
        return _train_fps
    try:
        with open(_FPS_PATH, "rb") as f:
            _train_fps = pickle.load(f)
        logger.info("Loaded %d training fingerprints", len(_train_fps))
    except Exception:
        logger.exception("Failed to load training fingerprints")
        _train_fps = []
    return _train_fps


def similarity(smiles: str, model_name: str = "MPNN_CNN_BindingDB_IC50") -> dict:
    fps = _load_fps()

    if not fps:
        return {
            "max_tanimoto": 0.0,
            "mean_top10": 0.0,
            "adj_confidence": 0.40,
            "extrapolation_risk": True,
        }

    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem, DataStructs

        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("Invalid SMILES")

        query_fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=2048)
        sims = DataStructs.BulkTanimotoSimilarity(query_fp, fps)
        sims.sort(reverse=True)

        max_sim = sims[0] if sims else 0.0
        top10_mean = sum(sims[:10]) / min(len(sims), 10)

        adj_conf = _adj_confidence(max_sim)
        extrap_risk = max_sim < 0.3

        return {
            "max_tanimoto": round(max_sim, 3),
            "mean_top10": round(top10_mean, 3),
            "adj_confidence": adj_conf,
            "extrapolation_risk": extrap_risk,
        }
    except Exception:
        logger.exception("Tanimoto similarity failed")
        return {
            "max_tanimoto": 0.0,
            "mean_top10": 0.0,
            "adj_confidence": 0.40,
            "extrapolation_risk": True,
        }


def _adj_confidence(max_tanimoto: float) -> float:
    if max_tanimoto >= 0.7:
        return 0.90
    if max_tanimoto >= 0.5:
        return 0.75
    if max_tanimoto >= 0.3:
        return 0.60
    return 0.40
