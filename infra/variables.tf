variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "az" {
  description = "Single availability zone"
  type        = string
  default     = "us-east-1a"
}

variable "project" {
  description = "Project name — used as prefix for all resource names"
  type        = string
  default     = "receptormapper"
}

variable "instance_type" {
  description = "EC2 instance type (t3.large minimum — PyTorch needs 4 GB RAM)"
  type        = string
  default     = "t3.large"
}

variable "dynamodb_table" {
  description = "DynamoDB single table name (from Vercel integration)"
  type        = string
  default     = "receptormapper_jobs"
}

variable "s3_bucket" {
  description = "S3 bucket for docked complex PDB files"
  type        = string
  default     = "receptormapper-docked-structures"
}
