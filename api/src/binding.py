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

from src import rmsd as rmsd_module

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


def _trim_receptor_to_box(pdb_path: str, box: dict, workdir: str, padding: float = 8.0) -> str:
    """Keep only residues with any atom within (half-box + padding) of box center."""
    import math
    cx, cy, cz = box["center_x"], box["center_y"], box["center_z"]
    rx = box["size_x"] / 2 + padding
    ry = box["size_y"] / 2 + padding
    rz = box["size_z"] / 2 + padding

    # Collect residue keys that have at least one atom inside the cutoff
    keep_residues: set[tuple] = set()
    with open(pdb_path) as f:
        for line in f:
            if not line.startswith(("ATOM", "HETATM")):
                continue
            try:
                x, y, z = float(line[30:38]), float(line[38:46]), float(line[46:54])
            except ValueError:
                continue
            if abs(x - cx) <= rx and abs(y - cy) <= ry and abs(z - cz) <= rz:
                chain = line[21]
                resseq = line[22:26].strip()
                keep_residues.add((chain, resseq))

    out = os.path.join(workdir, "receptor_site.pdb")
    with open(pdb_path) as fin, open(out, "w") as fout:
        for line in fin:
            if line.startswith(("ATOM", "HETATM")):
                chain = line[21]
                resseq = line[22:26].strip()
                if (chain, resseq) not in keep_residues:
                    continue
            fout.write(line)

    logger.info("Receptor trimmed to %d residues near binding site", len(keep_residues))
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

def _native_ligand_box(original_pdb: str) -> Optional[dict]:
    """Use crystal ligand centroid as box center when available (beats fpocket accuracy)."""
    native = rmsd_module.extract_native_ligand(original_pdb)
    if native is None:
        return None
    cx, cy, cz = native["center"]
    logger.info("Using native ligand centroid as box: (%.2f, %.2f, %.2f)", cx, cy, cz)
    return {
        "center_x": cx, "center_y": cy, "center_z": cz,
        "size_x": 25.0, "size_y": 25.0, "size_z": 25.0,
    }


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

def _run_vina(
    receptor_pdbqt: str,
    ligand_pdbqt: str,
    box: dict,
    workdir: str,
    out_prefix: str = "docked",
) -> tuple[list[float], str]:
    """Run AutoDock Vina. Returns (all_pose_dg_list, docked_pdbqt_path)."""
    out_path = os.path.join(workdir, f"{out_prefix}.pdbqt")
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
        "--exhaustiveness", "4",
        "--num_modes", "5",
        "--cpu", "1",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    logger.debug("Vina stdout: %s", result.stdout)

    pose_dg: list[float] = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0].isdigit():
            try:
                rank = int(parts[0])
                if rank == len(pose_dg) + 1:
                    pose_dg.append(float(parts[1]))
            except ValueError:
                continue

    if not pose_dg:
        raise RuntimeError(f"Could not parse Vina output:\n{result.stdout}\n{result.stderr}")

    logger.info("Vina: %d poses, best ΔG = %.2f kcal/mol", len(pose_dg), pose_dg[0])
    return pose_dg, out_path


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


def _parse_pdb_models(pdb_path: str) -> list[list[str]]:
    """Split a multi-model PDB into lists of ATOM/HETATM lines per model."""
    models: list[list[str]] = []
    current: list[str] = []
    has_markers = False
    with open(pdb_path) as f:
        for line in f:
            if line.startswith("MODEL"):
                has_markers = True
                current = []
            elif line.startswith("ENDMDL"):
                if current:
                    models.append(current)
                current = []
            elif line.startswith(("ATOM", "HETATM")):
                current.append(line)
    if not has_markers and current:
        models.append(current)
    return models


def _build_complex_pdb(
    receptor_pdb: str,
    docked_pdbqt: str,
    workdir: str,
    native_atoms: Optional[list] = None,
) -> str:
    """Merge receptor + all Vina poses into a multi-model complex PDB.

    Each MODEL contains: receptor ATOM records + one ligand pose (LIG chain Z)
    + crystal native ligand (NAT chain X, optional, same across all models).
    3Dmol addModelsAsFrames() + setFrame(n) drives pose switching in the UI.
    """
    all_poses_pdb = os.path.join(workdir, "all_poses.pdb")
    subprocess.run(
        ["obabel", docked_pdbqt, "-O", all_poses_pdb, "-d"],
        capture_output=True,
    )
    pose_models = _parse_pdb_models(all_poses_pdb)
    if not pose_models:
        pose_models = [_extract_best_pose_lines(docked_pdbqt)]

    # Pre-read receptor (once for all models)
    receptor_lines: list[str] = []
    max_receptor_serial = 0
    with open(receptor_pdb) as f:
        for line in f:
            if line.startswith("END"):
                continue
            receptor_lines.append(line)
            if line.startswith(("ATOM", "HETATM")):
                try:
                    max_receptor_serial = max(max_receptor_serial, int(line[6:11]))
                except ValueError:
                    pass

    complex_pdb = os.path.join(workdir, "complex.pdb")
    with open(complex_pdb, "w") as out:
        for model_idx, pose_lines in enumerate(pose_models, 1):
            out.write(f"MODEL {model_idx:8d}\n")

            for line in receptor_lines:
                out.write(line)
            out.write("TER\n")

            serial = max_receptor_serial + 1
            for line in pose_lines:
                if line.startswith(("ATOM", "HETATM")):
                    padded = line.rstrip().ljust(80)
                    new = (
                        f"HETATM{serial:5d} "
                        + padded[12:17]
                        + "LIG"
                        + padded[20:21]
                        + "Z"
                        + padded[22:]
                    )
                    out.write(new.rstrip() + "\n")
                    serial += 1
            out.write("TER\n")

            if native_atoms:
                for atom in native_atoms:
                    x, y, z = atom["coords"]
                    elem = atom.get("element", "C")[:2].strip()
                    aname = atom["name"][:4].ljust(4)
                    out.write(
                        f"HETATM{serial:5d} {aname} NAT X   1    "
                        f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00          {elem:>2s}\n"
                    )
                    serial += 1
                out.write("TER\n")

            out.write("ENDMDL\n")
        out.write("END\n")

    return complex_pdb


def _extract_best_pose_lines(docked_pdbqt: str) -> list[str]:
    """Fallback: extract MODEL 1 atom lines when obabel multi-model conversion fails."""
    lines: list[str] = []
    in_model1 = False
    with open(docked_pdbqt) as f:
        for line in f:
            if line.startswith("MODEL"):
                in_model1 = (line.split()[1] if len(line.split()) > 1 else "1") == "1"
            elif line.startswith("ENDMDL") and in_model1:
                break
            elif in_model1 and line.startswith(("ATOM", "HETATM")):
                lines.append(line)
    return lines


def _write_native_pdb(native_atoms: list, path: str) -> None:
    """Write extracted crystal ligand atoms as a minimal PDB so obabel can read it."""
    with open(path, "w") as f:
        for i, atom in enumerate(native_atoms, 1):
            x, y, z = atom["coords"]
            elem = atom.get("element", "C")[:2].strip()
            aname = atom["name"][:4].ljust(4)
            f.write(
                f"HETATM{i:5d} {aname} LIG A   1    "
                f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00          {elem:>2s}\n"
            )
        f.write("END\n")


def _dock_native_ligand(
    native_atoms: list,
    receptor_pdbqt: str,
    box: dict,
    workdir: str,
) -> Optional[dict]:
    """Re-dock the crystal native ligand and return its affinity metrics."""
    if not native_atoms:
        return None
    try:
        native_pdb = os.path.join(workdir, "native_ligand.pdb")
        native_pdbqt = os.path.join(workdir, "native_ligand.pdbqt")
        _write_native_pdb(native_atoms, native_pdb)
        subprocess.run(
            ["obabel", native_pdb, "-O", native_pdbqt,
             "--partialcharge", "gasteiger", "-h"],
            check=True, capture_output=True,
        )
        native_dg_list, _ = _run_vina(
            receptor_pdbqt, native_pdbqt, box, workdir, out_prefix="native_docked"
        )
        native_dg = native_dg_list[0]
        native_pic50 = max(3.0, min(12.0, _delta_g_to_pic50(native_dg)))
        logger.info("Native ligand re-docked: ΔG=%.2f pIC50=%.2f", native_dg, native_pic50)
        return {
            "delta_g": round(native_dg, 2),
            "pIC50": round(native_pic50, 2),
            "ic50_nM": round(10 ** (9 - native_pic50), 1),
        }
    except Exception:
        logger.exception("Native ligand re-docking failed")
        return None


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

            original_pdb = receptor_pdb  # keep pre-cleaning path for RMSD + native extraction
            receptor_pdb = _clean_receptor_pdb(receptor_pdb, wd)
            box = _native_ligand_box(original_pdb) or _fpocket_box(receptor_pdb, wd)
            receptor_site_pdb = _trim_receptor_to_box(receptor_pdb, box, wd)
            receptor_pdbqt = _pdb_to_pdbqt(receptor_site_pdb, wd)
            all_dg, docked_pdbqt = _run_vina(receptor_pdbqt, ligand_pdbqt, box, wd)
            delta_g = all_dg[0]

            best_pose_pdbqt = _extract_best_pose(docked_pdbqt, wd)
            rmsd_data = rmsd_module.run_analysis(original_pdb, best_pose_pdbqt, smiles or "")
            native_atoms = rmsd_data.pop("native_atoms", None)

            pose_metrics = rmsd_module.per_pose_analysis(docked_pdbqt, original_pdb)
            native_docking = _dock_native_ligand(native_atoms, receptor_pdbqt, box, wd)

            complex_pdb = _build_complex_pdb(receptor_pdb, docked_pdbqt, wd, native_atoms)
            docked_url = _upload_complex(complex_pdb, job_id or "unknown") if job_id else None

        # Build per-pose array
        poses = []
        for i, dg in enumerate(all_dg):
            p_pic50 = max(3.0, min(12.0, _delta_g_to_pic50(dg)))
            entry: dict = {
                "rank": i + 1,
                "delta_g": round(dg, 2),
                "pic50": round(p_pic50, 2),
                "ic50_nM": round(10 ** (9 - p_pic50), 1),
            }
            if i < len(pose_metrics):
                entry.update(pose_metrics[i])
            poses.append(entry)

        pic50 = max(3.0, min(12.0, _delta_g_to_pic50(delta_g)))
        result = {
            "pIC50": round(pic50, 2),
            "delta_g": round(delta_g, 2),
            "ic50_nM": round(10 ** (9 - pic50), 1),
            "confidence": _vina_confidence(delta_g),
            "strength": _strength_label(pic50),
            "rmsd": rmsd_data,
            "poses": poses,
        }
        if native_docking:
            ddg = round(delta_g - native_docking["delta_g"], 2)
            native_docking["delta_delta_g"] = ddg
            native_docking["selectivity"] = (
                "stronger" if ddg < -0.5 else "weaker" if ddg > 0.5 else "similar"
            )
            result["native_docking"] = native_docking
        if docked_url:
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
