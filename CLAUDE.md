# ReceptorMapper — Claude Code context

## What this project is

ReceptorMapper is a **protein–ligand molecular docking platform**. A researcher
uploads a **receptor structure (PDB)** and a **ligand file (SDF / MOL / MOL2)**,
and the platform runs **AutoDock Vina** to predict how the ligand binds. It
returns binding affinity (ΔG / pIC50 / IC50), a ranked set of poses, pose-quality
validation via RMSD against the co-crystallized ligand, a native re-docking
selectivity comparison, safety/quality flags, and a 3D docked complex rendered
with 3Dmol.js.

No AI interpretation/narrative is included. Results are numbers and structured
data only.

> History: this repo previously implemented a SMILES + protein-sequence deep
> learning predictor on AWS Lambda (off-target / cell-line / ADMET / Tanimoto).
> That design has been replaced by the FastAPI docking pipeline described here.
> Some legacy modules still exist in the tree (see "Legacy modules" below) but
> are **not** wired into the live pipeline.

---

## Repository structure

```
receptormapper/
├── CLAUDE.md                  ← you are here
├── Makefile                   ← dev/prod/test/inspection targets
├── docker-compose.dev.yml     ← local: DynamoDB-local + API + frontend
├── docker-compose.prod.yml    ← EC2: API (uvicorn) + Nginx, real AWS
├── infra/                     ← Terraform (VPC, EC2, IAM, S3, EIP, user_data)
│
├── api/                       ← FastAPI docking backend (Python 3.11)
│   ├── main.py                ← app: upload handling, S3, background orchestration
│   ├── entrypoint.sh          ← local mode: create table + seed cache, then uvicorn
│   ├── Dockerfile             ← installs Vina, Open Babel, fpocket + Python deps
│   ├── requirements.txt
│   ├── scripts/
│   │   ├── create_tables.py   ← create the single DynamoDB table (idempotent)
│   │   └── seed_cache.py      ← pre-populate cache for demos
│   ├── tests/                 ← pytest: test_api.py, test_integration.py
│   ├── models/offtarget_panel/panel.json   ← legacy, not used by docking
│   └── src/
│       ├── binding.py         ← AutoDock Vina pipeline (prep → box → dock → poses)
│       ├── rmsd.py            ← native-ligand extraction + pose RMSD / Tanimoto
│       ├── assembler.py       ← merge binding result + generate safety flags
│       ├── cache.py           ← DynamoDB job lifecycle + content-hash cache
│       └── admet.py / offtarget.py / cellline.py / tanimoto.py /
│           validator.py / handler.py   ← LEGACY (see below)
│
└── frontend/                  ← Next.js 14 app (App Router)
    ├── app/
    │   ├── page.tsx           ← upload / submission form
    │   ├── results/[jobId]/   ← results page (polls every 2s)
    │   └── api/
    │       ├── predict/route.ts          ← POST proxy → FastAPI /predict
    │       ├── predict/[jobId]/route.ts  ← GET poll proxy → FastAPI /jobs/{id}
    │       └── jobs/route.ts             ← GET recent jobs proxy
    ├── components/
    │   ├── MoleculeViewer.tsx ← 3Dmol.js viewer for the docked complex
    │   ├── FileDropzone.tsx
    │   ├── BindingAffinityCard.tsx
    │   ├── RmsdPanel.tsx
    │   ├── LigandInfoPanel.tsx
    │   └── ReceptorInfoPanel.tsx
    └── lib/
        ├── types.ts           ← result/job TypeScript types
        ├── lambda.ts          ← FastAPI fetch helpers (name is historical)
        ├── dynamo.ts
        └── generatePDF.ts
```

---

## Architecture

```
Browser → Next.js (Vercel) → Next.js API routes (thin proxies, NO AWS creds)
                                ├─ POST /api/predict        → FastAPI POST /predict (multipart)
                                ├─ GET  /api/predict/[id]   → FastAPI GET  /jobs/{id}
                                └─ GET  /api/jobs           → FastAPI GET  /jobs
                                      │
                                      ▼
                              FastAPI on EC2 (behind Nginx)
                                ├─ cache.py checks DynamoDB by sha256(receptor+ligand)
                                │     HIT  → return cached result immediately
                                │     MISS → create job (status=queued), dock in background task
                                ├─ binding.py runs the Vina pipeline
                                ├─ rmsd.py validates the pose vs native ligand
                                ├─ assembler.py merges + flags
                                └─ writes job + cache to DynamoDB, complex PDB to S3
```

### Trigger / job lifecycle

- `POST /predict` accepts `multipart/form-data` and returns **`202`** immediately
  with a **server-generated** `job_id`. Docking runs in a FastAPI background task.
- The frontend polls `GET /api/predict/[jobId]` every **2 seconds** until
  `status = complete` (or `failed`).
- Results are cached by `sha256(receptor_bytes + ligand_bytes)`. Re-submitting the
  same files returns instantly from cache (24 h TTL).
- The docked-complex S3 key is stored in the result; a **fresh presigned URL** is
  generated on every `GET /jobs/{id}` so links never go stale.

### DynamoDB — single-table design

One table (`receptormapper_jobs`) holds both jobs and the cache via a composite key:

| Item type | PK | SK | Key attributes |
|-----------|----|----|----------------|
| Job | `JOB#{job_id}` | `METADATA` | `status` (queued/running/complete/failed), `job_name`, `result` (JSON), `created_at`, `completed_at`, `ttl` |
| Cache | `CACHE#{sha256}` | `RESULT` | `result` (JSON), `created_at`, `ttl` |

Both use a **24 h TTL** on the `ttl` attribute.

### S3

Docked complexes (receptor + poses + native ligand as a multi-model PDB) are
uploaded to the `S3_BUCKET`. Access is via presigned URLs minted per request.

---

## The docking pipeline (api/src/binding.py)

1. **Ligand prep** — uploaded SDF/MOL/MOL2 → PDBQT via **Open Babel** (adds
   hydrogens, Gasteiger charges). A SMILES path (**RDKit** ETKDG embed + **Meeko**)
   exists as a fallback.
2. **Receptor prep** — clean PDB (strip waters, alt-confs, `CONECT`), then convert
   to PDBQT via Open Babel.
3. **Binding-site / box detection** — prefer the native co-crystal ligand centroid;
   else fall back to **fpocket**; else a whole-protein box.
4. **Docking** — **AutoDock Vina** (`--exhaustiveness 4 --num_modes 5`) inside the
   box. The receptor is trimmed to residues near the site first.
5. **Pose analysis** — extract the best pose, compute per-pose pocket distance and
   RMSD (`rmsd.py`), re-dock the native ligand for a ΔΔG selectivity comparison.
6. **Complex export** — merge receptor + poses (+ native) into a multi-model PDB,
   upload to S3.
7. **Fallback** — if docking fails, return a lightweight RDKit-descriptor-based
   pIC50 estimate.

External binaries (installed in `api/Dockerfile`, not in `requirements.txt`):
**AutoDock Vina**, **Open Babel**, **fpocket**.

---

## Key source modules (live pipeline)

### api/main.py
FastAPI app. Defines `GET /health`, `POST /predict` (multipart upload, generates
`job_id`, schedules background task), `GET /jobs/{job_id}` (poll + presign), and
`GET /jobs` (recent completed jobs). Handles file I/O and S3.

### api/src/binding.py
The full Vina docking pipeline (prep, box detection, dock, pose extraction, native
re-docking, complex assembly, descriptor fallback). ~620 lines — the core of the app.

### api/src/rmsd.py
Extracts the native co-crystallized ligand from the receptor PDB, classifies
self- vs cross-docking (Tanimoto on connectivity), and computes heavy-atom pose
RMSD with a success threshold.

### api/src/assembler.py
`build(...)` merges the binding result and generates the `flags` list (very strong
binding, low docking confidence, non-physical ΔG, high self-docking RMSD) plus the
`summary`.

### api/src/cache.py
DynamoDB single-table access: content-hash cache get/set, `create_job`,
`write_job_complete`, `write_job_failed`, recent-jobs query.

### Legacy modules (NOT used by the docking pipeline)
`api/src/admet.py`, `offtarget.py`, `cellline.py`, `tanimoto.py`, `validator.py`,
`handler.py`, and `models/offtarget_panel/panel.json` remain from the earlier
SMILES/sequence design. Do not assume they are on the request path — `main.py`
only imports `binding`, `rmsd`, `assembler`, and `cache`. Remove or ignore them
unless explicitly asked to revive that functionality.

---

## Local development setup

Everything runs through Docker Compose. Local DynamoDB runs in a container; the
API and frontend are built from their Dockerfiles.

### Prerequisites
- Docker Desktop running
- Make
- (Node 18+ / Python 3.11+ only needed if running pieces outside Docker)

### Run it

```bash
make up            # DynamoDB-local + API + frontend (foreground)
make up-d          # detached

make test-health   # GET /health smoke test

# Inspect local DynamoDB
make list-tables
make scan-jobs
make scan-cache

# Logs
make logs          # all services
make logs-api
make logs-frontend

make down          # tear everything down
```

Local URLs:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8080 (container listens on 8000, published as 8080) |
| API docs (Swagger) | http://localhost:8080/docs |
| DynamoDB local | http://localhost:8000 |

In local mode (`AWS_ENDPOINT_URL` is set), `api/entrypoint.sh` automatically runs
`create_tables.py` and `seed_cache.py` on container start.

### Test the API directly

```bash
# Health
curl http://localhost:8080/health

# Submit a docking job (multipart upload)
curl -X POST http://localhost:8080/predict \
  -F "receptor_pdb=@/path/to/receptor.pdb" \
  -F "ligand_file=@/path/to/ligand.sdf" \
  -F "job_name=EGFR + Erlotinib"
# → { "status": "queued", "job_id": "..." }

# Poll until complete
curl http://localhost:8080/jobs/<job_id>
```

---

## Environment variables

### API (docker-compose.dev.yml / .prod.yml on EC2)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | yes | `us-east-1` | AWS region |
| `DYNAMODB_TABLE` | no | `receptormapper_jobs` | Single jobs + cache table |
| `S3_BUCKET` | no | `receptormapper-docked-structures` | Bucket for docked complex PDBs |
| `AWS_ENDPOINT_URL` | local only | — | Points boto3 at local DynamoDB (`http://dynamodb-local:8000`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | local only | — | Fake values locally; **not set in prod** (instance IAM role) |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `FASTAPI_URL` | yes | Base URL of the FastAPI backend on EC2 |

The frontend never talks to DynamoDB or S3 directly — all access is proxied
through FastAPI. **Vercel needs no AWS credentials.**

---

## Deployment

### Backend — EC2 via Terraform (`infra/`)

Provisions a VPC, an Ubuntu 24.04 EC2 instance with an IAM instance profile
(DynamoDB + S3), a security group (80/443), an S3 bucket, and an Elastic IP.
`user_data.sh.tpl` bootstraps the instance.

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # project, region, az, instance_type, dynamodb_table, s3_bucket
terraform init
terraform apply
```

On the instance, the API stack runs from `docker-compose.prod.yml`:

```bash
git clone https://github.com/BS14/receptormapper.git && cd receptormapper
# Set AWS_REGION (+ optional DYNAMODB_TABLE, S3_BUCKET) in .env
make ssl-self-signed     # or place real certs at nginx/ssl/cert.pem + key.pem
make prod-api            # FastAPI (8000 internal) + Nginx (80/443)
make prod-logs-api
make prod-logs-nginx
```

Because the instance has an IAM role, **no AWS keys are needed in production** —
boto3 uses the instance metadata service.

### Frontend — Vercel

```bash
cd frontend && npx vercel --prod
```

Set `FASTAPI_URL` = `https://<EC2_PUBLIC_IP_OR_DOMAIN>` in the Vercel dashboard,
then redeploy.

---

## Result schema (what FastAPI returns)

`GET /jobs/{id}` returns `{ status, meta, result }` when complete:

```json
{
  "status": "complete",
  "meta": { "job_name": "EGFR + Erlotinib", "job_id": "550e8400-..." },
  "result": {
    "binding": {
      "pIC50": 7.3,
      "delta_g": -9.9,
      "ic50_nM": 50.1,
      "confidence": 0.90,
      "strength": "strong",
      "docked_complex_key": "550e8400-.../assets/complex.pdb",
      "docked_complex_url": "https://<bucket>.s3.amazonaws.com/...signed...",
      "rmsd": {
        "available": true,
        "native_resname": "AQ4",
        "mode": "self_docking",
        "tanimoto": 0.94,
        "pocket_distance_A": 0.82,
        "ligand_rmsd_A": 1.31,
        "success": true
      },
      "native_docking": {
        "delta_g": -10.2, "pIC50": 7.5, "ic50_nM": 31.6,
        "delta_delta_g": 0.3, "selectivity": "similar"
      },
      "poses": [
        { "rank": 1, "delta_g": -9.9, "pic50": 7.3, "ic50_nM": 50.1,
          "pocket_distance_A": 0.82, "rmsd_A": 1.31 }
      ]
    },
    "flags": [
      { "type": "potency", "level": "info",
        "message": "Very strong predicted binding (ΔG -9.9 kcal/mol)..." }
    ],
    "summary": { "total_flags": 1 },
    "inputs": {
      "job_id": "550e8400-...", "receptor_name": "egfr",
      "ligand_name": "erlotinib", "smiles": "C#Cc1..."
    }
  }
}
```

The TypeScript mirror of this lives in `frontend/lib/types.ts` — keep them in sync.

---

## Common tasks for Claude Code

```
"Change Vina exhaustiveness / number of poses"
→ api/src/binding.py — the Vina invocation (--exhaustiveness, --num_modes)

"Adjust the docking box size / site detection"
→ api/src/binding.py — box-detection logic (native centroid → fpocket → whole protein)

"Change the RMSD success threshold or self/cross-docking logic"
→ api/src/rmsd.py

"Add or change a safety flag"
→ api/src/assembler.py build() — append to the flags list,
  then surface it in frontend/components/RmsdPanel.tsx or BindingAffinityCard.tsx

"Change the cache TTL"
→ api/src/cache.py — the ttl value written on job/cache items (currently 24h)

"Add a field to the result"
→ api/src/assembler.py (produce it) + frontend/lib/types.ts (type it)
  + the relevant component to render it

"Rebuild the API after Python changes"
→ make down && make up   (rebuilds the api image)

"Reset local DynamoDB"
→ make down && make up    (entrypoint.sh recreates the table + seeds cache)

"Run backend tests"
→ pytest in api/tests  (test_api.py, test_integration.py)

"Edit a Next.js API proxy"
→ frontend/app/api/predict/route.ts (POST),
  frontend/app/api/predict/[jobId]/route.ts (poll),
  frontend/app/api/jobs/route.ts (recent jobs)
  — they forward to FASTAPI_URL; no AWS access here
```

---

## Key design decisions

**FastAPI on EC2 instead of Lambda:** AutoDock Vina, Open Babel, and fpocket are
native binaries, and docking jobs run longer than is comfortable on Lambda /
Vercel functions. A long-lived FastAPI server with background tasks fits better
than short-lived serverless.

**Single DynamoDB table:** all access is key-value (get-by-job-id, get-by-cache-key,
recent-jobs scan). One composite-key table holds both jobs and cache with a shared
TTL — no joins, no second table.

**Content-hash cache:** keyed on `sha256(receptor_bytes + ligand_bytes)`, so the
exact same upload pair returns instantly without re-docking.

**202 + background task + polling:** `POST /predict` returns immediately; the
frontend polls every 2s. This avoids Vercel's serverless timeout for multi-second
docking runs.

**Presign on read:** the S3 key is stored, but a fresh presigned URL is generated
on each `GET /jobs/{id}`, so the 3D viewer never gets an expired link.

**No AWS creds on Vercel:** the frontend only knows `FASTAPI_URL`. All AWS access
happens on EC2 through the instance IAM role.
