API_IMAGE        := receptormapper-api
FRONTEND_IMAGE   := receptormapper-frontend
DYNAMO_PORT      := 8000
API_PORT         := 8080
FRONTEND_PORT    := 3000

# ── Docker Compose ────────────────────────────────────────────────────────────

.PHONY: up
up:
	docker compose up --build

.PHONY: up-d
up-d:
	docker compose up --build -d

.PHONY: down
down:
	docker compose down

.PHONY: restart-api
restart-api:
	docker compose restart api

.PHONY: restart-frontend
restart-frontend:
	docker compose restart frontend

# ── Logs ─────────────────────────────────────────────────────────────────────

.PHONY: logs
logs:
	docker compose logs -f

.PHONY: logs-api
logs-api:
	docker compose logs -f api

.PHONY: logs-frontend
logs-frontend:
	docker compose logs -f frontend

# ── Build (standalone images) ─────────────────────────────────────────────────

.PHONY: build-api
build-api:
	docker build -t $(API_IMAGE) ./lambda

.PHONY: build-frontend
build-frontend:
	docker build -t $(FRONTEND_IMAGE) ./frontend

.PHONY: build
build: build-api build-frontend

# ── Standalone API run (without docker compose) ───────────────────────────────

.PHONY: api-run
api-run:
	docker run --rm -p $(API_PORT):8000 \
	  -e AWS_REGION=us-east-1 \
	  -e AWS_ACCESS_KEY_ID=fake \
	  -e AWS_SECRET_ACCESS_KEY=fake \
	  -e AWS_ENDPOINT_URL=http://host.docker.internal:$(DYNAMO_PORT) \
	  -e DYNAMODB_CACHE_TABLE=prediction_cache \
	  -e DYNAMODB_JOBS_TABLE=prediction_jobs \
	  $(API_IMAGE)

# ── Frontend ──────────────────────────────────────────────────────────────────

.PHONY: install
install:
	cd frontend && npm install

.PHONY: dev
dev:
	cd frontend && npm run dev

.PHONY: frontend-build
frontend-build:
	cd frontend && npm run build

# ── Smoke tests ───────────────────────────────────────────────────────────────

.PHONY: test-health
test-health:
	curl -s http://localhost:$(API_PORT)/health | python3 -m json.tool

.PHONY: test-api
test-api:
	curl -s -X POST http://localhost:$(API_PORT)/predict \
	  -H 'Content-Type: application/json' \
	  -d '{ \
	    "job_id": "test-001", \
	    "smiles": "CC(=O)Nc1ccc(O)cc1", \
	    "target_sequence": "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNN", \
	    "model": "MPNN_CNN_BindingDB_IC50", \
	    "cell_panel": "lung" \
	  }' | python3 -m json.tool

.PHONY: test-erlotinib
test-erlotinib:
	curl -s -X POST http://localhost:$(API_PORT)/predict \
	  -H 'Content-Type: application/json' \
	  -d '{ \
	    "job_id": "test-erlotinib", \
	    "smiles": "C#Cc1cccc(Nc2ncnc3cc(OCC)c(OCC)cc23)c1", \
	    "target_sequence": "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNN", \
	    "model": "MPNN_CNN_BindingDB_IC50", \
	    "cell_panel": "lung" \
	  }' | python3 -m json.tool

.PHONY: test-tdc
test-tdc:
	curl -s -X POST http://localhost:$(API_PORT)/predict \
	  -H 'Content-Type: application/json' \
	  -d '{ \
	    "job_id": "test-tdc-001", \
	    "smiles": "CC(=O)Nc1ccc(O)cc1", \
	    "target_sequence": "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNN", \
	    "model": "TDC_DeepDTA_DAVIS", \
	    "cell_panel": "lung" \
	  }' | python3 -m json.tool

# ── DynamoDB inspection ───────────────────────────────────────────────────────

.PHONY: list-tables
list-tables:
	aws dynamodb list-tables \
	  --endpoint-url http://localhost:$(DYNAMO_PORT) \
	  --region us-east-1

.PHONY: scan-jobs
scan-jobs:
	aws dynamodb scan \
	  --table-name prediction_jobs \
	  --endpoint-url http://localhost:$(DYNAMO_PORT) \
	  --region us-east-1

.PHONY: scan-cache
scan-cache:
	aws dynamodb scan \
	  --table-name prediction_cache \
	  --endpoint-url http://localhost:$(DYNAMO_PORT) \
	  --region us-east-1

# ── Cleanup ───────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	docker compose down --rmi local --volumes 2>/dev/null || true
	rm -rf frontend/.next frontend/node_modules
