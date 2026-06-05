API_IMAGE        := receptormapper-api
FRONTEND_IMAGE   := receptormapper-frontend
DYNAMO_PORT      := 8000
API_PORT         := 8080
PROD_API_PORT    := 443
FRONTEND_PORT    := 3000

DEV_COMPOSE      := docker-compose.dev.yml
PROD_COMPOSE     := docker-compose.prod.yml

# ── Dev (local, all services + DynamoDB local) ────────────────────────────────

.PHONY: up
up:
	docker compose -f $(DEV_COMPOSE) up --build

.PHONY: up-d
up-d:
	docker compose -f $(DEV_COMPOSE) up --build -d

.PHONY: down
down:
	docker compose -f $(DEV_COMPOSE) down

.PHONY: restart-api
restart-api:
	docker compose -f $(DEV_COMPOSE) restart api

.PHONY: restart-frontend
restart-frontend:
	docker compose -f $(DEV_COMPOSE) restart frontend

# ── Production (EC2: API + Nginx only, real AWS DynamoDB) ─────────────────────
# Prerequisites:
#   1. Copy .env.prod.example to .env.prod and fill AWS_REGION
#   2. Place SSL certs at nginx/ssl/cert.pem and nginx/ssl/key.pem
#   3. Ensure EC2 instance has IAM role with DynamoDB access

.PHONY: prod-api
prod-api:
	docker compose -f $(PROD_COMPOSE) up --build -d
	@echo ""
	@echo "Production API running."
	@echo "  HTTPS : https://localhost"
	@echo "  Docs  : https://localhost/docs"
	@echo "  Logs  : make prod-logs"

.PHONY: prod-down
prod-down:
	docker compose -f $(PROD_COMPOSE) down

.PHONY: prod-restart
prod-restart:
	docker compose -f $(PROD_COMPOSE) restart api

# ── Logs ─────────────────────────────────────────────────────────────────────

.PHONY: logs
logs:
	docker compose -f $(DEV_COMPOSE) logs -f

.PHONY: logs-api
logs-api:
	docker compose -f $(DEV_COMPOSE) logs -f api

.PHONY: logs-frontend
logs-frontend:
	docker compose -f $(DEV_COMPOSE) logs -f frontend

.PHONY: prod-logs
prod-logs:
	docker compose -f $(PROD_COMPOSE) logs -f

.PHONY: prod-logs-api
prod-logs-api:
	docker compose -f $(PROD_COMPOSE) logs -f api

.PHONY: prod-logs-nginx
prod-logs-nginx:
	docker compose -f $(PROD_COMPOSE) logs -f nginx

# ── Build (standalone images) ─────────────────────────────────────────────────

.PHONY: build-api
build-api:
	docker build -t $(API_IMAGE) ./lambda

.PHONY: build-frontend
build-frontend:
	docker build -t $(FRONTEND_IMAGE) ./frontend

.PHONY: build
build: build-api build-frontend

# ── Frontend ──────────────────────────────────────────────────────────────────

.PHONY: install
install:
	cd frontend && npm install

.PHONY: dev-frontend
dev-frontend:
	cd frontend && npm run dev

.PHONY: frontend-build
frontend-build:
	cd frontend && npm run build

# ── Smoke tests (dev — API on port 8080) ─────────────────────────────────────

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

# ── DynamoDB inspection (dev only) ───────────────────────────────────────────

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

# ── SSL helpers ───────────────────────────────────────────────────────────────

.PHONY: ssl-self-signed
ssl-self-signed:
	openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
	  -keyout nginx/ssl/key.pem \
	  -out nginx/ssl/cert.pem \
	  -subj "/CN=receptormapper"
	@echo "Self-signed cert written to nginx/ssl/"

# ── Cleanup ───────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	docker compose -f $(DEV_COMPOSE) down --rmi local --volumes 2>/dev/null || true
	docker compose -f $(PROD_COMPOSE) down --rmi local --volumes 2>/dev/null || true
	rm -rf frontend/.next frontend/node_modules
