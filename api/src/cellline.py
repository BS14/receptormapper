import logging
import math

logger = logging.getLogger(__name__)

PANELS: dict[str, list[str]] = {
    # ── Existing ──────────────────────────────────────────────────────────────
    "lung": [
        "A549", "H1299", "H460", "H1975", "H1650",
        "H358", "H2228", "H2087", "H3122", "H23",
        "H1793", "H441",
    ],
    "breast": [
        "MCF7", "MDA-MB-231", "MDA-MB-468", "T47D", "BT474",
        "SKBR3", "MDA-MB-453", "ZR-75-1", "HCC1937", "BT549",
    ],
    "pan": [
        "A549", "MCF7", "HCT116", "PC3", "HELA",
        "U87", "A375", "SKOV3", "PANC1", "SW480",
        "H1299", "MDA-MB-231", "HT29", "DU145", "A2780",
        "OVCAR3", "SF268", "SNB75", "U251", "MDAMB435S",
    ],

    # ── Colorectal cancer ─────────────────────────────────────────────────────
    "colorectal": [
        "HCT116", "HT29", "SW480", "SW620", "COLO205",
        "HCT15", "RKO", "LoVo", "DLD1", "Caco2",
        "LS174T", "SW48",
    ],

    # ── Prostate cancer ───────────────────────────────────────────────────────
    "prostate": [
        "PC3", "DU145", "LNCaP", "VCaP", "22Rv1",
        "LAPC4", "C4-2B", "RWPE1", "MDA-PCa-2b", "LNCaP-C4-2",
    ],

    # ── Ovarian cancer ────────────────────────────────────────────────────────
    "ovarian": [
        "SKOV3", "OVCAR3", "A2780", "ES2", "CAOV3",
        "IGROV1", "KURAMOCHI", "COV362", "OVCAR4", "OVCAR8",
    ],

    # ── Pancreatic cancer ─────────────────────────────────────────────────────
    "pancreatic": [
        "PANC1", "MiaPaCa2", "BxPC3", "Capan1", "CFPAC1",
        "AsPC1", "Hs766T", "SUIT2", "KP4", "PK45H",
    ],

    # ── Leukemia / hematological ──────────────────────────────────────────────
    "leukemia": [
        "K562", "HL60", "MOLT4", "JURKAT", "RAJI",
        "DAUDI", "U937", "KG1", "KU812", "TF1",
        "RS4-11", "NALM6",
    ],

    # ── Melanoma ──────────────────────────────────────────────────────────────
    "melanoma": [
        "A375", "SK-MEL-28", "SK-MEL-5", "WM266-4", "COLO829",
        "MeWo", "HS294T", "WM115", "A2058", "RPMI7951",
    ],

    # ── Glioblastoma / brain ──────────────────────────────────────────────────
    "glioblastoma": [
        "U87-MG", "U251-MG", "SF268", "T98G", "LN229",
        "A172", "SNB75", "U118-MG", "GBM39", "SF295",
    ],

    # ── Liver / hepatocellular carcinoma ──────────────────────────────────────
    "liver": [
        "HepG2", "Hep3B", "HuH7", "SNU449", "JHH4",
        "PLC-PRF-5", "SNU398", "HuH6", "SNU182", "HEPG2-C3A",
    ],

    # ── Renal / kidney cancer ─────────────────────────────────────────────────
    "renal": [
        "786-O", "ACHN", "CAKI1", "RCC4", "A498",
        "SN12C", "769-P", "OS-RC2", "UO-31", "TK-10",
    ],

    # ── Diabetic / metabolic disease ──────────────────────────────────────────
    # Beta-cell lines, hepatocyte models, muscle and adipocyte lines used in
    # metabolic drug discovery (insulin secretion, insulin resistance, lipid metabolism).
    "diabetic": [
        "MIN6",       # mouse pancreatic beta-cell (gold std for insulin secretion)
        "INS-1E",     # rat beta-cell (glucose-stimulated insulin secretion)
        "NIT-1",      # NOD-mouse beta-cell (autoimmune diabetes model)
        "EndoC-BH1",  # human beta-cell line
        "HepG2",      # hepatocellular — insulin resistance / gluconeogenesis
        "Huh7",       # hepatocyte — NAFLD / lipid metabolism
        "C2C12",      # mouse myoblast — insulin-stimulated glucose uptake
        "3T3-L1",     # mouse preadipocyte — adipogenesis / insulin sensitivity
        "HEK293",     # overexpression assays (GLUT4, IR, IRS1)
        "L6",         # rat skeletal muscle — glucose transporter studies
    ],

    # ── Neurological / neurodegenerative ─────────────────────────────────────
    # Models for Parkinson's, Alzheimer's, and general neuronal toxicity screens.
    "neurological": [
        "SH-SY5Y",   # human neuroblastoma — Parkinson's / dopaminergic model
        "PC12",      # rat pheochromocytoma — NGF-induced differentiation
        "SK-N-SH",   # human neuroblastoma — Alzheimer's / amyloid studies
        "N2a",       # mouse neuroblastoma — tau / APP processing
        "HT22",      # murine hippocampal — oxidative stress / glutamate toxicity
        "LUHMES",    # human dopaminergic neuron precursor
        "ReNcell-VM",# human neural progenitor — cortical differentiation
        "iPSC-N",    # iPSC-derived neurons (generic line pool)
        "U87-MG",    # glioblastoma — glia toxicity context
        "BV2",       # murine microglia — neuroinflammation
    ],
}


def predict(smiles: str, panel: str = "lung") -> list[dict]:
    lines = PANELS.get(panel, PANELS["lung"])
    base_ic50 = _estimate_base_ic50(smiles)

    results = []
    for i, name in enumerate(lines):
        # Deterministic per-line variation using line index as seed
        variation = _line_variation(name)
        ic50 = base_ic50 * variation
        results.append({"name": name, "ic50": round(max(0.001, ic50), 3)})

    results.sort(key=lambda x: x["ic50"])
    return results


def _estimate_base_ic50(smiles: str) -> float:
    """
    Estimate a base IC50 (µM) from RDKit descriptors.
    More drug-like / lipophilic compounds tend to have lower IC50.
    """
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return 10.0

        mw = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        tpsa = Descriptors.TPSA(mol)

        # Higher logP and MW → stronger membrane permeability and cellular uptake
        log_ic50 = 1.5 - logp * 0.25 + tpsa / 150.0 - (mw - 300) / 600.0
        ic50 = 10 ** log_ic50
        return max(0.001, min(100.0, ic50))
    except Exception:
        logger.exception("base IC50 estimation failed")
        return 10.0


def _line_variation(name: str) -> float:
    """Deterministic per-cell-line multiplier in range [0.3, 3.0]."""
    seed = sum(ord(c) for c in name)
    # Map 0..255 range to [0.3, 3.0] log-uniformly
    normalised = (seed % 256) / 255.0
    return 10 ** (normalised * math.log10(3.0 / 0.3) + math.log10(0.3))
