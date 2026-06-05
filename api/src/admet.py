import logging

logger = logging.getLogger(__name__)


def calculate(smiles: str) -> dict:
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, rdMolDescriptors
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("Invalid SMILES")

        mw = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        hbd = Descriptors.NumHDonors(mol)
        hba = Descriptors.NumHAcceptors(mol)
        tpsa = Descriptors.TPSA(mol)
        rot_bonds = rdMolDescriptors.CalcNumRotatableBonds(mol)
        arom_rings = rdMolDescriptors.CalcNumAromaticRings(mol)

        violations = sum([
            mw > 500,
            logp > 5,
            hbd > 5,
            hba > 10,
        ])

        return {
            "mw": round(mw, 2),
            "logP": round(logp, 2),
            "hbd": hbd,
            "hba": hba,
            "tpsa": round(tpsa, 2),
            "rotatable_bonds": rot_bonds,
            "aromatic_rings": arom_rings,
            "ro5_violations": violations,
            "drug_like": violations <= 1,
        }
    except Exception:
        logger.exception("ADMET calculation failed for SMILES: %s", smiles)
        return {
            "mw": 0.0,
            "logP": 0.0,
            "hbd": 0,
            "hba": 0,
            "tpsa": 0.0,
            "rotatable_bonds": 0,
            "aromatic_rings": 0,
            "ro5_violations": 0,
            "drug_like": False,
        }
