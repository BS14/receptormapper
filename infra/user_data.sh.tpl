#!/bin/bash
set -euxo pipefail

# ── Install deps ─────────────────────────────────────────────────────────────
apt-get update -y
apt-get install -y ca-certificates curl gnupg git openssl nginx certbot python3-certbot-nginx

# ── Docker official repo (docker-compose-plugin not in ubuntu default repo) ──
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker nginx
systemctl start docker nginx
usermod -aG docker ubuntu

# ── Write API env file — compose auto-loads .env from CWD ────────────────────
DEPLOY_DIR=/home/ubuntu/receptormapper
git clone https://github.com/BS14/receptormapper "$DEPLOY_DIR"

cat > "$DEPLOY_DIR/.env" <<'ENVEOF'
AWS_REGION=${aws_region}
DYNAMODB_TABLE=${dynamodb_table}
ENVEOF

chown -R ubuntu:ubuntu "$DEPLOY_DIR"

# ── Nginx vhost for rm-api.binaya.com.np ─────────────────────────────────────
cat > /etc/nginx/sites-available/rm-api.binaya.com.np <<'NGINXEOF'
server {
    listen 80;
    server_name rm-api.binaya14.com.np;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/rm-api.binaya.com.np /etc/nginx/sites-enabled/rm-api.binaya.com.np
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── Start production stack ────────────────────────────────────────────────────
cd "$DEPLOY_DIR"
docker compose -f docker-compose.prod.yml up --build -d

echo "ReceptorMapper API bootstrap complete."
