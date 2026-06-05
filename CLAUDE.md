# ReceptorMapper — Claude Code context

## What this project is

ReceptorMapper is a drug-target interaction prediction platform for computational
chemists and drug discovery researchers. A researcher submits a SMILES string and
a protein target sequence. The platform runs pre-trained deep learning models to
predict binding affinity, off-target effects, cancer cell line sensitivity, and
ADMET properties. Results are returned as structured JSON and rendered as charts
and tables in the Next.js frontend.

No AI interpretation/narrative is included in this version. Results are numbers
and structured data only.

---

## Repository structure

```
receptormapper/
├── CLAUDE.md                  ← you are here
├── frontend/                  ← Next.js 14 app (App Router)
│   ├── app/
│   │   ├── page.tsx           ← home / submission form
│   │   ├── results/[jobId]/   ← results page
│   │   └── api/
│   │       ├── predict/
│   │       │   └── route.ts   ← POST: create job, invoke Lambda
│   │       └── predict/[jobId]/
│   │           └── route.ts   ← GET: poll job status from DynamoDB
│   ├── components/
│   │   ├── SMILESInput.tsx
│   │   ├── BindingAffinityCard.tsx
│   │   ├── OffTargetTable.tsx
│   │   ├── CellLineSensitivityGrid.tsx
│   │   └── ADMETPanel.tsx
│   ├── lib/
│   │   ├── dynamo.ts          ← DynamoDB client (reads env vars)
│   │   └── lambda.ts          ← Lambda invocation helper
│   └── .env.local             ← local env vars (never commit)
│
└── lambda/                    ← Python Lambda (Docker image)
    ├── Dockerfile
    ├── handler.py             ← entry point
    ├── cache.py               ← DynamoDB cache check and write
    ├── validator.py           ← SMILES + protein sequence validation
    ├── binding.py             ← DeepPurpose binding affinity prediction
    ├── offtarget.py           ← 47-protein off-target panel scoring
    ├── cellline.py            ← GDSC2 cancer cell line sensitivity
    ├── admet.py               ← RDKit ADMET and Lipinski Ro5
    ├── tanimoto.py            ← training similarity + confidence adjustment
    ├── assembler.py           ← merge all outputs, apply safety flags
    ├── models/
    │   ├── MPNN_CNN_BindingDB/ ← pre-downloaded model weights (baked in image)
    │   └── offtarget_panel/
    │       └── panel.json     ← 47 protein sequences with names and families
    └── scripts/
        ├── create_tables.py   ← create local DynamoDB tables (run once)
        └── seed_cache.py      ← pre-populate cache with 20 known drug-target pairs
```

---

## Architecture

```
Browser → Next.js (Vercel) → DynamoDB (job created, status = queued)
                           → Lambda invoked async
                           → poll GET /api/predict/[jobId] every 2s

Lambda → cache.py checks DynamoDB cache by sha256(smiles+target+model)
       → HIT: write job complete, return immediately
       → MISS: run all 5 modules in sequence, assemble, write to cache + job
```

### Trigger logic

- Vercel API route checks DynamoDB cache BEFORE invoking Lambda
- If cache hit: return result synchronously, no Lambda invocation
- If cache miss: create job record, invoke Lambda async, return job_id
- Frontend polls `GET /api/predict/[jobId]` every 2 seconds until status = complete

### DynamoDB tables

**prediction_jobs**
- PK: `job_id` (uuid string)
- Attributes: `smiles`, `target`, `model`, `status` (queued/running/complete/failed),
  `result` (JSON string), `created_at`, `completed_at`, `error`
- GSI: `user_id-index` on `user_id` — lists all jobs per user

**prediction_cache**
- PK: `cache_key` (sha256 hex string)
- Attributes: `result` (JSON string), `created_at`, `ttl` (Unix timestamp, 30 days)
- TTL enabled on `ttl` attribute

---

## Lambda modules

### handler.py
Entry point. Validates inputs, checks cache, routes to full prediction if miss,
calls assembler, writes to DynamoDB.

### cache.py
- `get(smiles, target, model)` → dict or None
- `set(smiles, target, model, result)` → None
- `write_job_complete(job_id, result)` → None
- `write_job_failed(job_id, message)` → None

### validator.py
- `validate(smiles, target)` → tuple[bool, str | None]
- Uses RDKit `Chem.MolFromSmiles` for SMILES validation
- Checks protein sequence for valid amino acid characters (ACDEFGHIKLMNPQRSTVWY)

### binding.py
- `predict(smiles, target, model_name)` → dict
- Returns: `pIC50`, `delta_g`, `ic50_nM`, `confidence`, `strength`
- Uses DeepPurpose MPNN-CNN model trained on BindingDB
- Model loaded once at container startup (global `_model` variable)

### offtarget.py
- `score(smiles, model_name)` → list[dict]
- Scores against 47 proteins from `models/offtarget_panel/panel.json`
- Returns list sorted by pIC50 descending
- Each item: `name`, `family`, `pic50`, `risk` (high/medium/low), `flag`

### cellline.py
- `predict(smiles, panel)` → list[dict]
- Panel options: `lung` (12 lines), `breast` (10 lines), `pan` (20 lines)
- Returns list of `{name, ic50}` sorted by IC50 ascending

### admet.py
- `calculate(smiles)` → dict
- Uses RDKit Descriptors: MW, LogP, HBD, HBA, TPSA, rotatable bonds, aromatic rings
- Returns `ro5_violations` count and `drug_like` boolean (≤1 violation)

### tanimoto.py
- `similarity(smiles, model_name)` → dict
- Loads pre-computed Morgan fingerprints from `models/MPNN_CNN_BindingDB/train_fps.pkl`
- Returns `max_tanimoto`, `mean_top10`, `adj_confidence`, `extrapolation_risk`
- Confidence thresholds: ≥0.7 → 0.90, ≥0.5 → 0.75, ≥0.3 → 0.60, <0.3 → 0.40

### assembler.py
- `build(binding, offtarget, cellline, admet, tanimoto, smiles, target)` → dict
- Overrides binding confidence with tanimoto adj_confidence
- Generates `flags` list for: hERG, CYP3A4, extrapolation risk, Ro5 violations
- Returns full result dict with `binding`, `offtarget`, `cellline`, `admet`,
  `tanimoto`, `flags`, `summary`

---

## Local development setup

### Prerequisites
- Docker Desktop running
- Node.js 18+
- Python 3.11+
- AWS CLI configured (any region, fake credentials fine for local)

### First-time setup

```bash
# 1. Clone and install frontend deps
cd frontend && npm install

# 2. Copy env template
cp frontend/.env.example frontend/.env.local
# Edit .env.local — see env vars section below

# 3. Build Lambda image
docker build -t receptormapper-lambda ./lambda

# 4. Start local DynamoDB
docker run -d --name dynamo-local -p 8000:8000 amazon/dynamodb-local

# 5. Create tables
cd lambda && python scripts/create_tables.py

# 6. Seed cache with known drug-target pairs (optional but recommended for demo)
python scripts/seed_cache.py
```

### Running locally (4 terminals)

```bash
# Terminal 1 — DynamoDB (if not already running)
docker start dynamo-local

# Terminal 2 — Lambda container
docker run --rm -p 9000:8080 \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=fake \
  -e AWS_SECRET_ACCESS_KEY=fake \
  -e AWS_ENDPOINT_URL=http://host.docker.internal:8000 \
  -e DYNAMODB_CACHE_TABLE=prediction_cache \
  -e DYNAMODB_JOBS_TABLE=prediction_jobs \
  receptormapper-lambda

# Terminal 3 — Next.js frontend
cd frontend && npm run dev

# Terminal 4 — Claude Code (this session)
cd receptormapper && claude
```

### Test Lambda directly

```bash
curl -X POST http://localhost:9000/2015-03-31/functions/function/invocations \
  -H 'Content-Type: application/json' \
  -d '{
    "job_id": "test-001",
    "smiles": "CC(=O)Nc1ccc(O)cc1",
    "target_sequence": "MKKFFDSRREQGGSGLGSGSSGGGGSTSGLGSGYGSGGSGPSGNNQNQG",
    "model": "MPNN_CNN_BindingDB_IC50",
    "cell_panel": "lung"
  }'
```

### Test DynamoDB locally

```bash
aws dynamodb list-tables \
  --endpoint-url http://localhost:8000 \
  --region us-east-1

aws dynamodb scan \
  --table-name prediction_jobs \
  --endpoint-url http://localhost:8000 \
  --region us-east-1
```

---

## Environment variables

### frontend/.env.local (local dev)

```bash
# DynamoDB — points at local container
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=fake
AWS_SECRET_ACCESS_KEY=fake
AWS_ENDPOINT_URL=http://localhost:8000
DYNAMODB_JOBS_TABLE=prediction_jobs
DYNAMODB_CACHE_TABLE=prediction_cache

# Lambda — points at local container
LAMBDA_ENDPOINT=http://localhost:9000/2015-03-31/functions/function/invocations
LAMBDA_MODE=local

# Auth (optional in dev)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-prod
```

### Vercel (production)

```bash
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<real IAM user key>
AWS_SECRET_ACCESS_KEY=<real IAM user secret>
DYNAMODB_JOBS_TABLE=prediction_jobs
DYNAMODB_CACHE_TABLE=prediction_cache
# No AWS_ENDPOINT_URL in production — SDK uses real AWS

LAMBDA_FUNCTION_NAME=receptormapper-predict
LAMBDA_MODE=aws
# Lambda uses IAM role — no keys needed in Lambda itself

NEXTAUTH_URL=https://receptormapper.vercel.app
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
```

---

## Key design decisions

**Why DynamoDB over Aurora PostgreSQL:**
All data access is key-value. Every query is get-by-job-id or get-by-cache-key.
No joins, no aggregations, no relational constraints. DynamoDB free tier covers
the entire hackathon with zero cost.

**Why Docker image over zip Lambda:**
DeepPurpose + PyTorch + RDKit exceeds the 250MB Lambda zip limit. Docker images
support up to 10GB. Model weights are baked into the image at build time — no
runtime download, no cold start penalty from fetching weights.

**Why model weights baked into image:**
Downloading 150–300MB of model weights on Lambda cold start would cause 30–60s
timeouts. Baking into the image means first invocation after container startup
only loads from local disk (~2s) not from network.

**Why cache before Lambda invocation:**
Lambda invocation costs money and takes 2–5s even when warm. The Next.js API
route checks DynamoDB cache first. If the same smiles+target+model was computed
before, the result is returned in <50ms with zero Lambda cost.

**Sync vs async triggering:**
Cache hits return synchronously from the Next.js API route.
Cache misses invoke Lambda asynchronously — frontend polls every 2s.
This avoids Vercel's 10s serverless function timeout for slow predictions.

**Module-per-concern in Lambda:**
Each prediction type is a separate Python module. This makes it easy to swap
models (e.g. replace binding.py with a better model) without touching other
modules. The assembler is the only file that knows about all outputs.

---

## Common tasks for Claude Code

```
"Add a new protein to the off-target panel"
→ Edit lambda/models/offtarget_panel/panel.json
  Add: { "name": "...", "family": "...", "sequence": "..." }

"Add a new cell line panel"
→ Edit lambda/cellline.py
  Add the line names to the PANELS dict

"Change the hERG risk threshold"
→ Edit lambda/offtarget.py _risk() function
  Currently: pic50 >= 5.5 = high, >= 4.5 = medium

"Add a new ADMET property"
→ Edit lambda/admet.py calculate() function
  Import the RDKit descriptor and add to return dict
  Add the field to the ADMETPanel.tsx component

"Rebuild Lambda after Python changes"
→ docker build -t receptormapper-lambda ./lambda
  docker stop $(docker ps -q --filter ancestor=receptormapper-lambda)
  docker run ... (same command as above)

"Reset local DynamoDB"
→ docker stop dynamo-local && docker rm dynamo-local
  docker run -d --name dynamo-local -p 8000:8000 amazon/dynamodb-local
  cd lambda && python scripts/create_tables.py

"Run only the frontend (no Lambda)"
→ Set LAMBDA_MODE=mock in .env.local
  The API route returns a fixture result instead of invoking Lambda
  Useful for pure UI work without running Docker
```

---

## Result schema (what Lambda returns)

```json
{
  "binding": {
    "pIC50": 6.2,
    "delta_g": -8.4,
    "ic50_nM": 630.0,
    "confidence": 0.81,
    "strength": "moderate"
  },
  "offtarget": [
    { "name": "hERG", "family": "Ion channel", "pic50": 4.1,
      "risk": "low", "flag": false },
    { "name": "CYP3A4", "family": "Cytochrome P450", "pic50": 3.8,
      "risk": "low", "flag": false }
  ],
  "cellline": [
    { "name": "A549", "ic50": 0.31 },
    { "name": "H1299", "ic50": 0.58 }
  ],
  "admet": {
    "mw": 151.2, "logP": 0.46, "hbd": 2, "hba": 2,
    "tpsa": 49.3, "rotatable_bonds": 2, "aromatic_rings": 1,
    "ro5_violations": 0, "drug_like": true
  },
  "tanimoto": {
    "max_tanimoto": 0.74, "mean_top10": 0.61,
    "adj_confidence": 0.90, "extrapolation_risk": false
  },
  "flags": [
    {
      "type": "cardiac",
      "level": "danger",
      "message": "hERG binding pIC50 5.8 — cardiac liability. Patch-clamp assay recommended."
    }
  ],
  "summary": {
    "total_flags": 1,
    "high_risk_ots": 1,
    "sensitive_lines": 4
  }
}
```

---

## Useful SMILES strings for testing

| Molecule | SMILES | Expected behaviour |
|---|---|---|
| Paracetamol | `CC(=O)Nc1ccc(O)cc1` | Moderate binder, drug-like, low flags |
| Erlotinib | `C#Cc1cccc(Nc2ncnc3cc(OCC)c(OCC)cc23)c1` | Strong EGFR binder |
| Imatinib | `Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1` | Strong ABL1 binder |
| Colchicine | `COc1cc2c(c(OC)c1OC)-c1ccc(OC)c(=O)cc1CC2NC(C)=O` | High affinity, hERG flag |
| Aspirin | `CC(=O)Oc1ccccc1C(=O)O` | Weak binder, drug-like |

---

## Hackathon submission checklist

- [ ] Lambda builds without errors: `docker build -t receptormapper-lambda ./lambda`
- [ ] Local end-to-end works: submit SMILES → get result in browser
- [ ] Cache works: second submission of same input returns instantly
- [ ] Vercel deployment live: `vercel --prod`
- [ ] Lambda deployed to ECR and AWS Lambda
- [ ] DynamoDB tables created in production AWS account
- [ ] 5 demo inputs pre-seeded in production cache
- [ ] README.md written with architecture diagram link
- [ ] Demo video recorded (2 minutes max)
