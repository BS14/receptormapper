resource "aws_s3_bucket" "docked" {
  bucket = "${var.project}-docked-structures"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "docked" {
  bucket = aws_s3_bucket.docked.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "docked_public_read" {
  bucket     = aws_s3_bucket.docked.id
  depends_on = [aws_s3_bucket_public_access_block.docked]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.docked.arn}/*"
    }]
  })
}

resource "aws_s3_bucket_cors_configuration" "docked" {
  bucket = aws_s3_bucket.docked.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}

output "docked_bucket_name" {
  value = aws_s3_bucket.docked.bucket
}
