import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path

import requests
from rdkit import Chem
from rdkit.Chem import AllChem

logger = logging.getLogger(__name__)

# RT*ln(10) at 310 K (body temperature) in kcal/mol
_RT_LN10 = 1.420

_ESMATLAS_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"


# ── Ligand preparation ────────────────────────────────────────────────────────

def _smiles_to_pdbqt(smiles: str, workdir: str) -> str:
    """SMILES → 3D conformer (RDKit ETKDG) → PDBQT via Meeko."""
    from meeko import MoleculePreparation

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    if AllChem.EmbedMolecule(mol, params) == -1:
        raise RuntimeError("3D embedding failed for ligand")
    AllChem.MMFFOptimizeMolecule(mol)

    prep = MoleculePreparation()
    mol_setups = prep.prepare(mol)
    pdbqt_string = MoleculePreparation.write_pdbqt_string(mol_setups[0])

    ligand_path = os.path.join(workdir, "ligand.pdbqt")
    with open(ligand_path, "w") as f:
        f.write(pdbqt_string)
    return ligand_path


# ── Receptor preparation ──────────────────────────────────────────────────────

def _fold_sequence(sequence: str) -> str:
    """Call ESMFold API → return PDB text."""
    logger.info("Folding sequence via ESMFold (%d AA)", len(sequence))
    resp = requests.post(
        _ESMATLAS_URL,
        data=sequence,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.text


def _pdb_to_pdbqt(pdb_text: str, workdir: str) -> str:
    """PDB text → receptor.pdbqt via obabel."""
    pdb_path = os.path.join(workdir, "receptor.pdb")
    pdbqt_path = os.path.join(workdir, "receptor.pdbqt")
    with open(pdb_path, "w") as f:
        f.write(pdb_text)
    subprocess.run(
        ["obabel", pdb_path, "-O", pdbqt_path, "-xr", "--partialcharge", "gasteiger"],
        check=True, capture_output=True,
    )
    return pdbqt_path


# ── Binding site detection ────────────────────────────────────────────────────

def _fpocket_box(pdb_path: str, workdir: str) -> dict:
    """Run fpocket on receptor PDB, return box for best pocket."""
    result = subprocess.run(
        ["fpocket", "-f", pdb_path],
        capture_output=True, cwd=workdir,
    )
    # fpocket writes output to <name>_out/ directory
    pdb_stem = Path(pdb_path).stem
    info_file = Path(workdir) / f"{pdb_stem}_out" / f"{pdb_stem}_info.txt"
    if not info_file.exists() or result.returncode != 0:
        return _whole_protein_box(pdb_path)

    # Parse pocket 1 center from info file
    cx = cy = cz = None
    with open(info_file) as f:
        for line in f:
            if "Pocket 1" in line:
                break
        for line in f:
            m = re.search(r"x_barycenter\s*:\s*([\d.\-]+)", line)
            if m:
                cx = float(m.group(1))
            m = re.search(r"y_barycenter\s*([\d.\-]+)", line)
            if m:
                cy = float(m.group(1))
            m = re.search(r"z_barycenter\s*([\d.\-]+)", line)
            if m:
                cz = float(m.group(1))
            if cx and cy and cz:
                break

    if None in (cx, cy, cz):
        return _whole_protein_box(pdb_path)

    return {"center_x": cx, "center_y": cy, "center_z": cz,
            "size_x": 25.0, "size_y": 25.0, "size_z": 25.0}


def _whole_protein_box(pdb_path: str) -> dict:
    """Fallback: bounding box covering entire protein + 10Å padding."""
    xs, ys, zs = [], [], []
    with open(pdb_path) as f:
        for line in f:
            if line.startswith(("ATOM", "HETATM")):
                try:
                    xs.append(float(line[30:38]))
                    ys.append(float(line[38:46]))
                    zs.append(float(line[46:54]))
                except ValueError:
                    continue
    if not xs:
        return {"center_x": 0, "center_y": 0, "center_z": 0,
                "size_x": 30, "size_y": 30, "size_z": 30}
    pad = 10.0
    return {
        "center_x": (max(xs) + min(xs)) / 2,
        "center_y": (max(ys) + min(ys)) / 2,
        "center_z": (max(zs) + min(zs)) / 2,
        "size_x": min(max(xs) - min(xs) + pad, 60),
        "size_y": min(max(ys) - min(ys) + pad, 60),
        "size_z": min(max(zs) - min(zs) + pad, 60),
    }


# ── Vina docking ──────────────────────────────────────────────────────────────

def _run_vina(receptor_pdbqt: str, ligand_pdbqt: str, box: dict, workdir: str) -> float:
    """Run AutoDock Vina, return best binding energy (kcal/mol)."""
    out_path = os.path.join(workdir, "out.pdbqt")
    cmd = [
        "vina",
        "--receptor", receptor_pdbqt,
        "--ligand", ligand_pdbqt,
        "--center_x", str(box["center_x"]),
        "--center_y", str(box["center_y"]),
        "--center_z", str(box["center_z"]),
        "--size_x", str(box["size_x"]),
        "--size_y", str(box["size_y"]),
        "--size_z", str(box["size_z"]),
        "--out", out_path,
        "--exhaustiveness", "16",
        "--num_modes", "5",
        "--cpu", str(os.cpu_count() or 2),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    logger.debug("Vina stdout: %s", result.stdout)

    # Parse best score from output (first mode line: "   1  -X.X  ...")
    for line in result.stdout.splitlines():
        parts = line.split()
        if parts and parts[0] == "1" and len(parts) >= 2:
            try:
                return float(parts[1])
            except ValueError:
                continue

    raise RuntimeError(f"Could not parse Vina output:\n{result.stdout}\n{result.stderr}")


# ── Conversion helpers ────────────────────────────────────────────────────────

def _delta_g_to_pic50(delta_g: float) -> float:
    """ΔG (kcal/mol) → pIC50 using RT·ln(10) at 310 K."""
    return -delta_g / _RT_LN10


def _vina_confidence(delta_g: float) -> float:
    if delta_g <= -9.0:
        return 0.90
    if delta_g <= -7.0:
        return 0.75
    if delta_g <= -5.0:
        return 0.60
    return 0.40


def _strength_label(pic50: float) -> str:
    if pic50 >= 7.0:
        return "strong"
    if pic50 >= 5.0:
        return "moderate"
    return "weak"


# ── Descriptor fallback (no Vina / ESMFold) ───────────────────────────────────

def _descriptor_pic50(smiles: str) -> float:
    try:
        from rdkit.Chem import Descriptors
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return 5.0
        mw = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        tpsa = Descriptors.TPSA(mol)
        rings = Descriptors.RingCount(mol)
        return (
            4.2
            + min(mw / 500.0, 1.0) * 1.5
            + min(max(logp, 0), 5.0) / 5.0 * 1.0
            - tpsa / 200.0 * 0.6
            + min(rings, 4) * 0.1
        )
    except Exception:
        return 5.0


# ── Public API ────────────────────────────────────────────────────────────────

def predict(smiles: str, target: str, model_name: str = "Vina") -> dict:
    try:
        with tempfile.TemporaryDirectory() as wd:
            ligand_pdbqt = _smiles_to_pdbqt(smiles, wd)
            pdb_text = _fold_sequence(target)
            receptor_pdbqt = _pdb_to_pdbqt(pdb_text, wd)
            pdb_path = os.path.join(wd, "receptor.pdb")
            box = _fpocket_box(pdb_path, wd)
            delta_g = _run_vina(receptor_pdbqt, ligand_pdbqt, box, wd)

        pic50 = max(3.0, min(12.0, _delta_g_to_pic50(delta_g)))
        return {
            "pIC50": round(pic50, 2),
            "delta_g": round(delta_g, 2),
            "ic50_nM": round(10 ** (9 - pic50), 1),
            "confidence": _vina_confidence(delta_g),
            "strength": _strength_label(pic50),
        }
    except Exception:
        logger.exception("Vina docking failed — using descriptor fallback")
        pic50 = _descriptor_pic50(smiles)
        pic50 = max(3.0, min(10.0, pic50))
        return {
            "pIC50": round(pic50, 2),
            "delta_g": round(-1.364 * pic50, 2),
            "ic50_nM": round(10 ** (9 - pic50), 1),
            "confidence": 0.40,
            "strength": _strength_label(pic50),
        }
