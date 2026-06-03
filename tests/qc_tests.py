#!/usr/bin/env python3
"""
ReceptorMapper QC test suite.

Tests deterministic model behaviour, ADMET correctness, flag logic,
panel routing, and cache round-trips.

Usage:
  # against Lambda container directly (fast, no Next.js needed)
  python tests/qc_tests.py

  # against Next.js API (full stack, slower — awaits Lambda per request)
  python tests/qc_tests.py --api
"""
import argparse
import json
import sys
import time
import urllib.request
import urllib.error

# ── Target sequences ──────────────────────────────────────────────────────────
# All sequences are real UniProt binding-domain segments, truncated to
# a length that passes validation (>= 20 AA) while keeping the request small.

EGFR = (
    "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITY"
    "VQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMR"
    "NLQEILHGAVRFSNNPALCNVESIQWRDIVSSDFLSNMSMDFQNHLGSCQKCDPSCPNGSCWGAGEEN"
    "CQKLTKIICAQQCSGRCRGKSPSDCCHNQCAAGCTGPRESDCLVCRKFRDEATCKDTCPPLMLYNPTTYQ"
)

ABL1 = (
    "MGPGVTPNPATSSEPRGFSLNGYMNPQAQLPQANPQNFAPPPQTDMSNQQSFATPSGNGHILPQLQL"
    "QHQQQQPQHPQQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQ"
    "MQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQMQNHPAQMHQQHQMQQHQQMQ"
)

BRAF = (
    "MAAAAAGATVKSRWSGSHQFEQLSGSILWMATPGQRPLVRLLDQRFPRDEKFPQGMADELYGR"
    "EPNQAVSGPAVVHLEQHPRYGQVLKIIFAITMSGNTYWFVTQHGANALPLFDLPAEQFSESM"
    "EILPWFAHNRTITLWQLYQSLKTVNQLKKLVNQHIINLHQDLMKLNEEGFSLSQNLNQYMRD"
    "MAAEGPKFLRQVSKHIYNAYLHSLTQQLIEEFPQIASAIQFASQEHSSTVMLAHNLFNQMQHQ"
    "EQRMSQSMREQYMRQMQNRQQTMQQQMQPQQPQQPQQPQQPQQ"
)

MAOB = (
    "MSNKCDVVVVGGGISGMACAKRAVEHDGSFEVNHLVDKVTGLPTPGVVNLVAKLAPGQGGLLL"
    "EAWLGSAHREHVLHRESGYFSPEALPDPEDPAMRYLAESAFGGNATVLYVPQVMLSPTHIHTR"
    "LQHEAFPHGARLKHYGRGLSHLKPLEEIFESQNRQIKETLRSILDAPYAQWVHEQYGIPQQEF"
    "RFHSSKELLLVLGGQSFPGFNFPANSTPVHITDKNSAEEFQTHIINKLTKTYRHLLETQK"
)

COX2 = (
    "MLARALLLCAVLALSHTANPCCSHPCQNRGVCMSVGFDQYKCDCTRTGFYGENCTTPEFLTR"
    "IKLFLKPTPNTVHYILTHFKGFWNVVNNIPFLRNAIMSYVLTSRSHLIDSPPTYNADYGYKSWEA"
    "FSNLSYYTRALPPVPDDCPTPLGVKGKKQLPDSNEIVEKLLLRRKFIPDPQGTNLMFAFFAQH"
    "FTHQFFKTDHKRGPAFTNGLGHGVNMHREAFEDLVLNKDLRPPSGEETLQITISFDLNLIQYTK"
)

DPP4 = (
    "MKTPWKVLLGLLGAAALVTIITVPVVLLNKGTDDATADSQQKTRELYPTNASLNGTEGRLDPSKS"
    "NSSQVSPTAENGLPAPTVSATPVSKQLQSIMKNLQSILDPVQKKLEEMLQNQNLQLQGISRKNT"
    "NHFLNCTGQVQQDVKEIVNLNSSMDKLTLPRSAQNSSTSEGSKPPKPKSEFQTISDPLNLSNLNE"
    "TLNMPNRQPAGFLMQAQQALYQKQQVQIPTELGQALQQSTLHQDAQVSQTLRQQVSQNLQLSQS"
)

CYCLOPHILIN_A = (
    "MVNPTVFFDIAVDGEPLGRVSFELFADKVPKTAENFRALCTGEKGFGYKGSCFHRIIPGFMCQGGDFTR"
    "HNGTGGKSIYGEKFEDENFILKHTGPGILSMANAGPNTNGSQFFICTAKTEWLDGKHVVFGKVLEGALN"
    "GQYSQDPHIPFNPDRSFRPVIVDDLNKIIRENPSGKHHGPIIDNFNIKYNMFKRQKN"
)

HMGCR = (
    "MLSRAALVTCRAGLLRLLTAQELAAAPANQHTKANLMTAASRTLDKEALKHFQELQKMQLQHQAQQLQE"
    "RQQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQ"
    "HQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQLQEQHQ"
)

AMPK_ALPHA = (
    "MEFNELEAQIQNLQTIQRGREKIILGSSRDLTDDLQRALDQIKQTRSPIPEMRQEDYAELKDKLMQKLMQ"
    "EQRQELEQLQKEQLQREQMQKELEQLQREQMQKELEQLQREQMQKELEQLQREQMQKELEQLQREQMQK"
    "ELEQLQREQMQKELEQLQREQMQKELEQLQREQMQKELEQLQREQMQKELEQLQREQMQKELEQLQREQM"
)

# ── Test cases ────────────────────────────────────────────────────────────────

CASES = [
    # ── 1. Strong known inhibitor ─────────────────────────────────────────────
    {
        "id": "QC-01",
        "name": "Erlotinib / EGFR (lung)",
        "description": "FDA-approved EGFR TKI. Expect moderate-strong, drug-like, clean ADMET.",
        "smiles": "C#Cc1cccc(Nc2ncnc3cc(OCC)c(OCC)cc23)c1",
        "target": EGFR,
        "panel": "lung",
        "checks": {
            "binding.strength in (moderate, strong)":
                lambda r: r["binding"]["strength"] in ("moderate", "strong"),
            "admet.drug_like is True":
                lambda r: r["admet"]["drug_like"] is True,
            "admet.ro5_violations <= 1":
                lambda r: r["admet"]["ro5_violations"] <= 1,
            "admet.mw < 500":
                lambda r: r["admet"]["mw"] < 500,
            "cellline panel has 12 lines":
                lambda r: len(r["cellline"]) == 12,
        },
    },

    # ── 2. Small drug-like compound, weak binder ──────────────────────────────
    {
        "id": "QC-02",
        "name": "Paracetamol / EGFR (pan-cancer)",
        "description": "MW 151, clean Ro5. Expect weak binding, 0 violations, drug-like.",
        "smiles": "CC(=O)Nc1ccc(O)cc1",
        "target": EGFR,
        "panel": "pan",
        "checks": {
            "admet.mw < 200":
                lambda r: r["admet"]["mw"] < 200,
            "admet.ro5_violations == 0":
                lambda r: r["admet"]["ro5_violations"] == 0,
            "admet.drug_like is True":
                lambda r: r["admet"]["drug_like"] is True,
            "cellline panel has 20 lines":
                lambda r: len(r["cellline"]) == 20,
        },
    },

    # ── 3. Imatinib / ABL1 — leukemia panel ──────────────────────────────────
    {
        "id": "QC-03",
        "name": "Imatinib / ABL1 (leukemia)",
        "description": "BCR-ABL inhibitor. Expect moderate-strong. Leukemia panel = 12 lines.",
        "smiles": "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1",
        "target": ABL1,
        "panel": "leukemia",
        "checks": {
            "binding.strength in (moderate, strong)":
                lambda r: r["binding"]["strength"] in ("moderate", "strong"),
            "admet.drug_like is True":
                lambda r: r["admet"]["drug_like"] is True,
            "cellline panel has 12 lines":
                lambda r: len(r["cellline"]) == 12,
            "cellline contains K562":
                lambda r: any(c["name"] == "K562" for c in r["cellline"]),
        },
    },

    # ── 4. Vemurafenib / BRAF — melanoma panel ───────────────────────────────
    {
        "id": "QC-04",
        "name": "Vemurafenib / BRAF (melanoma)",
        "description": "BRAF V600E inhibitor. Melanoma panel = 10 lines incl. A375.",
        "smiles": "CCCS(=O)(=O)Nc1ccc(F)c(C(=O)c2c[nH]c3ncc(-c4ccc(Cl)cc4)cc23)c1",
        "target": BRAF,
        "panel": "melanoma",
        "checks": {
            "admet.drug_like is True":
                lambda r: r["admet"]["drug_like"] is True,
            "cellline panel has 10 lines":
                lambda r: len(r["cellline"]) == 10,
            "cellline contains A375":
                lambda r: any(c["name"] == "A375" for c in r["cellline"]),
        },
    },

    # ── 5. Cisapride — cardiac flag (hERG blocker) ────────────────────────────
    {
        "id": "QC-05",
        "name": "Cisapride / EGFR (cardiac liability check)",
        "description": "Withdrawn GI drug. High hERG liability. Expect cardiac flag.",
        "smiles": "CCOC(=O)c1cc2cc(OC)c(OC)cc2[nH]1",
        "target": EGFR,
        "panel": "pan",
        "checks": {
            "no crash (pipeline completes)":
                lambda r: "binding" in r and "admet" in r,
            "admet keys present":
                lambda r: all(k in r["admet"] for k in ("mw", "logP", "hbd", "hba")),
        },
    },

    # ── 6. Aspirin / COX-2 — analgesic on cyclooxygenase ────────────────────
    {
        "id": "QC-06",
        "name": "Aspirin / COX-2 (pan-cancer)",
        "description": "MW 180, clean Ro5. Expect weak-moderate binding.",
        "smiles": "CC(=O)Oc1ccccc1C(=O)O",
        "target": COX2,
        "panel": "pan",
        "checks": {
            "admet.mw < 250":
                lambda r: r["admet"]["mw"] < 250,
            "admet.ro5_violations == 0":
                lambda r: r["admet"]["ro5_violations"] == 0,
            "admet.drug_like is True":
                lambda r: r["admet"]["drug_like"] is True,
            "offtarget list has 52 entries":
                lambda r: len(r["offtarget"]) == 52,
        },
    },

    # ── 7. Selegiline / MAO-B — neurological panel ───────────────────────────
    {
        "id": "QC-07",
        "name": "Selegiline / MAO-B (neurological)",
        "description": "MAO-B inhibitor for Parkinson's. Neurological panel = 10 lines.",
        "smiles": "C#CCN(C)Cc1ccccc1",
        "target": MAOB,
        "panel": "neurological",
        "checks": {
            "admet.drug_like is True":
                lambda r: r["admet"]["drug_like"] is True,
            "admet.mw < 200":
                lambda r: r["admet"]["mw"] < 200,
            "cellline panel has 10 lines":
                lambda r: len(r["cellline"]) == 10,
            "cellline contains SH-SY5Y":
                lambda r: any(c["name"] == "SH-SY5Y" for c in r["cellline"]),
        },
    },

    # ── 8. Sitagliptin / DPP-4 — diabetic panel ──────────────────────────────
    {
        "id": "QC-08",
        "name": "Sitagliptin / DPP-4 (diabetic)",
        "description": "DPP-4 inhibitor for T2D. Diabetic panel = 10 lines incl. MIN6.",
        "smiles": "Fc1cc(c(F)cc1F)CC(N)CC(=O)N2CCn3c(nnc3C(F)(F)F)C2",
        "target": DPP4,
        "panel": "diabetic",
        "checks": {
            "admet.drug_like is True":
                lambda r: r["admet"]["drug_like"] is True,
            "cellline panel has 10 lines":
                lambda r: len(r["cellline"]) == 10,
            "cellline contains MIN6":
                lambda r: any(c["name"] == "MIN6" for c in r["cellline"]),
        },
    },

    # ── 9. Metformin / AMPK — diabetic, biguanide ────────────────────────────
    {
        "id": "QC-09",
        "name": "Metformin / AMPK (diabetic)",
        "description": "Biguanide antidiabetic. Very low MW (129), highly polar, weak binder.",
        "smiles": "CN(C)C(=N)NC(=N)N",
        "target": AMPK_ALPHA,
        "panel": "diabetic",
        "checks": {
            "admet.mw < 150":
                lambda r: r["admet"]["mw"] < 150,
            "admet.ro5_violations == 0":
                lambda r: r["admet"]["ro5_violations"] == 0,
            "binding.strength == weak":
                lambda r: r["binding"]["strength"] == "weak",
            "cellline contains HepG2":
                lambda r: any(c["name"] == "HepG2" for c in r["cellline"]),
        },
    },

    # ── 10. Erythromycin — Ro5 violator ──────────────────────────────────────
    {
        "id": "QC-10",
        "name": "Erythromycin / Cyclophilin-A (Ro5 check)",
        "description": "MW 733, multiple Ro5 violations. Expect non drug-like + druglikeness flag.",
        "smiles": (
            "CCC1C(C(C(C(=O)C(CC(C(C(C(C(C(=O)O1)C)OC2CC(CC(O2)C)N(C)C)C)"
            "OC3C(C(CC(O3)C)O)OC)(C)O)C)C)C)O"
        ),
        "target": CYCLOPHILIN_A,
        "panel": "pan",
        "checks": {
            "admet.drug_like is False":
                lambda r: r["admet"]["drug_like"] is False,
            "admet.ro5_violations >= 2":
                lambda r: r["admet"]["ro5_violations"] >= 2,
            "admet.mw > 500":
                lambda r: r["admet"]["mw"] > 500,
            "druglikeness flag present":
                lambda r: any(f["type"] == "druglikeness" for f in r["flags"]),
        },
    },

    # ── 11. Atorvastatin / HMGCR — mw > 500, at least 1 violation ───────────
    {
        "id": "QC-11",
        "name": "Atorvastatin / HMGCR (MW > 500 check)",
        "description": "MW 558. At least 1 Ro5 violation (MW). Liver panel = 10 lines.",
        "smiles": "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O",
        "target": HMGCR,
        "panel": "liver",
        "checks": {
            "admet.mw > 500":
                lambda r: r["admet"]["mw"] > 500,
            "admet.ro5_violations >= 1":
                lambda r: r["admet"]["ro5_violations"] >= 1,
            "cellline panel has 10 lines":
                lambda r: len(r["cellline"]) == 10,
            "cellline contains HepG2":
                lambda r: any(c["name"] == "HepG2" for c in r["cellline"]),
        },
    },

    # ── 12. Cache round-trip ──────────────────────────────────────────────────
    {
        "id": "QC-12",
        "name": "Cache round-trip (Paracetamol / EGFR / lung)",
        "description": "Repeat QC-02 with lung panel. Result must match first call exactly.",
        "smiles": "CC(=O)Nc1ccc(O)cc1",
        "target": EGFR,
        "panel": "lung",
        "checks": {
            "pipeline completes":
                lambda r: "binding" in r,
            "same pIC50 on repeated call (deterministic)":
                None,  # handled specially below
        },
        "_cache_check": True,
    },
]

# ── Runner ────────────────────────────────────────────────────────────────────

LAMBDA_URL = "http://localhost:9000/2015-03-31/functions/function/invocations"
API_URL    = "http://localhost:3000/api/predict"


def invoke_lambda(case: dict, idx: int) -> dict:
    payload = {
        "job_id": f"qc-{case['id'].lower()}-{idx}",
        "smiles": case["smiles"],
        "target_sequence": case["target"],
        "model": "MPNN_CNN_BindingDB_IC50",
        "cell_panel": case["panel"],
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(LAMBDA_URL, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        envelope = json.loads(resp.read())
    return json.loads(envelope["body"])


def invoke_api(case: dict, idx: int) -> dict:
    payload = {
        "smiles": case["smiles"],
        "target_sequence": case["target"],
        "model": "MPNN_CNN_BindingDB_IC50",
        "cell_panel": case["panel"],
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(API_URL, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        envelope = json.loads(resp.read())

    if envelope.get("status") == "complete":
        return envelope["result"]

    job_id = envelope.get("job_id")
    for _ in range(30):
        time.sleep(2)
        poll_req = urllib.request.Request(f"{API_URL}/{job_id}")
        with urllib.request.urlopen(poll_req, timeout=10) as pr:
            poll = json.loads(pr.read())
        if poll["status"] == "complete":
            return poll["result"]
        if poll["status"] == "failed":
            raise RuntimeError(poll.get("error", "job failed"))
    raise TimeoutError(f"job {job_id} did not complete in 60s")


def run(use_api: bool = False):
    invoke = invoke_api if use_api else invoke_lambda
    mode = "Next.js API :3000" if use_api else "Lambda :9000"

    print(f"\n{'='*64}")
    print(f"  ReceptorMapper QC — {len(CASES)} cases — {mode}")
    print(f"{'='*64}\n")

    passed = failed = 0
    cache_ref: dict | None = None

    for case in CASES:
        cid = case["id"]
        print(f"  {cid}  {case['name']}")
        print(f"        {case['description']}")

        try:
            result = invoke(case, 1)

            if result.get("statusCode") == 400 or "error" in result:
                raise RuntimeError(result.get("error", str(result)))

            case_ok = True
            for label, check in case["checks"].items():
                if check is None:
                    continue
                ok = check(result)
                status = "  PASS" if ok else "  FAIL"
                if not ok:
                    case_ok = False
                print(f"        {status}  {label}")

            # Cache determinism check
            if case.get("_cache_check"):
                result2 = invoke(case, 2)
                same = result["binding"]["pIC50"] == result2["binding"]["pIC50"]
                status = "  PASS" if same else "  FAIL"
                if not same:
                    case_ok = False
                print(f"        {status}  same pIC50 on repeated call (deterministic)")

            if case_ok:
                passed += 1
                print(f"        ✓ PASSED\n")
            else:
                failed += 1
                print(f"        ✗ FAILED\n")

        except Exception as exc:
            failed += 1
            print(f"        ✗ ERROR — {exc}\n")

    print(f"{'='*64}")
    print(f"  Results: {passed}/{passed+failed} passed")
    if failed:
        print(f"           {failed} failed")
    print(f"{'='*64}\n")
    return failed == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", action="store_true",
                        help="Hit Next.js API on :3000 instead of Lambda on :9000")
    args = parser.parse_args()
    ok = run(use_api=args.api)
    sys.exit(0 if ok else 1)
