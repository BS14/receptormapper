PROD_COMPOSE := docker-compose.prod.yml

# ── Local development (docker-compose.yml) ────────────────────────────────────

.PHONY: dev
dev:
	docker compose up --build

.PHONY: dev-down
dev-down:
	docker compose down

.PHONY: dev-logs
dev-logs:
	docker compose logs -f

# ── Production (docker-compose.prod.yml) ──────────────────────────────────────

.PHONY: prod
prod:
	docker compose -f $(PROD_COMPOSE) up --build -d

.PHONY: prod-down
prod-down:
	docker compose -f $(PROD_COMPOSE) down

.PHONY: prod-logs
prod-logs:
	docker compose -f $(PROD_COMPOSE) logs -f
