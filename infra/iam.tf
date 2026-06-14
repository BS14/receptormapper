# ── Trust policy ─────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# ── IAM Role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "api" {
  name               = "${var.project}-api-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
  tags               = local.tags
}

# ── DynamoDB policy ───────────────────────────────────────────────────────────

data "aws_iam_policy_document" "dynamodb" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:DescribeTable"
    ]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:*:table/${var.dynamodb_table}",
      "arn:aws:dynamodb:${var.aws_region}:*:table/${var.dynamodb_table}/index/*",
    ]
  }
}

resource "aws_iam_policy" "dynamodb" {
  name        = "${var.project}-dynamodb-policy"
  description = "DynamoDB read/write for ReceptorMapper prediction and cache tables"
  policy      = data.aws_iam_policy_document.dynamodb.json
  tags        = local.tags
}

resource "aws_iam_role_policy_attachment" "dynamodb" {
  role       = aws_iam_role.api.name
  policy_arn = aws_iam_policy.dynamodb.arn
}

# ── S3 policy (docked complex PDB storage) ───────────────────────────────────

data "aws_iam_policy_document" "s3_docked" {
  statement {
    effect  = "Allow"
    actions = ["s3:PutObject", "s3:GetObject"]
    resources = ["arn:aws:s3:::${var.s3_bucket}/*"]
  }
}

resource "aws_iam_policy" "s3_docked" {
  name   = "${var.project}-s3-docked-policy"
  policy = data.aws_iam_policy_document.s3_docked.json
  tags   = local.tags
}

resource "aws_iam_role_policy_attachment" "s3_docked" {
  role       = aws_iam_role.api.name
  policy_arn = aws_iam_policy.s3_docked.arn
}

# ── SSM Session Manager (shell access without SSH or open port 22) ────────────

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# ── Instance profile ──────────────────────────────────────────────────────────

resource "aws_iam_instance_profile" "api" {
  name = "${var.project}-api-profile"
  role = aws_iam_role.api.name
  tags = local.tags
}

# ── Local-dev IAM user ────────────────────────────────────────────────────────
# Grants the same DynamoDB + S3 permissions as the EC2 role so developers
# can run the full stack locally with real AWS services.
#
# After `terraform apply`, generate access keys:
#   aws iam create-access-key --user-name receptormapper-local-dev
# Copy the output into api/.env (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY).
# NEVER commit access keys to git.

resource "aws_iam_user" "local_dev" {
  name = "${var.project}-local-dev"
  path = "/"
  tags = merge(local.tags, { Purpose = "local-development" })
}

resource "aws_iam_user_policy_attachment" "local_dev_dynamodb" {
  user       = aws_iam_user.local_dev.name
  policy_arn = aws_iam_policy.dynamodb.arn
}

resource "aws_iam_user_policy_attachment" "local_dev_s3" {
  user       = aws_iam_user.local_dev.name
  policy_arn = aws_iam_policy.s3_docked.arn
}
