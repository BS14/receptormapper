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
    ]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:*:table/${var.dynamodb_jobs_table}",
      "arn:aws:dynamodb:${var.aws_region}:*:table/${var.dynamodb_jobs_table}/index/*",
      "arn:aws:dynamodb:${var.aws_region}:*:table/${var.dynamodb_cache_table}",
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
