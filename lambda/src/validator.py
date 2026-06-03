import re

_VALID_AA = set("ACDEFGHIKLMNPQRSTVWY")
_MIN_TARGET_LEN = 20
_MAX_TARGET_LEN = 4000
_MAX_SMILES_LEN = 500


def validate(smiles: str, target: str) -> tuple[bool, str | None]:
    if not smiles or not isinstance(smiles, str):
        return False, "SMILES string is required"
    if len(smiles) > _MAX_SMILES_LEN:
        return False, f"SMILES exceeds {_MAX_SMILES_LEN} character limit"

    try:
        from rdkit import Chem
        mol = Chem.MolFromSmiles(smiles.strip())
        if mol is None:
            return False, "Invalid SMILES: RDKit could not parse the structure"
    except ImportError:
        # Fallback: basic character check when RDKit unavailable
        if not re.match(r'^[A-Za-z0-9@+\-\[\]()=#%./\\]+$', smiles):
            return False, "Invalid SMILES: unexpected characters"

    if not target or not isinstance(target, str):
        return False, "Protein target sequence is required"

    seq = target.strip().upper()
    if len(seq) < _MIN_TARGET_LEN:
        return False, f"Target sequence too short (minimum {_MIN_TARGET_LEN} amino acids)"
    if len(seq) > _MAX_TARGET_LEN:
        return False, f"Target sequence too long (maximum {_MAX_TARGET_LEN} amino acids)"

    invalid_chars = set(seq) - _VALID_AA
    if invalid_chars:
        return False, f"Invalid amino acid characters in target: {', '.join(sorted(invalid_chars))}"

    return True, None
