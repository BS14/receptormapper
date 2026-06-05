locals {
  tags = {
    Project     = var.project
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# ── Ubuntu 24.04 LTS AMI ──────────────────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── VPC (community module, single AZ, public subnet only) ────────────────────

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project}-vpc"
  cidr = "10.0.0.0/16"

  azs            = [var.az]
  public_subnets = ["10.0.1.0/24"]

  enable_nat_gateway      = false
  enable_vpn_gateway      = false
  map_public_ip_on_launch = true

  tags = local.tags
}

# ── Security Group (80 + 443 inbound, SSM outbound) ───────────────────────────

resource "aws_security_group" "api" {
  name        = "${var.project}-api-sg"
  description = "Allow HTTP/HTTPS inbound. SSM handles management — no SSH port needed."
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound (SSM, DynamoDB, Docker Hub, apt)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

# ── EC2 Instance (community module) ──────────────────────────────────────────

module "ec2" {
  source  = "terraform-aws-modules/ec2-instance/aws"
  version = "~> 5.0"

  name = "${var.project}-api"

  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = module.vpc.public_subnets[0]
  vpc_security_group_ids      = [aws_security_group.api.id]
  iam_instance_profile        = aws_iam_instance_profile.api.name
  associate_public_ip_address = true

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    aws_region           = var.aws_region
    dynamodb_jobs_table  = var.dynamodb_jobs_table
    dynamodb_cache_table = var.dynamodb_cache_table
    repo_url             = var.repo_url
  })
  user_data_replace_on_change = true

  root_block_device = [
    {
      volume_size           = 30
      volume_type           = "gp3"
      delete_on_termination = true
    }
  ]

  tags = local.tags
}

# ── Elastic IP ────────────────────────────────────────────────────────────────

resource "aws_eip" "api" {
  instance = module.ec2.id
  domain   = "vpc"
  tags     = merge(local.tags, { Name = "${var.project}-api-eip" })

  depends_on = [module.vpc]
}
