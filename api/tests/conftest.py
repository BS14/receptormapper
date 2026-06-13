"""
Shared pytest fixtures.

DynamoDB table is created once per session (autouse).
PDB + SDF bytes are downloaded once from RCSB / PubChem and reused.
"""
import os

import boto3
import pytest
import requests
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from main import app


# ── DynamoDB setup ────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def dynamo_table():
    table_name = os.environ.get("DYNAMODB_TABLE", "receptormapper_jobs")
    kwargs = {
        "region_name": os.environ.get("AWS_REGION", "us-east-1"),
        "aws_access_key_id": os.environ.get("AWS_ACCESS_KEY_ID", "fake"),
        "aws_secret_access_key": os.environ.get("AWS_SECRET_ACCESS_KEY", "fake"),
    }
    endpoint = os.environ.get("AWS_ENDPOINT_URL")
    if endpoint:
        kwargs["endpoint_url"] = endpoint

    dynamo = boto3.client("dynamodb", **kwargs)
    try:
        dynamo.create_table(
            TableName=table_name,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceInUseException":
            raise

    yield

    # Optionally wipe table between runs — leave data for post-mortem inspection
    # dynamo.delete_table(TableName=table_name)


# ── HTTP client ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client():
    return TestClient(app)


# ── Test molecule data ────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def receptor_pdb_bytes():
    """1CRN — Crambin, 46 AA, ~400 atoms. Smallest real PDB entry on RCSB."""
    r = requests.get("https://files.rcsb.org/download/1CRN.pdb", timeout=30)
    r.raise_for_status()
    return r.content


@pytest.fixture(scope="session")
def ligand_sdf_bytes():
    """Aspirin — PubChem CID 2244, simple drug-like molecule."""
    r = requests.get(
        "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/2244/SDF",
        timeout=30,
    )
    r.raise_for_status()
    return r.content
