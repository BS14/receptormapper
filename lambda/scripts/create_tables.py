"""
Creates the two DynamoDB tables needed for local development.
Run once against the local DynamoDB container:
  cd lambda && python scripts/create_tables.py
"""
import os
import boto3
from botocore.exceptions import ClientError

ENDPOINT = os.environ.get("AWS_ENDPOINT_URL", "http://localhost:8000")
REGION = os.environ.get("AWS_REGION", "us-east-1")

dynamo = boto3.client(
    "dynamodb",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "fake"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "fake"),
)


def create_table(name: str, pk: str, gsi: dict | None = None):
    key_schema = [{"AttributeName": pk, "KeyType": "HASH"}]
    attr_defs = [{"AttributeName": pk, "AttributeType": "S"}]

    kwargs = dict(
        TableName=name,
        KeySchema=key_schema,
        AttributeDefinitions=attr_defs,
        BillingMode="PAY_PER_REQUEST",
    )

    if gsi:
        attr_defs.append({"AttributeName": gsi["key"], "AttributeType": "S"})
        kwargs["GlobalSecondaryIndexes"] = [
            {
                "IndexName": gsi["name"],
                "KeySchema": [{"AttributeName": gsi["key"], "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ]

    try:
        dynamo.create_table(**kwargs)
        print(f"Created table: {name}")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceInUseException":
            print(f"Table already exists: {name}")
        else:
            raise


create_table("prediction_jobs", "job_id", gsi={"name": "user_id-index", "key": "user_id"})
create_table("prediction_cache", "cache_key")

# Enable TTL on both tables
for table_name, attr in [("prediction_jobs", "ttl"), ("prediction_cache", "ttl")]:
    try:
        dynamo.update_time_to_live(
            TableName=table_name,
            TimeToLiveSpecification={"Enabled": True, "AttributeName": attr},
        )
        print(f"TTL enabled on {table_name}")
    except ClientError:
        pass  # Local DynamoDB may not support TTL — ignore

print("Done.")
