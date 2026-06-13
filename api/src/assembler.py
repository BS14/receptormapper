import logging

logger = logging.getLogger(__name__)

_STRONG_BINDING_DG = -9.0   # ΔG threshold for a "very strong" potency flag
_LOW_CONFIDENCE = 0.50


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

    return flags
