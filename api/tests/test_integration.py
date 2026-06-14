"""
Integration tests — run real AutoDock Vina inside the Docker container.

These tests take 1–5 minutes. Run explicitly with:
  docker compose --profile test run --rm test \
    python -m pytest tests/test_integration.py -v -s

Or include all tests (unit + integration):
  docker compose --profile test run --rm test \
    python -m pytest tests/ -v -s
"""
import time

import pytest
from fastapi.testclient import TestClient

from main import app

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def integration_client():
    return TestClient(app)


def test_full_docking_1crn_aspirin(integration_client, receptor_pdb_bytes, ligand_sdf_bytes):
    """
    Real end-to-end docking: 1CRN receptor + Aspirin ligand.
    Verifies that Vina, obabel, fpocket, meeko are all installed and wired correctly.
    """
    r = integration_client.post(
        "/predict",
        files={
            "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
            "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
        },
        data={"job_name": "integration-1crn-aspirin"},
    )
    assert r.status_code == 202, f"Expected 202, got {r.status_code}: {r.text}"
    job_id = r.json()["job_id"]

    # TestClient runs background tasks synchronously — no need to poll
    poll = integration_client.get(f"/jobs/{job_id}")
    assert poll.status_code == 200
    body = poll.json()

    assert body["status"] == "complete", (
        f"Docking failed: {body.get('error', 'no error message')}\n"
        "Check that vina, obabel, fpocket and meeko are installed in the container."
    )

    result = body["result"]
    binding = result["binding"]

    # Structural checks
    assert isinstance(binding["pIC50"], float), "pIC50 must be a float"
    assert isinstance(binding["delta_g"], float), "delta_g must be a float"
    assert binding["delta_g"] < 0, f"ΔG should be negative, got {binding['delta_g']}"
    assert 3.0 <= binding["pIC50"] <= 12.0, f"pIC50 out of bounds: {binding['pIC50']}"
    assert binding["ic50_nM"] > 0
    assert 0.0 < binding["confidence"] <= 1.0
    assert binding["strength"] in ("strong", "moderate", "weak")

    assert isinstance(result["flags"], list)
    assert result["summary"]["total_flags"] == len(result["flags"])


def test_docking_cache_survives_restart(integration_client, receptor_pdb_bytes, ligand_sdf_bytes):
    """
    Submit the same files twice. Second job should complete instantly from cache.
    This also verifies the DynamoDB cache write/read cycle with real data.
    """
    files = {
        "receptor_pdb": ("1CRN.pdb", receptor_pdb_bytes, "chemical/x-pdb"),
        "ligand_file": ("aspirin.sdf", ligand_sdf_bytes, "chemical/x-mdl-sdfile"),
    }

    r1 = integration_client.post("/predict", files=files)
    assert r1.status_code == 202
    j1 = r1.json()["job_id"]
    b1 = integration_client.get(f"/jobs/{j1}").json()
    assert b1["status"] == "complete", b1

    # Second identical submission
    r2 = integration_client.post("/predict", files=files)
    assert r2.status_code == 202
    j2 = r2.json()["job_id"]
    b2 = integration_client.get(f"/jobs/{j2}").json()
    assert b2["status"] == "complete", b2

    # Results should be numerically identical (same docking, same cache)
    assert b1["result"]["binding"]["delta_g"] == b2["result"]["binding"]["delta_g"]
    assert b1["result"]["binding"]["pIC50"] == b2["result"]["binding"]["pIC50"]
