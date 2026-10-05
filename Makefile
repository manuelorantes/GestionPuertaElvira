# Gestión Puerta Elvira — punto de entrada único para el desarrollo.
# Todo se ejecuta dentro de Docker (ver specs/decisions/desarrollo-dockerizado-con-make.md).
# Lista de objetivos: make help

.DEFAULT_GOAL := help
SHELL := /bin/sh

HOST_UID ?= $(shell id -u)
HOST_GID ?= $(shell id -g)
export HOST_UID HOST_GID

COMPOSE := docker compose
TTY := $(shell if [ -t 0 ] && [ -t 1 ]; then echo ""; else echo "-T"; fi)
DENO := $(COMPOSE) run --rm --no-deps $(TTY) api deno
NODE := $(COMPOSE) run --rm --no-deps $(TTY) vite
PSQL := $(COMPOSE) exec $(TTY) postgres psql -U club -d postgres
E2E_BASE_URL ?= http://nginx

##@ Entorno

.PHONY: help
help: ## Muestra esta ayuda
	@awk 'BEGIN {FS = ":.*## "; printf "Uso: make \033[36m<objetivo>\033[0m [ARGS=...]\n"} \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } \
		/^[a-zA-Z0-9_-]+:.*## / { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: init
init: deps up db-init seed hooks ## Prepara el proyecto desde cero (primera vez)
	@echo "\nListo: http://localhost:$${APP_PORT:-8080}"

.PHONY: wait
wait: ## Espera a que la API responda a través de nginx
	@for i in $$(seq 1 60); do \
		curl -fsS -o /dev/null http://localhost:$${APP_PORT:-8080}/api/health && exit 0; sleep 2; \
	done; echo "La API no responde" >&2; exit 1

.PHONY: up
up: ## Arranca el entorno
	$(COMPOSE) up -d --wait postgres
	$(COMPOSE) up -d

.PHONY: down
down: ## Para el entorno
	$(COMPOSE) down

.PHONY: destroy
destroy: ## Para el entorno y borra los volúmenes (¡borra la base de datos local!)
	$(COMPOSE) down -v --remove-orphans

.PHONY: ps
ps: ## Estado de los contenedores
	$(COMPOSE) ps

.PHONY: logs
logs: ## Logs en vivo (ARGS=servicio para filtrar)
	$(COMPOSE) logs -f $(ARGS)

.PHONY: sh
sh: ## Shell en un contenedor (SVC=api por defecto)
	$(COMPOSE) exec $(or $(SVC),api) sh

##@ Dependencias y herramientas

.PHONY: deps
deps: ## Instala las dependencias de API, web y repositorio
	$(DENO) install
	$(NODE) npm ci --no-audit --no-fund
	$(COMPOSE) run --rm --no-deps -w /app $(TTY) vite npm ci --no-audit --no-fund

.PHONY: npm
npm: ## Ejecuta npm en la web (ARGS="install foo")
	$(NODE) npm $(ARGS)

.PHONY: hooks
hooks: ## Instala los hooks de git (Lefthook)
	@# Excepción a «nada en el host»: git ejecuta los hooks en el host, así que Lefthook
	@# (binario estático instalado por npm en node_modules) también se registra desde aquí.
	./node_modules/.bin/lefthook install

.PHONY: sync-staging
sync-staging: ## Tras una release: rebasa staging sobre main y lo sube (force-push)
	@# Excepción a «nada en el host»: es una operación de git sobre el repositorio.
	@test -z "$$(git status --porcelain)" || (echo "Hay cambios sin commitear: guárdalos antes" >&2; exit 1)
	git fetch origin main staging
	git switch -C staging origin/staging
	git rebase origin/main
	git push --force-with-lease=staging:origin/staging origin staging
	git switch -

##@ Base de datos

.PHONY: db-init
db-init: migrate ## Crea las bases de datos (desarrollo y test) y aplica las migraciones

.PHONY: migrate
migrate: ## Aplica las migraciones pendientes de supabase/migrations (desarrollo y test)
	$(DENO) task migrate
	$(DENO) task migrate --test

.PHONY: migration
migration: ## Crea una migración SQL vacía: ARGS=nombre_en_snake_case
	@test -n "$(ARGS)" || (echo "Falta el nombre: make migration ARGS=nombre" >&2; exit 1)
	@f=supabase/migrations/$$(date -u +%Y%m%d%H%M%S)_$(ARGS).sql; printf -- "-- $(ARGS)\n" > $$f; echo $$f

.PHONY: db-reset
db-reset: ## Recrea la base de datos de desarrollo
	$(PSQL) -c 'DROP DATABASE IF EXISTS club WITH (FORCE)'
	$(MAKE) db-init

.PHONY: seed
seed: ## Datos de desarrollo: usuarios de prueba (contraseñas conocidas) y demostración del diseño
	$(DENO) task console app:dev:seed-users
	$(DENO) task console app:dev:seed-demo

##@ Cuentas de usuario (ver supabase/functions/api/scripts/console.ts)

.PHONY: console
console: ## Consola de la API: ARGS="app:billing:generate-charges --month=2026-10"
	$(DENO) task console $(ARGS)

.PHONY: user-create
user-create: ## Alta de cuenta: ARGS="email@club.es 'Nombre Apellidos' superadministrator|administrator|teacher"
	$(DENO) task console app:user:create $(ARGS)

.PHONY: user-disable
user-disable: ## Desactiva una cuenta y cierra sus sesiones: ARGS="email@club.es"
	$(DENO) task console app:user:disable $(ARGS)

.PHONY: user-enable
user-enable: ## Reactiva una cuenta: ARGS="email@club.es"
	$(DENO) task console app:user:enable $(ARGS)

.PHONY: user-role
user-role: ## Cambia el rol: ARGS="email@club.es administrator|teacher"
	$(DENO) task console app:user:role $(ARGS)

.PHONY: user-reset-password
user-reset-password: ## Contraseña temporal nueva: ARGS="email@club.es"
	$(DENO) task console app:user:reset-password $(ARGS)

##@ Calidad

.PHONY: test
test: test-api test-web ## Todos los tests (sin e2e)

.PHONY: test-api
test-api: ## Tests de la API (ARGS="tests/domain")
	$(DENO) task test $(ARGS)

.PHONY: test-web
test-web: ## Tests de la web (ARGS="src/pages")
	$(NODE) npm run test -- $(ARGS)

.PHONY: coverage
coverage: coverage-api coverage-web ## Tests con cobertura y umbral mínimo (75 %)

.PHONY: coverage-api
coverage-api: ## Tests de la API con cobertura (mínimo 75 % de líneas)
	$(DENO) task coverage
	$(DENO) run --allow-read scripts/coverage-check.ts .coverage/lcov.info 75

.PHONY: coverage-web
coverage-web: ## Tests de la web con cobertura (mínimo 75 %)
	$(NODE) npm run test:coverage

.PHONY: e2e
e2e: seed ## Tests de extremo a extremo con Playwright (¡reinicia alumnos, grupos y profesores locales!)
	$(DENO) task console app:dev:seed-demo --reset
	$(COMPOSE) run --rm $(TTY) -e E2E_BASE_URL=$(E2E_BASE_URL) e2e

.PHONY: lint
lint: lint-api lint-web ## Todas las comprobaciones estáticas

.PHONY: lint-api
lint-api: ## deno fmt (comprobación), deno lint y deno check de la API
	$(DENO) task check

.PHONY: lint-web
lint-web: ## ESLint, Prettier, TypeScript y knip
	$(NODE) npm run lint
	$(NODE) npm run format:check
	$(NODE) npm run typecheck
	$(NODE) npm run knip

.PHONY: fix
fix: ## Aplica los formateadores (deno fmt, deno lint --fix, ESLint --fix, Prettier)
	$(DENO) task fix
	$(NODE) npm run lint -- --fix
	$(NODE) npm run format

.PHONY: audit
audit: audit-web ## Vulnerabilidades conocidas en dependencias

.PHONY: audit-web
audit-web:
	$(NODE) npm audit --audit-level=high --omit=dev

.PHONY: build-web
build-web: ## Compila la web para producción
	$(NODE) npm run build

.PHONY: ci
ci: lint coverage audit build-web e2e ## Lo mismo que GitHub Actions
