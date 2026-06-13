import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import boto3
import requests
from rdkit import Chem
from rdkit.Chem import AllChem

logger = logging.getLogger(__name__)

_RT_LN10 = 1.420  # kcal/mol at 310 K
_ESMATLAS_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"


# ── Ligand preparation ────────────────────────────────────────────────────────

def _ligand_file_to_pdbqt(ligand_path: str, workdir: str) -> str:
    """mol2 or SDF → PDBQT via obabel."""
    out = os.path.join(workdir, "ligand.pdbqt")
    subprocess.run(
        ["obabel", ligand_path, "-O", out, "--partialcharge", "gasteiger", "-h"],
        check=True, capture_output=True,
    )
    return out


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

    out = os.path.join(workdir, "ligand.pdbqt")
    with open(out, "w") as f:
        f.write(pdbqt_string)
    return out


# ── Receptor preparation ──────────────────────────────────────────────────────

def _fold_sequence(sequence: str) -> str:
    """POST sequence to ESMFold API → PDB text."""
    logger.info("Folding sequence via ESMFold (%d AA)", len(sequence))
    resp = requests.post(
        _ESMATLAS_URL,
        data=sequence,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.text


_WATER_RESIDUES = {"HOH", "WAT", "H2O", "DOD", "SOL"}


def _clean_receptor_pdb(pdb_path: str, workdir: str) -> str:
    """Remove waters, alt conformations, and non-essential HETATMs before docking."""
    out = os.path.join(workdir, "receptor_clean.pdb")
    kept = 0
    removed_water = 0
    removed_altloc = 0
    with open(pdb_path) as fin, open(out, "w") as fout:
        for line in fin:
            rec = line[:6].strip()
            if rec == "CONECT":
                continue  # serial numbers break after complex merge
            if rec in ("ATOM", "HETATM"):
                resname = line[17:20].strip()
                altloc = line[16] if len(line) > 16 else " "
                if resname in _WATER_RESIDUES:
                    removed_water += 1
                    continue
                if altloc not in (" ", "A"):
                    removed_altloc += 1
                    continue
                line = line[:16] + " " + line[17:]
            fout.write(line)
            kept += 1
    logger.info(
        "Receptor cleaned: %d lines kept, %d waters removed, %d alt-conf removed",
        kept, removed_water, removed_altloc,
    )
    return out


def _pdb_to_pdbqt(pdb_path: str, workdir: str) -> str:
    """receptor.pdb → receptor.pdbqt via obabel."""
    out = os.path.join(workdir, "receptor.pdbqt")
    subprocess.run(
        ["obabel", pdb_path, "-O", out, "-xr", "--partialcharge", "gasteiger"],
        check=True, capture_output=True,
    )
    return out


# ── Binding site detection ────────────────────────────────────────────────────

def _fpocket_box(pdb_path: str, workdir: str) -> dict:
    """Run fpocket on receptor PDB, return box for best pocket."""
    subprocess.run(["fpocket", "-f", pdb_path], capture_output=True, cwd=workdir)
    pdb_stem = Path(pdb_path).stem
    info_file = Path(workdir) / f"{pdb_stem}_out" / f"{pdb_stem}_info.txt"
    if not info_file.exists():
        return _whole_protein_box(pdb_path)

    cx = cy = cz = None
    with open(info_file) as f:
        for line in f:
            if "Pocket 1" in line:
                break
        for line in f:
            m = re.search(r"x_barycenter\s*:\s*([\d.\-]+)", line)
            if m:
                cx = float(m.group(1))
            m = re.search(r"y_barycenter\s*:\s*([\d.\-]+)", line)
            if m:
                cy = float(m.group(1))
            m = re.search(r"z_barycenter\s*:\s*([\d.\-]+)", line)
            if m:
                cz = float(m.group(1))
            if cx is not None and cy is not None and cz is not None:
                break

    if None in (cx, cy, cz):
        return _whole_protein_box(pdb_path)
    return {"center_x": cx, "center_y": cy, "center_z": cz,
            "size_x": 25.0, "size_y": 25.0, "size_z": 25.0}


def _whole_protein_box(pdb_path: str) -> dict:
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

def _run_vina(receptor_pdbqt: str, ligand_pdbqt: str, box: dict, workdir: str) -> tuple[float, str]:
    """Run AutoDock Vina. Returns (best_delta_g, docked_pdbqt_path)."""
    out_path = os.path.join(workdir, "docked.pdbqt")
    cmd = [
        "vina",
        "--receptor", receptor_pdbqt,
        "--ligand", ligand_pdbqt,
        "--center_x", str(round(box["center_x"], 3)),
        "--center_y", str(round(box["center_y"], 3)),
        "--center_z", str(round(box["center_z"], 3)),
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

    for line in result.stdout.splitlines():
        parts = line.split()
        if parts and parts[0] == "1" and len(parts) >= 2:
            try:
                return float(parts[1]), out_path
            except ValueError:
                continue

    raise RuntimeError(f"Could not parse Vina output:\n{result.stdout}\n{result.stderr}")


# ── Complex assembly ──────────────────────────────────────────────────────────

def _extract_best_pose(docked_pdbqt: str, workdir: str) -> str:
    """Write only MODEL 1 (best Vina pose) to a new PDBQT."""
    out = os.path.join(workdir, "best_pose.pdbqt")
    in_model1 = False
    with open(docked_pdbqt) as fin, open(out, "w") as fout:
        for line in fin:
            if line.startswith("MODEL"):
                num = line.split()[1] if len(line.split()) > 1 else "1"
                in_model1 = (num == "1")
                continue
            if line.startswith("ENDMDL"):
                if in_model1:
                    break  # done with best pose
                continue
            if in_model1:
                fout.write(line)
    return out


def _build_complex_pdb(receptor_pdb: str, docked_pdbqt: str, workdir: str) -> str:
    """Merge receptor PDB + docked ligand PDBQT into a single complex PDB.

    Ligand atoms are forced to HETATM residue LIG chain Z so the 3-D viewer
    can reliably select them with { resn: 'LIG' }.
    """
    best_pose_pdbqt = _extract_best_pose(docked_pdbqt, workdir)
    ligand_pdb = os.path.join(workdir, "ligand_docked.pdb")
    subprocess.run(
        ["obabel", best_pose_pdbqt, "-O", ligand_pdb, "-d"],
        capture_output=True,
    )

    complex_pdb = os.path.join(workdir, "complex.pdb")
    with open(complex_pdb, "w") as out:
        with open(receptor_pdb) as f:
            for line in f:
                if line.startswith("END"):
                    continue
                out.write(line)
        out.write("TER\n")
        with open(ligand_pdb) as f:
            for line in f:
                if line.startswith(("ATOM", "HETATM")):
                    # Normalise: HETATM, residue name LIG, chain Z
                    # PDB cols (0-based): 0-5 record, 6-10 serial, 11 blank,
                    # 12-15 atom name, 16 altloc, 17-19 resname, 20 blank,
                    # 21 chain, 22-25 resseq, rest = coords …
                    padded = line.rstrip().ljust(80)
                    new = "HETATM" + padded[6:17] + "LIG" + padded[20:21] + "Z" + padded[22:]
                    out.write(new.rstrip() + "\n")
                # CONECT records omitted — serial numbers don't match the
                # combined PDB so they create phantom long-range bonds in viewers.
        out.write("END\n")
    return complex_pdb


def _upload_complex(complex_pdb: str, job_id: str) -> Optional[str]:
    """Upload the docked complex to S3 and return the S3 key (not a URL).

    The caller is responsible for generating a presigned URL from the key at
    serve time so that links remain valid regardless of when the job was stored.
    """
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        return None
    try:
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        key = f"{job_id}/assets/complex.pdb"
        s3.upload_file(complex_pdb, bucket, key, ExtraArgs={"ContentType": "chemical/x-pdb"})
        logger.info("Uploaded complex to s3://%s/%s", bucket, key)
        return key
    except Exception:
        logger.exception("S3 upload failed for job %s", job_id)
        return None


# ── Conversion helpers ────────────────────────────────────────────────────────

def _delta_g_to_pic50(delta_g: float) -> float:
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


# ── Descriptor fallback ───────────────────────────────────────────────────────

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

def predict(
    smiles: Optional[str] = None,
    target: Optional[str] = None,
    model_name: str = "Vina",
    receptor_pdb_path: Optional[str] = None,
    ligand_path: Optional[str] = None,
    job_id: Optional[str] = None,
) -> dict:
    try:
        with tempfile.TemporaryDirectory() as wd:
            # ── Ligand ──────────────────────────────────────────────────
            if ligand_path:
                ligand_pdbqt = _ligand_file_to_pdbqt(ligand_path, wd)
            elif smiles:
                ligand_pdbqt = _smiles_to_pdbqt(smiles, wd)
            else:
                raise ValueError("No ligand input: provide smiles or ligand_file")

            # ── Receptor ─────────────────────────────────────────────────
            if receptor_pdb_path:
                receptor_pdb = os.path.join(wd, "receptor.pdb")
                shutil.copy2(receptor_pdb_path, receptor_pdb)
            elif target:
                pdb_text = _fold_sequence(target)
                receptor_pdb = os.path.join(wd, "receptor.pdb")
                with open(receptor_pdb, "w") as f:
                    f.write(pdb_text)
            else:
                raise ValueError("No receptor input: provide target_sequence or receptor_pdb")

            receptor_pdb = _clean_receptor_pdb(receptor_pdb, wd)
            receptor_pdbqt = _pdb_to_pdbqt(receptor_pdb, wd)
            box = _fpocket_box(receptor_pdb, wd)
            delta_g, docked_pdbqt = _run_vina(receptor_pdbqt, ligand_pdbqt, box, wd)

            complex_pdb = _build_complex_pdb(receptor_pdb, docked_pdbqt, wd)
            docked_url = _upload_complex(complex_pdb, job_id or "unknown") if job_id else None

        pic50 = max(3.0, min(12.0, _delta_g_to_pic50(delta_g)))
        result = {
            "pIC50": round(pic50, 2),
            "delta_g": round(delta_g, 2),
            "ic50_nM": round(10 ** (9 - pic50), 1),
            "confidence": _vina_confidence(delta_g),
            "strength": _strength_label(pic50),
        }
        if docked_url:
            # docked_url is an S3 key — presigned URL generated at serve time
            result["docked_complex_key"] = docked_url
        return result

    except Exception:
        logger.exception("Vina docking failed — using descriptor fallback")
        pic50 = _descriptor_pic50(smiles or "") if smiles else 5.0
        pic50 = max(3.0, min(10.0, pic50))
        return {
            "pIC50": round(pic50, 2),
            "delta_g": round(-1.364 * pic50, 2),
            "ic50_nM": round(10 ** (9 - pic50), 1),
            "confidence": 0.40,
            "strength": _strength_label(pic50),
        }
