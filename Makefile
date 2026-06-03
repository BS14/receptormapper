LAMBDA_IMAGE     := receptormapper-lambda
DYNAMO_CONTAINER := dynamo-local
DYNAMO_PORT      := 8000
LAMBDA_PORT      := 9000

# ── Docker Compose (recommended for local dev) ────────────────────────────────

.PHONY: up
up:
	docker compose up --build

.PHONY: up-detached
up-detached:
	docker compose up --build -d

.PHONY: down
down:
	docker compose down

.PHONY: logs
logs:
	docker compose logs -f

.PHONY: restart-lambda
restart-lambda:
	docker compose restart lambda

# ── Build (standalone Lambda image) ───────────────────────────────────────────

.PHONY: build
build:
	docker build -t $(LAMBDA_IMAGE) ./lambda

# ── Local DynamoDB ────────────────────────────────────────────────────────────

.PHONY: dynamo-start
dynamo-start:
	@docker start $(DYNAMO_CONTAINER) 2>/dev/null || \
	  docker run -d --name $(DYNAMO_CONTAINER) \
	    -p $(DYNAMO_PORT):8000 amazon/dynamodb-local
	@echo "DynamoDB running on port $(DYNAMO_PORT)"

.PHONY: dynamo-stop
dynamo-stop:
	docker stop $(DYNAMO_CONTAINER) 2>/dev/null || true

.PHONY: dynamo-reset
dynamo-reset: dynamo-stop
	docker rm $(DYNAMO_CONTAINER) 2>/dev/null || true
	$(MAKE) dynamo-start create-tables

# ── DynamoDB tables ───────────────────────────────────────────────────────────

.PHONY: create-tables
create-tables:
	cd lambda && \
	  AWS_ENDPOINT_URL=http://localhost:$(DYNAMO_PORT) \
	  AWS_ACCESS_KEY_ID=fake \
	  AWS_SECRET_ACCESS_KEY=fake \
	  python scripts/create_tables.py

.PHONY: seed-cache
seed-cache:
	cd lambda && \
	  AWS_ENDPOINT_URL=http://localhost:$(DYNAMO_PORT) \
	  AWS_ACCESS_KEY_ID=fake \
	  AWS_SECRET_ACCESS_KEY=fake \
	  python scripts/seed_cache.py

# ── Lambda container ──────────────────────────────────────────────────────────

.PHONY: lambda-run
lambda-run:
	docker run --rm -p $(LAMBDA_PORT):8080 \
	  -e AWS_REGION=us-east-1 \
	  -e AWS_ACCESS_KEY_ID=fake \
	  -e AWS_SECRET_ACCESS_KEY=fake \
	  -e AWS_ENDPOINT_URL=http://host.docker.internal:$(DYNAMO_PORT) \
	  -e DYNAMODB_CACHE_TABLE=prediction_cache \
	  -e DYNAMODB_JOBS_TABLE=prediction_jobs \
	  $(LAMBDA_IMAGE)

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

# ── Testing ───────────────────────────────────────────────────────────────────

.PHONY: test-lambda
test-lambda:
	curl -s -X POST http://localhost:$(LAMBDA_PORT)/2015-03-31/functions/function/invocations \
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
	curl -s -X POST http://localhost:$(LAMBDA_PORT)/2015-03-31/functions/function/invocations \
	  -H 'Content-Type: application/json' \
	  -d '{ \
	    "job_id": "test-erlotinib", \
	    "smiles": "C#Cc1cccc(Nc2ncnc3cc(OCC)c(OCC)cc23)c1", \
	    "target_sequence": "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNN", \
	    "model": "MPNN_CNN_BindingDB_IC50", \
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

# ── Full local setup (run once) ───────────────────────────────────────────────

.PHONY: setup
setup: install dynamo-start create-tables seed-cache
	@echo ""
	@echo "Setup complete. Next steps:"
	@echo "  1. make build            — build Lambda Docker image"
	@echo "  2. make lambda-run       — start Lambda container (new terminal)"
	@echo "  3. make dev              — start Next.js frontend (new terminal)"
	@echo "  4. open http://localhost:3000"

# ── Cleanup ───────────────────────────────────────────────────────────────────

.PHONY: clean
clean: dynamo-stop
	docker rm $(DYNAMO_CONTAINER) 2>/dev/null || true
	docker rmi $(LAMBDA_IMAGE) 2>/dev/null || true
	rm -rf frontend/.next frontend/node_modules
