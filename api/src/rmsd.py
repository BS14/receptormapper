import logging
from collections import defaultdict
from typing import Optional

import numpy as np
import requests
from rdkit import Chem
from rdkit.Chem import AllChem, DataStructs

logger = logging.getLogger(__name__)

_WATER = {"HOH", "WAT", "H2O", "DOD", "SOL"}
_SELF_DOCK_THRESHOLD = 0.85
_SUCCESS_RMSD_A = 2.0


# ── Native ligand extraction ──────────────────────────────────────────────────

def extract_native_ligand(pdb_path: str) -> Optional[dict]:
    """Find largest non-water HETATM group in original PDB."""
    groups: dict = defaultdict(list)
    with open(pdb_path) as f:
        for line in f:
            if not line.startswith("HETATM"):
                continue
            resname = line[17:20].strip()
            if resname in _WATER:
                continue
            chain = line[21] if len(line) > 21 else " "
            resseq = line[22:26].strip() if len(line) > 26 else "1"
            try:
                coords = (float(line[30:38]), float(line[38:46]), float(line[46:54]))
            except (ValueError, IndexError):
                continue
            element = line[76:78].strip() if len(line) > 77 else line[13:14].strip()
            groups[(resname, chain, resseq)].append({
                "name": line[12:16].strip(),
                "coords": coords,
                "element": element.upper(),
            })

    if not groups:
        return None

    def _heavy(atoms: list) -> list:
        return [a for a in atoms if a["element"] not in ("H", "D", "")]

    best_key = max(groups, key=lambda k: len(_heavy(groups[k])))
    atoms = groups[best_key]
    heavy = _heavy(atoms)

    if not heavy:
        return None

    center = np.mean([a["coords"] for a in heavy], axis=0).tolist()
    logger.info(
        "Native ligand: %s chain %s — %d heavy atoms",
        best_key[0], best_key[1], len(heavy),
    )
    return {
        "resname": best_key[0],
        "chain": best_key[1],
        "atoms": atoms,       # all atoms incl. H — for 3D viewer embedding
        "heavy_atoms": heavy,
        "center": center,
        "heavy_count": len(heavy),
    }


# ── PubChem SMILES lookup ─────────────────────────────────────────────────────

def get_native_smiles(resname: str) -> Optional[str]:
    """Fetch canonical SMILES for a PDB CCD residue name via PubChem."""
    try:
        url = (
            f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name"
            f"/{resname}/property/IsomericSMILES/JSON"
        )
        resp = requests.get(url, timeout=10)
        if resp.ok:
            props = resp.json().get("PropertyTable", {}).get("Properties", [])
            if props:
                return props[0].get("IsomericSMILES")
    except Exception:
        logger.debug("PubChem lookup failed for residue %s", resname)
    return None


# ── Fingerprint similarity ────────────────────────────────────────────────────

def _tanimoto(smiles_a: str, smiles_b: str) -> float:
    try:
        mol_a = Chem.MolFromSmiles(smiles_a)
        mol_b = Chem.MolFromSmiles(smiles_b)
        if mol_a is None or mol_b is None:
            return 0.0
        fp_a = AllChem.GetMorganFingerprintAsBitVect(mol_a, 2, 2048)
        fp_b = AllChem.GetMorganFingerprintAsBitVect(mol_b, 2, 2048)
        return float(DataStructs.TanimotoSimilarity(fp_a, fp_b))
    except Exception:
        return 0.0


# ── Docked pose parsing ───────────────────────────────────────────────────────

def _parse_pose_coords(pdbqt_path: str) -> list[dict]:
    """Extract heavy atoms from a single-model PDBQT (no MODEL/ENDMDL headers)."""
    atoms = []
    with open(pdbqt_path) as f:
        for line in f:
            if not line.startswith(("ATOM", "HETATM")):
                continue
            # PDBQT element is in cols 78-79 (1-based); fallback to atom name col
            element = line[77:79].strip().upper() if len(line) > 78 else line[13:14].strip().upper()
            if element in ("H", "HD", "D", ""):
                continue
            try:
                coords = (float(line[30:38]), float(line[38:46]), float(line[46:54]))
                atoms.append({
                    "name": line[12:16].strip(),
                    "coords": coords,
                    "element": element,
                })
            except (ValueError, IndexError):
                continue
    return atoms


# ── RMSD calculation ──────────────────────────────────────────────────────────

def _compute_rmsd(atoms_a: list[dict], atoms_b: list[dict]) -> Optional[float]:
    """Approximate heavy-atom RMSD.

    Sorts both atom sets by (element, distance-to-centroid) and pairs them.
    Works well for self-docking where both sets are the same molecule.
    Returns None when element composition differs (different molecules).
    """
    if len(atoms_a) != len(atoms_b):
        return None

    def _sorted(atoms: list[dict]):
        coords = np.array([a["coords"] for a in atoms])
        centroid = coords.mean(axis=0)
        dists = np.linalg.norm(coords - centroid, axis=1)
        return sorted(
            zip([a["element"] for a in atoms], dists, [a["coords"] for a in atoms]),
            key=lambda x: (x[0], x[1]),
        )

    sa = _sorted(atoms_a)
    sb = _sorted(atoms_b)

    if any(a[0] != b[0] for a, b in zip(sa, sb)):
        return None  # element mismatch

    coords_a = np.array([x[2] for x in sa])
    coords_b = np.array([x[2] for x in sb])
    diff = coords_a - coords_b
    return float(np.sqrt((diff ** 2).sum(axis=1).mean()))


# ── Multi-pose analysis ───────────────────────────────────────────────────────

def _parse_pdbqt_models(pdbqt_path: str) -> list[list[dict]]:
    """Parse all MODEL blocks from Vina output PDBQT into heavy-atom lists."""
    models: list[list[dict]] = []
    current: list[dict] = []
    has_markers = False
    with open(pdbqt_path) as f:
        for line in f:
            if line.startswith("MODEL"):
                has_markers = True
                current = []
            elif line.startswith("ENDMDL"):
                if current:
                    models.append(current)
                current = []
            elif line.startswith(("ATOM", "HETATM")):
                element = line[77:79].strip().upper() if len(line) > 78 else line[13:14].strip().upper()
                if element in ("H", "HD", "D", ""):
                    continue
                try:
                    coords = (float(line[30:38]), float(line[38:46]), float(line[46:54]))
                    current.append({"name": line[12:16].strip(), "coords": coords, "element": element})
                except (ValueError, IndexError):
                    continue
    if not has_markers and current:
        models.append(current)
    return models


def per_pose_analysis(docked_pdbqt: str, original_pdb: str) -> list[dict]:
    """Return pocket-distance (and RMSD when atom counts match) for every Vina pose."""
    native = extract_native_ligand(original_pdb)
    pose_models = _parse_pdbqt_models(docked_pdbqt)
    results: list[dict] = []
    for atoms in pose_models:
        entry: dict = {}
        if not atoms or native is None:
            results.append(entry)
            continue
        pose_center = np.mean([a["coords"] for a in atoms], axis=0)
        native_center = np.array(native["center"])
        entry["pocket_distance_A"] = round(float(np.linalg.norm(pose_center - native_center)), 2)
        ratio = len(atoms) / max(native["heavy_count"], 1)
        if 0.8 <= ratio <= 1.2:
            rmsd = _compute_rmsd(native["heavy_atoms"], atoms)
            entry["rmsd_A"] = round(rmsd, 2) if rmsd is not None else None
        results.append(entry)
    return results


# ── Public API ────────────────────────────────────────────────────────────────

def run_analysis(original_pdb: str, best_pose_pdbqt: str, uploaded_smiles: str) -> dict:
    """Glide-style validation: compare docked pose to native crystal ligand.

    Returns a dict with available=False when no native ligand is detected,
    or a full metrics dict when one is found.
    """
    native = extract_native_ligand(original_pdb)
    if native is None:
        return {"available": False}

    docked_atoms = _parse_pose_coords(best_pose_pdbqt)
    if not docked_atoms:
        return {"available": False}

    docked_center = np.mean([a["coords"] for a in docked_atoms], axis=0).tolist()
    pocket_dist = float(np.linalg.norm(
        np.array(native["center"]) - np.array(docked_center)
    ))

    # Tanimoto → self vs cross docking
    tanimoto = 0.0
    mode = "cross_docking"
    if uploaded_smiles:
        native_smiles = get_native_smiles(native["resname"])
        if native_smiles:
            tanimoto = _tanimoto(uploaded_smiles, native_smiles)
            if tanimoto >= _SELF_DOCK_THRESHOLD:
                mode = "self_docking"

    # Heavy-atom RMSD only for self-docking with matching atom count
    ligand_rmsd: Optional[float] = None
    if mode == "self_docking":
        ratio = len(docked_atoms) / max(native["heavy_count"], 1)
        if 0.8 <= ratio <= 1.2:
            ligand_rmsd = _compute_rmsd(native["heavy_atoms"], docked_atoms)

    success = (ligand_rmsd < _SUCCESS_RMSD_A) if ligand_rmsd is not None else None

    logger.info(
        "RMSD analysis: mode=%s tanimoto=%.2f pocket_dist=%.2f Å rmsd=%s",
        mode, tanimoto, pocket_dist,
        f"{ligand_rmsd:.2f} Å" if ligand_rmsd is not None else "N/A",
    )

    return {
        "available": True,
        "native_resname": native["resname"],
        "native_heavy_count": native["heavy_count"],
        "native_center": native["center"],
        "docked_center": docked_center,
        "pocket_distance_A": round(pocket_dist, 2),
        "mode": mode,
        "tanimoto": round(tanimoto, 3),
        "ligand_rmsd_A": round(ligand_rmsd, 2) if ligand_rmsd is not None else None,
        "success": success,
        "native_atoms": native["atoms"],  # stripped before storing to DynamoDB
    }
