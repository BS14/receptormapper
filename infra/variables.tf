variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "az" {
  description = "Single availability zone"
  type        = string
  default     = "ap-south-1a"
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

variable "dynamodb_jobs_table" {
  description = "DynamoDB prediction jobs table name"
  type        = string
  default     = "prediction_jobs"
}

variable "dynamodb_cache_table" {
  description = "DynamoDB prediction cache table name"
  type        = string
  default     = "prediction_cache"
}

variable "repo_url" {
  description = "Git repo URL to clone on the EC2 instance"
  type        = string
  default     = "https://github.com/BS14/receptormapper.git"
}
