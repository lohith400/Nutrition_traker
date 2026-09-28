.PHONY: help up down logs test lint build clean

# Default target
.DEFAULT_GOAL := help

help: ## Show available Makefile targets
	@echo "NutriSync Development & Deployment Tasks"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

up: ## Start containers in detached mode
	docker compose up -d

down: ## Stop and remove containers and network
	docker compose down

logs: ## Tail container logs
	docker compose logs -f

build: ## Build both backend and frontend container images
	docker compose build

test: ## Run smoke tests locally using pytest
	pytest -v tests/test_smoke.py

lint: ## Run ruff linter on Python code
	ruff check .

clean: ## Stop containers and remove volumes, local caches, and build artifacts
	docker compose down -v
	rm -rf .pytest_cache .ruff_cache frontend/.next
