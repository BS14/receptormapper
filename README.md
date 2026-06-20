<div align="center">
  <img src="frontend/public/logo.png" alt="ReceptorMapper Logo" width="80" />
  <h1>ReceptorMapper</h1>
  <p><strong>Protein–Ligand Molecular Docking Platform</strong></p>
  <p>Upload a receptor structure and a ligand, run AutoDock Vina docking, and explore binding poses, affinity, and pose-quality metrics in an interactive 3D viewer.</p>
</div>

---

## What It Does

ReceptorMapper takes a **receptor protein (PDB)** and a **ligand (SDF / MOL / MOL2)**, prepares both for docking, and runs **AutoDock Vina** to predict how the ligand binds:

| Output | Description |
|--------|-------------|
| Binding affinity | Best-pose ΔG (kcal/mol), pIC50, IC50 (nM), confidence, strength label |
| Multi-pose ranking | Up to 5 Vina poses, each with ΔG, pIC50, IC50, and pocket distance |
| Pose validation (RMSD) | When the receptor PDB contains a co-crystallized ligand, the docked pose is compared to it (self- vs cross-docking, heavy-atom RMSD, success flag) |
| Native re-docking | The crystal ligand is re-docked to give a ΔΔG selectivity comparison (`stronger` / `similar` / `weaker`) |
| Safety / quality flags | Very strong binding, low docking confidence, non-physical ΔG, and high self-docking RMSD warnings |
| 3D complex | Receptor + all poses (+ native ligand) merged into a multi-model PDB, stored in S3 and rendered with 3Dmol |

Results are cached by **SHA-256 hash of the uploaded files** (24 h TTL). Submitting the same receptor + ligand again returns instantly from cache.

### How docking works (pipeline)

1. **Ligand prep** — uploaded SDF/MOL/MOL2 → PDBQT via Open Babel (Gasteiger charges, hydrogens added). A SMILES path (RDKit ETKDG + Meeko) also exists as a fallback.
2. **Receptor prep** — clean PDB (strip waters, alt-conformations, `CONECT`), then convert to PDBQT via Open Babel.
3. **Binding-site detection** — use the native co-crystal ligand centroid when present; otherwise fall back to `fpocket`, then to a whole-protein box.
4. **Docking** — AutoDock Vina (`--exhaustiveness 4 --num_modes 5`) within the detected box; trims the receptor to residues near the site first.
5. **Pose analysis** — extract best pose, compute per-pose pocket distance and RMSD, re-dock the native ligand, and assemble the result.
6. **Complex export** — merge receptor + poses into a multi-model PDB and upload to S3 (served later via presigned URL).

If docking fails, a lightweight RDKit-descriptor-based pIC50 estimate is returned as a fallback.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| 3D / chem viz | [3Dmol.js](https://3dmol.csb.pitt.edu/), smiles-drawer, Recharts |
| Backend API | FastAPI + Uvicorn (Python 3.11) |
| Docking engine | AutoDock Vina, Open Babel, fpocket, Meeko |
| Cheminformatics | RDKit, NumPy, Biopython |
| Structure prediction (fallback) | ESMFold (ESMAtlas API) for sequence → PDB |
| Storage | Amazon DynamoDB (jobs + cache), Amazon S3 (docked complexes) |
| Infra | Terraform (VPC, EC2, IAM, S3, EIP), Docker, Nginx |

Key Python dependencies (`api/requirements.txt`): `boto3`, `numpy<2`, `rdkit-pypi`, `meeko`, `biopython`, `requests`, `fastapi`, `uvicorn`, `python-multipart`. (Vina, Open Babel, and fpocket are installed in the Docker image.)

---

## Architecture

```
Browser (Vercel)
  └─ Next.js API routes (thin proxies, no AWS creds)
        ├─ POST /api/predict        → FastAPI POST /predict   (multipart upload)
        ├─ GET  /api/predict/[id]   → FastAPI GET  /jobs/{id} (poll status)
        └─ GET  /api/jobs           → FastAPI GET  /jobs      (recent jobs)
              │
              ▼
        FastAPI (EC2 + Nginx)
          ├─ main.py        ── upload handling, S3, background job orchestration
          └─ src/
             ├─ binding.py    AutoDock Vina docking pipeline (prep, box, dock, poses)
             ├─ rmsd.py       native-ligand extraction + pose RMSD / similarity
             ├─ assembler.py  merge binding result + generate safety flags
             └─ cache.py      DynamoDB job lifecycle + content-hash cache
              │
              ├──► DynamoDB  (single table: receptormapper_jobs)
              └──► S3        (docked complex PDBs)
```

- All DynamoDB and S3 access happens on EC2 through the instance IAM role. **Vercel needs no AWS credentials** — only `FASTAPI_URL`.
- `POST /predict` returns `202` immediately with a server-generated `job_id`; docking runs in a FastAPI **background task**.
- The frontend polls `GET /api/predict/[jobId]` every 2 s until `status = complete`.
- The docked-complex S3 key is stored in the result; a fresh **presigned URL** is generated on each `GET /jobs/{id}` so links never expire stale.

### DynamoDB — single-table design

One table (`receptormapper_jobs`) with a composite key holds both jobs and the cache:

| Item type | PK | SK | Notes |
|-----------|----|----|-------|
| Job | `JOB#{job_id}` | `METADATA` | `status`, `job_name`, `result` (JSON), `created_at`, `completed_at`, `ttl` |
| Cache | `CACHE#{sha256}` | `RESULT` | `result` (JSON), `created_at`, `ttl` |

Both use a **24 h TTL** on the `ttl` attribute. The cache key is `sha256(receptor_bytes + ligand_bytes)`.

---

## FastAPI — API Reference

Base URL (EC2): `https://<EC2_PUBLIC_IP_OR_DOMAIN>`

### `GET /health`

```json
{ "status": "ok" }
```

---

### `POST /predict`

Submit a docking job. Accepts **`multipart/form-data`** (file uploads). Returns `202` immediately; docking runs in the background. The job ID is generated server-side.

**Form fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `receptor_pdb` | file | yes | Receptor structure in PDB format |
| `ligand_file` | file | yes | Ligand in SDF, MOL, or MOL2 format |
| `job_name` | string | no | Human-readable label. Defaults to the receptor filename stem. |

**Response `202`**
```json
{ "status": "queued", "job_id": "550e8400-e29b-41d4-a716-446655440000" }
```

---

### `GET /jobs/{job_id}`

Poll job status. Returns the full result when complete (with a freshly generated presigned S3 URL for the docked complex).

**queued / running**
```json
{ "status": "queued" }
```

**complete**
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
        { "rank": 1, "delta_g": -9.9, "pic50": 7.3, "ic50_nM": 50.1, "pocket_distance_A": 0.82, "rmsd_A": 1.31 }
      ]
    },
    "flags": [
      { "type": "potency", "level": "info", "message": "Very strong predicted binding (ΔG -9.9 kcal/mol)..." }
    ],
    "summary": { "total_flags": 1 },
    "inputs": { "job_id": "550e8400-...", "receptor_name": "egfr", "ligand_name": "erlotinib", "smiles": "C#Cc1..." }
  }
}
```

**failed**
```json
{ "status": "failed", "error": "..." }
```

---

### `GET /jobs`

Returns the 10 most recent **completed** jobs (sorted by `created_at` desc).

```json
{
  "jobs": [
    { "job_id": "...", "job_name": "EGFR + Erlotinib", "created_at": 1717500000, "completed_at": 1717500120 }
  ]
}
```

Interactive Swagger docs are available at `https://<EC2_IP>/docs`.

---

## Repository Layout

```
receptormapper/
├── api/                       FastAPI docking backend (Python)
│   ├── main.py                upload handling, S3, background orchestration
│   ├── entrypoint.sh          creates tables + seeds cache in local mode, then runs uvicorn
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── models/offtarget_panel/panel.json
│   ├── scripts/
│   │   ├── create_tables.py   create the single DynamoDB table (idempotent)
│   │   └── seed_cache.py      pre-populate cache for demos
│   └── src/
│       ├── binding.py         AutoDock Vina docking pipeline
│       ├── rmsd.py            native-ligand extraction + pose RMSD / Tanimoto
│       ├── assembler.py       merge result + generate safety flags
│       ├── cache.py           DynamoDB jobs + content-hash cache
│       ├── admet.py / offtarget.py / cellline.py / tanimoto.py / validator.py / handler.py
│       └── ...
│   └── tests/                 pytest (test_api.py, test_integration.py)
├── frontend/                  Next.js 14 App Router app
│   ├── app/
│   │   ├── page.tsx           upload / submission form
│   │   ├── results/[jobId]/   results page (polls every 2 s)
│   │   └── api/
│   │       ├── predict/route.ts          POST proxy → FastAPI /predict
│   │       ├── predict/[jobId]/route.ts  GET poll proxy → FastAPI /jobs/{id}
│   │       └── jobs/route.ts             GET recent jobs proxy
│   ├── components/            MoleculeViewer (3Dmol), FileDropzone,
│   │                          BindingAffinityCard, RmsdPanel,
│   │                          LigandInfoPanel, ReceptorInfoPanel
│   └── lib/                   types.ts, generatePDF.ts, dynamo.ts
├── infra/                     Terraform (VPC, EC2, IAM, S3, EIP, user_data)
├── docker-compose.dev.yml     local: DynamoDB-local + API + frontend
├── docker-compose.prod.yml    EC2: API + Nginx (real AWS)
├── Makefile                   dev/prod/test/inspection targets
└── CLAUDE.md
```

> Note: `src/admet.py`, `offtarget.py`, `cellline.py`, `tanimoto.py`, `validator.py`, and `handler.py` remain in the tree from an earlier SMILES/sequence prediction design. The live docking pipeline (`main.py`) uses only `binding.py`, `rmsd.py`, `assembler.py`, and `cache.py`.

---

## Local Development

Requires Docker. Local DynamoDB runs in a container; the API and frontend are built from their Dockerfiles.

```bash
# Start all services (DynamoDB local + API + frontend)
make up            # or: make up-d  (detached)

# Smoke test
make test-health   # GET /health

# Inspect local DynamoDB
make list-tables
make scan-jobs
make scan-cache

# Logs
make logs          # all
make logs-api
make logs-frontend

# Tear down
make down
```

Local URLs:

- Frontend: http://localhost:3000
- API: http://localhost:8080  (container listens on 8000, published as 8080)
- API docs: http://localhost:8080/docs
- DynamoDB local: http://localhost:8000

In local mode (`AWS_ENDPOINT_URL` set), `entrypoint.sh` automatically creates the table and seeds the cache on container start.

---

## Deployment

### Backend — EC2 (Terraform)

Infrastructure is defined in `infra/` (Terraform). It provisions a VPC, an Ubuntu 24.04 EC2 instance with an IAM instance profile (DynamoDB + S3 access), a security group (ports 80/443), an S3 bucket, and an Elastic IP. `user_data.sh.tpl` bootstraps the instance.

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # set project, region, az, instance_type, dynamodb_table, s3_bucket
terraform init
terraform apply
```

To run the API stack manually on the instance:

```bash
git clone https://github.com/BS14/receptormapper.git
cd receptormapper

# Provide AWS_REGION (and optionally DYNAMODB_TABLE, S3_BUCKET) in .env
make ssl-self-signed     # or place real certs at nginx/ssl/cert.pem + key.pem
make prod-api            # docker-compose.prod.yml: FastAPI (8000, internal) + Nginx (80/443)

make prod-logs-api
make prod-logs-nginx
```

Because the instance has an IAM role, **no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are needed** in production — the SDK uses the instance metadata service.

### Frontend — Vercel

```bash
cd frontend
npx vercel --prod
```

Set one environment variable in the Vercel dashboard, then redeploy:

| Variable | Value |
|----------|-------|
| `FASTAPI_URL` | `https://<EC2_PUBLIC_IP_OR_DOMAIN>` |

---

## Environment Variables

### API (EC2 / `docker-compose.prod.yml`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | yes | `us-east-1` | AWS region |
| `DYNAMODB_TABLE` | no | `receptormapper_jobs` | Single jobs + cache table |
| `S3_BUCKET` | no | `receptormapper-docked-structures` | Bucket for docked complex PDBs |
| `AWS_ENDPOINT_URL` | local only | — | Points boto3 at local DynamoDB |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | local only | — | Not needed in prod (instance IAM role) |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `FASTAPI_URL` | yes | Base URL of the FastAPI backend on EC2 |

The frontend never talks to DynamoDB or S3 directly — all access is proxied through FastAPI.

---

## License

MIT — see [LICENSE](LICENSE).
