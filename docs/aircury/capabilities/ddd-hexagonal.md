# DDD+Hexagonal Capability

> This file is maintained by Aircury AI Framework. Do not edit it directly. Add project-specific rules in FRAMEWORK.local.md.

DDD+Hexagonal standards with curated architecture skills

## Framework Rules

## Non-Negotiable Architecture Rules

### 1. Dependency Rule

Dependencies must point inward only:

`infrastructure -> application -> domain`

Never invert this rule.

Forbidden examples:

- Domain code importing HTTP, ORM, UI, framework, or external SDK libraries.
- Controllers, routes, handlers, or UI components calling repositories directly.
- Infrastructure types leaking into domain entities or use cases.

Required approach:

- Domain contains business rules, invariants, entities, value objects, domain services, and domain events.
- Application contains use cases, commands/queries, orchestration, and ports.
- Infrastructure contains adapters for persistence, HTTP, auth providers, email, external APIs, and framework glue.

### 2. Hexagonal Ports and Adapters

Every external dependency must sit behind a port when it affects business behaviour.

Examples:

- Persistence adapters implement repository ports.
- Email delivery implements a notification or mailer port.
- Auth providers implement authentication ports.
- UI and HTTP handlers act as driving adapters and call use cases.

Framework code is an adapter, never the core.

### 3. DDD Boundaries

Model behaviour, not tables or screens.

- Prefer aggregate-focused design over CRUD-first design.
- Use entities when identity matters.
- Use value objects when equality is structural and data must remain valid and immutable.
- Repositories are per aggregate root, not per table.
- Cross-context communication should happen through explicit application services or domain events, not hidden imports.

## Domain Modelling Rules

- Entities own behaviour and protect invariants.
- Value objects must be validated at creation time.
- Domain services are allowed only when behaviour does not naturally belong to an entity or value object.
- Application services orchestrate; they do not contain core business policy when that policy belongs in the domain.
- Domain events should use past-tense names and represent facts that already happened.

Anemic domain models are not acceptable unless the problem is truly trivial.

## Agent Operating Rules

- Dependencies flow inward only: `infrastructure -> application -> domain`. Never invert.

- Keep domain modelling concerns explicit and avoid leaking infrastructure into core business logic.
