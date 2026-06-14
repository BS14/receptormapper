"""
Unit tests — Vina is mocked out so these run fast (< 5 s total).

Run inside Docker:
  docker compose --profile test run --rm test
"""
from unittest.mock import patch

import pytest

# ── Fixtures ──────────────────────────────────────────────────────────────────

MOCK_BINDING = {
    "pIC50": 6.5,
    "delta_g": -7.2,
    "ic50_nM": 316.2,
    "confidence": 0.75,
    "strength": "moderate",
}


# ── /health ───────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ── /jobs ─────────────────────────────────────────────────────────────────────

def test_jobs_list(client):
    r = client.get("/jobs")
    assert r.status_code == 200
    assert "jobs" in r.json()
    assert isinstance(r.json()["jobs"], list)


# ── /jobs/{job_id} not found ─────────────────────────────────────────────────

def test_job_not_found(client):
    r = client.get("/jobs/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


# ── /predict validation errors ────────────────────────────────────────────────

def test_predict_no_files(client):
    r = client.post("/predict")
    assert r.status_code == 422  # FastAPI missing-field error


def test_predict_empty_receptor(client, ligand_sdf_bytes):
    r = client.post(
        "/predict",
        files={
            "receptor_pdb": ("receptor.pdb", b"", "chemical/x-pdb"),
            "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
        },
    )
    assert r.status_code == 400


def test_predict_empty_ligand(client, receptor_pdb_bytes):
    r = client.post(
        "/predict",
        files={
            "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
            "ligand_file": ("ligand.sdf", b"", "chemical/x-mdl-sdfile"),
        },
    )
    assert r.status_code == 400


# ── Full round-trip with mocked Vina ─────────────────────────────────────────

def test_predict_round_trip(client, receptor_pdb_bytes, ligand_sdf_bytes):
    """Submit → job created → background task completes → result correct."""
    with patch("src.binding.predict", return_value=MOCK_BINDING):
        r = client.post(
            "/predict",
            files={
                "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
                "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
            },
            data={"job_name": "unit-test"},
        )

    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]

    # TestClient runs background tasks synchronously — result is ready immediately
    poll = client.get(f"/jobs/{job_id}")
    assert poll.status_code == 200
    body = poll.json()
    assert body["status"] == "complete", body
    assert body["result"]["binding"]["pIC50"] == MOCK_BINDING["pIC50"]
    assert body["result"]["binding"]["delta_g"] == MOCK_BINDING["delta_g"]
    assert isinstance(body["result"]["flags"], list)
    assert body["meta"]["job_name"] == "unit-test"


def test_predict_result_structure(client, receptor_pdb_bytes, ligand_sdf_bytes):
    """Result JSON contains all required keys."""
    with patch("src.binding.predict", return_value=MOCK_BINDING):
        r = client.post(
            "/predict",
            files={
                "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
                "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
            },
        )
    job_id = r.json()["job_id"]
    result = client.get(f"/jobs/{job_id}").json()["result"]

    binding = result["binding"]
    assert {"pIC50", "delta_g", "ic50_nM", "confidence", "strength"} <= binding.keys()
    assert binding["strength"] in ("strong", "moderate", "weak")
    assert 0.0 <= binding["confidence"] <= 1.0
    assert result["summary"]["total_flags"] == len(result["flags"])


# ── Cache hit ────────────────────────────────────────────────────────────────

def test_cache_hit(client, receptor_pdb_bytes, ligand_sdf_bytes):
    """Same files submitted twice: second job uses cache, not Vina."""
    files = {
        "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
        "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
    }

    with patch("src.binding.predict", return_value=MOCK_BINDING):
        r1 = client.post("/predict", files=files)
    assert r1.status_code == 202
    job1 = r1.json()["job_id"]

    # Second submit — binding.predict must NOT be called (cache supplies result)
    with patch("src.binding.predict", side_effect=AssertionError("Vina should not run on cache hit")):
        r2 = client.post("/predict", files=files)
    assert r2.status_code == 202
    job2 = r2.json()["job_id"]

    body1 = client.get(f"/jobs/{job1}").json()
    body2 = client.get(f"/jobs/{job2}").json()
    assert body1["status"] == "complete"
    assert body2["status"] == "complete"
    assert body1["result"]["binding"]["pIC50"] == body2["result"]["binding"]["pIC50"]


# ── Completed jobs appear in /jobs list ──────────────────────────────────────

def test_completed_job_in_list(client, receptor_pdb_bytes, ligand_sdf_bytes):
    with patch("src.binding.predict", return_value=MOCK_BINDING):
        r = client.post(
            "/predict",
            files={
                "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
                "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
            },
            data={"job_name": "list-check"},
        )
    job_id = r.json()["job_id"]

    jobs = client.get("/jobs").json()["jobs"]
    job_ids = [j["job_id"] for j in jobs]
    assert job_id in job_ids


# ── Flags generated for strong binding ───────────────────────────────────────

def test_strong_binding_flag(client, receptor_pdb_bytes, ligand_sdf_bytes):
    """ΔG ≤ -9.0 should generate a potency flag."""
    strong_binding = {**MOCK_BINDING, "delta_g": -10.5, "pIC50": 9.5, "strength": "strong", "confidence": 0.90}
    with patch("src.binding.predict", return_value=strong_binding):
        r = client.post(
            "/predict",
            files={
                "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
                "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
            },
        )
    job_id = r.json()["job_id"]
    result = client.get(f"/jobs/{job_id}").json()["result"]
    flag_types = [f["type"] for f in result["flags"]]
    assert "potency" in flag_types
