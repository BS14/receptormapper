#!/bin/bash
set -euxo pipefail

# ── Install Docker ────────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y docker.io docker-compose-plugin git curl openssl

systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu

# ── Clone repo ────────────────────────────────────────────────────────────────
cd /home/ubuntu
git clone ${repo_url} receptormapper
cd receptormapper
chown -R ubuntu:ubuntu /home/ubuntu/receptormapper

# ── Write API env file (no AWS keys — instance role handles auth) ─────────────
cat > .env.local <<'ENVEOF'
AWS_REGION=${aws_region}
DYNAMODB_JOBS_TABLE=${dynamodb_jobs_table}
DYNAMODB_CACHE_TABLE=${dynamodb_cache_table}
ENVEOF

# ── Generate self-signed SSL cert (replace with real cert for production) ─────
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out  nginx/ssl/cert.pem \
  -subj "/CN=receptormapper"

# ── Start production stack (API + Nginx) ──────────────────────────────────────
AWS_REGION=${aws_region} docker compose -f docker-compose.prod.yml up --build -d

echo "ReceptorMapper API bootstrap complete."
