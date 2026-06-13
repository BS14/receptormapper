"""
Creates the single DynamoDB table used by ReceptorMapper.
Run once against the local DynamoDB container:

  cd api && python scripts/create_tables.py

The table uses a composite key (PK HASH + SK RANGE) to store both
job records and the content-hash cache in a single table:

  Jobs:  PK = "JOB#{job_id}"      SK = "METADATA"
  Cache: PK = "CACHE#{sha256}"    SK = "RESULT"
"""
import os
import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE  = os.environ.get("DYNAMODB_TABLE", "receptormapper_jobs")

_kwargs = {"region_name": REGION}
_endpoint = os.environ.get("AWS_ENDPOINT_URL")
if _endpoint:
    _kwargs["endpoint_url"] = _endpoint
    _kwargs["aws_access_key_id"] = os.environ.get("AWS_ACCESS_KEY_ID", "fake")
    _kwargs["aws_secret_access_key"] = os.environ.get("AWS_SECRET_ACCESS_KEY", "fake")

dynamo = boto3.client("dynamodb", **_kwargs)

try:
    dynamo.create_table(
        TableName=TABLE,
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
    print(f"Created table: {TABLE}")
except ClientError as e:
    if e.response["Error"]["Code"] == "ResourceInUseException":
        print(f"Table already exists: {TABLE}")
    else:
        raise

try:
    dynamo.update_time_to_live(
        TableName=TABLE,
        TimeToLiveSpecification={"Enabled": True, "AttributeName": "ttl"},
    )
    print(f"TTL enabled on {TABLE}.ttl")
except ClientError:
    pass  # Local DynamoDB may not support TTL

print("Done.")
