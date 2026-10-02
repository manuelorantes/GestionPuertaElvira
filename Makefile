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
PHP := $(COMPOSE) exec $(TTY) php-fpm
NODE := $(COMPOSE) run --rm --no-deps $(TTY) vite
PHP_TEST := $(PHP) env APP_ENV=test APP_DEBUG=0
E2E_BASE_URL ?= http://nginx

##@ Entorno

.PHONY: help
help: ## Muestra esta ayuda
	@awk 'BEGIN {FS = ":.*## "; printf "Uso: make \033[36m<objetivo>\033[0m [ARGS=...]\n"} \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } \
		/^[a-zA-Z0-9_-]+:.*## / { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: init
init: build deps up db-init hooks ## Prepara el proyecto desde cero (primera vez)
	@echo "\nListo: http://localhost:$${APP_PORT:-8080}"

.PHONY: build
build: ## Construye las imágenes
	$(COMPOSE) build

.PHONY: wait
wait: ## Espera a que la API responda a través de nginx
	@for i in $$(seq 1 60); do \
		curl -fsS -o /dev/null http://localhost:$${APP_PORT:-8080}/api/health && exit 0; sleep 2; \
	done; echo "La API no responde" >&2; exit 1

.PHONY: up
up: ## Arranca el entorno
	$(COMPOSE) up -d --wait php-fpm postgres
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
sh: ## Shell en un contenedor (SVC=php-fpm por defecto)
	$(COMPOSE) exec $(or $(SVC),php-fpm) sh

##@ Dependencias y herramientas

.PHONY: deps
deps: ## Instala las dependencias de API, web y repositorio
	$(COMPOSE) run --rm --no-deps php-fpm composer install --no-interaction
	$(NODE) npm ci --no-audit --no-fund
	$(COMPOSE) run --rm --no-deps -w /app $(TTY) vite npm ci --no-audit --no-fund

.PHONY: composer
composer: ## Ejecuta composer (ARGS="require foo/bar")
	$(PHP) composer $(ARGS)

.PHONY: console
console: ## Ejecuta bin/console (ARGS="debug:router")
	$(PHP) bin/console $(ARGS)

.PHONY: npm
npm: ## Ejecuta npm en la web (ARGS="install foo")
	$(NODE) npm $(ARGS)

.PHONY: hooks
hooks: ## Instala los hooks de git (Lefthook)
	@# Excepción a «nada en el host»: git ejecuta los hooks en el host, así que Lefthook
	@# (binario estático instalado por npm en node_modules) también se registra desde aquí.
	./node_modules/.bin/lefthook install

##@ Base de datos

.PHONY: db-init
db-init: ## Crea las bases de datos (desarrollo y test) y aplica las migraciones
	$(PHP) bin/console doctrine:database:create --if-not-exists -n
	$(PHP) bin/console doctrine:migrations:migrate --allow-no-migration -n
	$(PHP_TEST) bin/console doctrine:database:create --if-not-exists -n
	$(PHP_TEST) bin/console doctrine:migrations:migrate --allow-no-migration -n

.PHONY: migrate
migrate: ## Aplica las migraciones pendientes
	$(PHP) bin/console doctrine:migrations:migrate --allow-no-migration -n
	$(PHP_TEST) bin/console doctrine:migrations:migrate --allow-no-migration -n

.PHONY: migration
migration: ## Genera una migración a partir de los modelos de Doctrine
	$(PHP) bin/console doctrine:migrations:diff -n

.PHONY: db-reset
db-reset: ## Recrea la base de datos de desarrollo
	$(PHP) bin/console doctrine:database:drop --force --if-exists -n
	$(MAKE) db-init

##@ Calidad

.PHONY: test
test: test-api test-web ## Todos los tests (sin e2e)

.PHONY: test-api
test-api: ## Tests de la API (ARGS="--testsuite domain")
	$(PHP_TEST) vendor/bin/phpunit $(ARGS)

.PHONY: test-web
test-web: ## Tests de la web (ARGS="src/pages")
	$(NODE) npm run test -- $(ARGS)

.PHONY: coverage
coverage: coverage-api coverage-web ## Tests con cobertura y umbral mínimo (75 %)

.PHONY: coverage-api
coverage-api: ## Tests de la API con cobertura (mínimo 75 % de líneas)
	$(PHP_TEST) vendor/bin/phpunit --coverage-text --coverage-clover=var/coverage/clover.xml
	$(PHP) php bin/coverage-check.php var/coverage/clover.xml 75

.PHONY: coverage-web
coverage-web: ## Tests de la web con cobertura (mínimo 75 %)
	$(NODE) npm run test:coverage

.PHONY: e2e
e2e: ## Tests de extremo a extremo con Playwright contra el entorno levantado
	$(COMPOSE) run --rm $(TTY) -e E2E_BASE_URL=$(E2E_BASE_URL) e2e

.PHONY: lint
lint: lint-api lint-web ## Todas las comprobaciones estáticas

.PHONY: lint-api
lint-api: ## PHP-CS-Fixer (dry-run), PHPStan, Deptrac, contenedor y esquema
	$(PHP) vendor/bin/php-cs-fixer fix --dry-run --diff
	$(PHP) bin/console lint:container
	$(PHP) vendor/bin/phpstan analyse --no-progress
	$(PHP) vendor/bin/deptrac analyse --no-progress --report-uncovered
	$(PHP) bin/console doctrine:schema:validate --skip-sync
	$(PHP) bin/console doctrine:migrations:up-to-date

.PHONY: lint-web
lint-web: ## ESLint, Prettier, TypeScript y knip
	$(NODE) npm run lint
	$(NODE) npm run format:check
	$(NODE) npm run typecheck
	$(NODE) npm run knip

.PHONY: fix
fix: ## Aplica los formateadores (PHP-CS-Fixer, ESLint --fix, Prettier)
	$(PHP) vendor/bin/php-cs-fixer fix
	$(NODE) npm run lint -- --fix
	$(NODE) npm run format

.PHONY: audit
audit: audit-api audit-web ## Vulnerabilidades conocidas en dependencias

.PHONY: audit-api
audit-api:
	$(PHP) composer audit

.PHONY: audit-web
audit-web:
	$(NODE) npm audit --audit-level=high --omit=dev

.PHONY: build-web
build-web: ## Compila la web para producción
	$(NODE) npm run build

.PHONY: ci
ci: lint coverage audit build-web e2e ## Lo mismo que GitHub Actions
