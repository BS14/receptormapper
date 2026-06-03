import json
import logging
import os

logger = logging.getLogger(__name__)

_PANEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "offtarget_panel", "panel.json"
)
_panel: list[dict] | None = None


def _load_panel() -> list[dict]:
    global _panel
    if _panel is not None:
        return _panel
    with open(_PANEL_PATH) as f:
        _panel = json.load(f)
    logger.info("Loaded %d off-target proteins", len(_panel))
    return _panel


def score(smiles: str, model_name: str = "MPNN_CNN_BindingDB_IC50") -> list[dict]:
    panel = _load_panel()
    results = []

    from . import binding as _binding

    for protein in panel:
        try:
            pred = _binding.predict(smiles, protein["sequence"], model_name)
            pic50 = pred["pIC50"]
            risk, flag = _risk(protein["name"], pic50)
            results.append({
                "name": protein["name"],
                "family": protein["family"],
                "pic50": pic50,
                "risk": risk,
                "flag": flag,
            })
        except Exception:
            logger.exception("Off-target scoring failed for %s", protein["name"])
            results.append({
                "name": protein["name"],
                "family": protein["family"],
                "pic50": 0.0,
                "risk": "unknown",
                "flag": False,
            })

    results.sort(key=lambda x: x["pic50"], reverse=True)
    return results


def _risk(name: str, pic50: float) -> tuple[str, bool]:
    # hERG and Nav1.5 have stricter thresholds (cardiac liability)
    if name in ("hERG", "Nav1.5", "Cav1.2"):
        if pic50 >= 5.5:
            return "high", True
        if pic50 >= 4.5:
            return "medium", False
        return "low", False

    # General thresholds for all other targets
    if pic50 >= 6.0:
        return "high", True
    if pic50 >= 5.0:
        return "medium", False
    return "low", False
