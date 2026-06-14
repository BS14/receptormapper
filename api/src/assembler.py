import logging

logger = logging.getLogger(__name__)

_STRONG_BINDING_DG = -9.0   # ΔG threshold for a "very strong" potency flag
_LOW_CONFIDENCE = 0.50
_NONPHYSICAL_DG = -15.0    # Vina ΔG below this is non-physical (wrong pocket)


def build(binding: dict, inputs: dict | None = None) -> dict:
    flags = _generate_flags(binding)
    result: dict = {
        "binding": binding,
        "flags": flags,
        "summary": {"total_flags": len(flags)},
    }
    if inputs:
        result["inputs"] = inputs
    return result


def _generate_flags(binding: dict) -> list[dict]:
    flags: list[dict] = []
    delta_g = binding.get("delta_g", 0.0)

    if delta_g <= _STRONG_BINDING_DG:
        flags.append({
            "type": "potency",
            "level": "info",
            "message": (
                f"Very strong predicted binding (ΔG {delta_g:.1f} kcal/mol). "
                "Verify target selectivity — cross-reactivity with related proteins is likely."
            ),
        })

    if binding.get("confidence", 1.0) < _LOW_CONFIDENCE:
        flags.append({
            "type": "reliability",
            "level": "warning",
            "message": (
                "Docking confidence is low. "
                "Result is exploratory — consider alternative poses or increasing exhaustiveness."
            ),
        })

    if delta_g < _NONPHYSICAL_DG:
        flags.append({
            "type": "docking_quality",
            "level": "warning",
            "message": (
                f"Vina ΔG {delta_g:.1f} kcal/mol is outside the physical range (−3 to −12). "
                "The binding box may have been miscentered. pIC50 has been capped at 12.0. "
                "Re-docking with a corrected box is recommended."
            ),
        })

    rmsd_info = binding.get("rmsd", {})
    if rmsd_info.get("mode") == "self_docking":
        rmsd_val = rmsd_info.get("ligand_rmsd_A")
        if rmsd_val is not None and rmsd_val > 2.0:
            flags.append({
                "type": "pose_quality",
                "level": "warning",
                "message": (
                    f"Self-docking RMSD {rmsd_val:.2f} Å exceeds 2.0 Å threshold. "
                    "Docked pose diverges from crystal structure — results are exploratory."
                ),
            })

    return flags
