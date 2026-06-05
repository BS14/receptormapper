<div align="center">
  <img src="frontend/public/logo.png" alt="ReceptorMapper Logo" width="80" />
  <h1>ReceptorMapper</h1>
  <p><strong>Drug-Target Interaction Prediction Platform</strong></p>
  <p>Predict binding affinity, off-target liabilities, cancer cell-line sensitivity, and ADMET properties from a SMILES string and protein sequence.</p>
</div>

---

## What It Does

ReceptorMapper takes a **drug molecule (SMILES)** and a **protein target (amino acid sequence)** and runs:

| Module | Output |
|--------|--------|
| Binding affinity | pIC50, IC50 (nM), ΔG (kcal/mol), confidence, strength |
| Off-target panel | 47 proteins scored for binding risk (hERG, CYPs, kinases, …) |
| Cell-line sensitivity | IC50 across cancer cell panels (lung, breast, pan-cancer, …) |
| ADMET / Lipinski Ro5 | MW, LogP, HBD, HBA, TPSA, drug-likeness |
| Tanimoto similarity | Distance to training set; extrapolation risk flag |

Results are cached in DynamoDB (24 h TTL). Second submission of the same input returns instantly from cache.

---

## Models

### DeepPurpose — MPNN-CNN (default)

Message Passing Neural Network encodes the drug graph; CNN encodes the protein sequence. Pre-trained on **BindingDB IC50** data.

> Huang, K., Fu, T., Glass, L. M., Zitnik, M., Xiao, C., & Sun, J. (2020).
> **DeepPurpose: A Deep Learning Library for Drug–Target Interaction Prediction.**
> *Bioinformatics*. https://doi.org/10.1093/bioinformatics/btaa1005

### TDC / PyTDC — DeepDTA (optional)

Two CNN encoders (drug SMILES + protein sequence). Pre-trained on **DAVIS Kd** kinase panel data via the Therapeutics Data Commons model hub.

> Huang, K., Fu, T., Gao, W., Zhao, Y., Roohani, Y., Leskovec, J., Coley, C. W., Xiao, C., Sun, J., & Zitnik, M. (2021).
> **Therapeutics Data Commons: Machine Learning Datasets and Tasks for Drug Discovery and Development.**
> *NeurIPS Datasets and Benchmarks*. https://doi.org/10.48550/arXiv.2102.09548

> Huang, K., Fu, T., Gao, W., Zhao, Y., Roohani, Y., Leskovec, J., Coley, C. W., Xiao, C., Sun, J., & Zitnik, M. (2022).
> **Artificial intelligence foundation for therapeutic science.**
> *Nature Chemical Biology*, 18, 1033–1036. https://doi.org/10.1038/s41589-022-01131-2

---

## Architecture

```
Browser (Vercel)
  └─ Next.js API routes (thin proxies)
        └─► FastAPI (EC2) ──► DynamoDB (AWS)
              ├─ POST /predict     → job create + background prediction
              ├─ GET  /jobs/{id}   → job status + result
              ├─ GET  /jobs        → recent completed jobs
              ├─ binding.py        (DeepPurpose / TDC)
              ├─ offtarget.py      (47-protein panel)
              ├─ cellline.py       (GDSC2 cell lines)
              ├─ admet.py          (RDKit Ro5)
              └─ tanimoto.py       (Morgan fingerprints)
```

All DynamoDB access goes through FastAPI. Vercel needs **no AWS credentials** — only `FASTAPI_URL`.

Frontend polls `GET /api/predict/[jobId]` (proxied to FastAPI) every 2 s until `status = complete`.

---

## FastAPI — API Reference

Base URL (EC2): `http://<EC2_PUBLIC_IP>:8000`

### `GET /health`

Health check.

**Response**
```json
{ "status": "ok" }
```

---

### `POST /predict`

Submit a prediction job. Returns immediately (202); prediction runs in background and writes result to DynamoDB. **Job ID is generated server-side.**

**Request body**
```json
{
  "smiles": "CC(=O)Nc1ccc(O)cc1",
  "target_sequence": "MRPSGTAGAALL...",
  "model": "MPNN_CNN_BindingDB_IC50",
  "cell_panel": "lung",
  "job_name": "Paracetamol"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `smiles` | string | yes | Valid SMILES string |
| `target_sequence` | string | yes | Single-letter amino acid sequence, ≥ 20 residues |
| `model` | string | no | `MPNN_CNN_BindingDB_IC50` (default) · `TDC_DeepDTA_DAVIS` |
| `cell_panel` | string | no | `lung` (default) · `breast` · `colorectal` · `prostate` · `ovarian` · `pancreatic` · `leukemia` · `melanoma` · `glioblastoma` · `liver` · `renal` · `pan` · `diabetic` · `neurological` |
| `job_name` | string | no | Human-readable label (compound name). Defaults to first 20 chars of SMILES. |

**Response `202`**
```json
{ "status": "queued", "job_id": "550e8400-e29b-41d4-a716-446655440000" }
```

---

### `GET /jobs/{job_id}`

Poll job status. Returns result when complete.

**Response — queued/running**
```json
{ "status": "queued" }
```

**Response — complete**
```json
{
  "status": "complete",
  "meta": { "smiles": "...", "target": "...", "model": "...", "cell_panel": "..." },
  "result": {
    "binding":   { "pIC50": 6.2, "delta_g": -8.4, "ic50_nM": 630.0, "confidence": 0.81, "strength": "moderate" },
    "offtarget": [{ "name": "hERG", "family": "Ion channel", "pic50": 4.1, "risk": "low", "flag": false }],
    "cellline":  [{ "name": "A549", "ic50": 0.31 }],
    "admet":     { "mw": 151.2, "logP": 0.46, "hbd": 2, "hba": 2, "tpsa": 49.3, "rotatable_bonds": 2, "aromatic_rings": 1, "ro5_violations": 0, "drug_like": true },
    "tanimoto":  { "max_tanimoto": 0.74, "mean_top10": 0.61, "adj_confidence": 0.90, "extrapolation_risk": false },
    "flags":     [{ "type": "cardiac", "level": "danger", "message": "hERG binding pIC50 5.8 — cardiac liability." }],
    "summary":   { "total_flags": 1, "high_risk_ots": 1, "sensitive_lines": 4 }
  }
}
```

**Response — failed**
```json
{ "status": "failed", "error": "Invalid SMILES string" }
```

---

### `GET /jobs`

Returns the 10 most recent completed jobs (sorted by `created_at` desc).

**Response**
```json
{
  "jobs": [
    { "job_id": "...", "job_name": "Erlotinib", "smiles": "...", "model": "MPNN_CNN_BindingDB_IC50", "created_at": 1717500000 }
  ]
}
```

---

Interactive docs available at `http://<EC2_IP>:8000/docs` (Swagger UI) after deployment.

---

## EC2 Deployment (FastAPI Backend)

### 1 — Launch EC2 instance

- AMI: **Ubuntu 22.04 LTS**
- Instance type: `t3.large` minimum (4 GB RAM — PyTorch requirement)
- Security group inbound rules:
  - Port `22` — SSH (your IP only)
  - Port `8000` — FastAPI (Vercel IP range or `0.0.0.0/0` for dev)

### 2 — Attach IAM role with DynamoDB access

Create an IAM role with this policy and attach it to the instance:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:<REGION>:<ACCOUNT_ID>:table/prediction_jobs",
        "arn:aws:dynamodb:<REGION>:<ACCOUNT_ID>:table/prediction_jobs/index/*",
        "arn:aws:dynamodb:<REGION>:<ACCOUNT_ID>:table/prediction_cache"
      ]
    }
  ]
}
```

With an instance role attached, **no AWS credentials are needed** in environment variables. The SDK picks them up automatically via the instance metadata service.

### 3 — Create DynamoDB tables (run once)

```bash
aws dynamodb create-table \
  --table-name prediction_jobs \
  --attribute-definitions AttributeName=job_id,AttributeType=S \
  --key-schema AttributeName=job_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region <REGION>

aws dynamodb update-time-to-live \
  --table-name prediction_jobs \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --region <REGION>

aws dynamodb create-table \
  --table-name prediction_cache \
  --attribute-definitions AttributeName=cache_key,AttributeType=S \
  --key-schema AttributeName=cache_key,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region <REGION>

aws dynamodb update-time-to-live \
  --table-name prediction_cache \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --region <REGION>
```

### 4 — Install Docker on EC2

```bash
sudo apt update && sudo apt install -y docker.io
sudo usermod -aG docker ubuntu
newgrp docker
```

### 5 — Build and run the API + Nginx

```bash
git clone https://github.com/BS14/receptormapper.git
cd receptormapper

# Generate self-signed cert (or place real certs at nginx/ssl/cert.pem + nginx/ssl/key.pem)
make ssl-self-signed

# Set required env var and start
AWS_REGION=<REGION> make prod-api
```

This runs `docker-compose.prod.yml` — FastAPI on port 8000 (internal) + Nginx on 80/443.

> No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` needed — the instance IAM role handles auth automatically.

### 6 — Verify

```bash
curl https://localhost/health -k
# {"status":"ok"}

make prod-logs-api      # tail API logs
make prod-logs-nginx    # tail Nginx logs
```

Swagger UI: `https://<EC2_PUBLIC_IP>/docs`

### 7 — (Optional) Keep alive with systemd

```bash
sudo tee /etc/systemd/system/receptormapper.service > /dev/null <<EOF
[Unit]
Description=ReceptorMapper API
After=docker.service
Requires=docker.service

[Service]
Restart=always
ExecStart=/usr/bin/docker start -a rm-api
ExecStop=/usr/bin/docker stop rm-api

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable receptormapper
sudo systemctl start receptormapper
```

---

## Vercel Deployment (Next.js Frontend)

> **No AWS credentials needed on Vercel.** All DynamoDB access goes through FastAPI on EC2. Vercel only needs to know where FastAPI lives.

### 1 — Deploy to Vercel

```bash
cd frontend
npx vercel --prod
```

### 2 — Set environment variables in Vercel dashboard

`Project → Settings → Environment Variables`

| Variable | Value |
|----------|-------|
| `FASTAPI_URL` | `https://<EC2_PUBLIC_IP_OR_DOMAIN>` |
| `NEXTAUTH_URL` | `https://<your-app>.vercel.app` |
| `NEXTAUTH_SECRET` | output of `openssl rand -base64 32` |

### 3 — Redeploy after setting env vars

```bash
npx vercel --prod
```

---

## Local Development

```bash
# Start all services (DynamoDB local + API + frontend)
make up

# Smoke tests
make test-health       # GET /health
make test-api          # Paracetamol via DeepPurpose
make test-tdc          # Paracetamol via TDC DeepDTA
make test-erlotinib    # Erlotinib via DeepPurpose

# Inspect DynamoDB
make scan-jobs
make scan-cache

# Tear down
make down
```

Frontend: http://localhost:3000  
API: http://localhost:8080  
API docs: http://localhost:8080/docs

---

## Environment Variables Reference

### EC2 container

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | yes | — | AWS region |
| `AWS_ENDPOINT_URL` | local only | — | Points to local DynamoDB |
| `AWS_ACCESS_KEY_ID` | local only | — | Not needed with instance role |
| `AWS_SECRET_ACCESS_KEY` | local only | — | Not needed with instance role |
| `DYNAMODB_JOBS_TABLE` | yes | `prediction_jobs` | Job tracking table |
| `DYNAMODB_CACHE_TABLE` | yes | `prediction_cache` | Result cache table |

### Vercel (frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| `FASTAPI_URL` | yes | EC2 API base URL (e.g. `https://api.example.com`) |
| `NEXTAUTH_URL` | yes | Vercel app URL |
| `NEXTAUTH_SECRET` | yes | Random 32-byte secret |

No AWS credentials needed — frontend never talks to DynamoDB directly.

---

## License

MIT
