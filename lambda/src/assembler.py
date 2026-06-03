import logging

logger = logging.getLogger(__name__)

_HERG_HIGH_THRESHOLD = 5.5
_CYP3A4_HIGH_THRESHOLD = 5.0
_RO5_VIOLATION_THRESHOLD = 2


def build(
    binding: dict,
    offtarget: list[dict],
    cellline: list[dict],
    admet: dict,
    tanimoto: dict,
    smiles: str,
    target: str,
) -> dict:
    # Tanimoto-adjusted confidence overrides the raw model confidence
    binding = {**binding, "confidence": tanimoto["adj_confidence"]}

    flags = _generate_flags(binding, offtarget, admet, tanimoto)

    high_risk_ots = sum(1 for ot in offtarget if ot["risk"] == "high")
    sensitive_lines = sum(1 for cl in cellline if cl["ic50"] < 1.0)

    return {
        "binding": binding,
        "offtarget": offtarget,
        "cellline": cellline,
        "admet": admet,
        "tanimoto": tanimoto,
        "flags": flags,
        "summary": {
            "total_flags": len(flags),
            "high_risk_ots": high_risk_ots,
            "sensitive_lines": sensitive_lines,
        },
    }


def _generate_flags(
    binding: dict,
    offtarget: list[dict],
    admet: dict,
    tanimoto: dict,
) -> list[dict]:
    flags: list[dict] = []

    ot_by_name = {ot["name"]: ot for ot in offtarget}

    herg = ot_by_name.get("hERG")
    if herg and herg["pic50"] >= _HERG_HIGH_THRESHOLD:
        flags.append({
            "type": "cardiac",
            "level": "danger",
            "message": (
                f"hERG binding pIC50 {herg['pic50']:.1f} — cardiac liability risk. "
                "Patch-clamp assay recommended."
            ),
        })

    cyp = ot_by_name.get("CYP3A4")
    if cyp and cyp["pic50"] >= _CYP3A4_HIGH_THRESHOLD:
        flags.append({
            "type": "metabolism",
            "level": "warning",
            "message": (
                f"CYP3A4 inhibition pIC50 {cyp['pic50']:.1f} — "
                "drug-drug interaction potential. In-vitro CYP inhibition assay recommended."
            ),
        })

    if tanimoto["extrapolation_risk"]:
        flags.append({
            "type": "reliability",
            "level": "warning",
            "message": (
                f"Low training-set similarity (max Tanimoto {tanimoto['max_tanimoto']:.2f}). "
                "Prediction is extrapolation — treat with caution."
            ),
        })

    if admet["ro5_violations"] >= _RO5_VIOLATION_THRESHOLD:
        flags.append({
            "type": "druglikeness",
            "level": "info",
            "message": (
                f"Lipinski Ro5 violations: {admet['ro5_violations']}. "
                "Poor oral bioavailability likely."
            ),
        })

    return flags
