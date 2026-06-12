terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.49.0"
    }
  }
  backend "s3" {
    bucket = "s3-files-tf-state-bucket"
    key    = "receptor-mapper"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}
