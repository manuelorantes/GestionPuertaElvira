# FRAMEWORK.md

> This file is maintained by Aircury AI Framework. Do not edit it directly. Add project-specific rules in FRAMEWORK.local.md.

## Purpose

This framework defines the core workflow, specification, and agent-routing rules for repositories that adopt it.

Optional standards are composed at install time so teams can keep the shared delivery model while choosing the engineering standards they actually want enforced.

When tradeoffs appear, prefer maintainability, correctness, and explicit intent over hidden conventions or tool-driven shortcuts.

## Project-Specific Instructions

Use `FRAMEWORK.local.md` as the official repository-local companion file for project-specific instructions, additions, and overrides. Install and update operations do not manage or overwrite that file.

## Core Workflow Constitution

The following rules apply to every installation profile:

- `specs/features/` is canonical and versioned.
- `specs/changes/` is optional working state and is not versioned.
- Any workflow mode that changes observable system behaviour MUST end with an update to `specs/features/`.
- Prepare working tree changes as atomic, functional, and semantic units. Create git commits only when the user explicitly asks, using [Conventional Commits](https://www.conventionalcommits.org/) format.
- Before starting any non-trivial change, the agent MUST act as a routing meta-agent and ask the user how to proceed.
- Optional standards are enabled through `.aircury/framework.config.json`.

## Engineering Non-Negotiables

These rules apply to every installation profile, regardless of selected capabilities:

- TDD is the default implementation discipline when automated testing is feasible: write or update a failing test for one observable behaviour, make it pass with the smallest correct change, then refactor while keeping tests green.
- Do not bypass TDD for bugs, business logic, regressions, contracts, or high-risk behaviour unless the user explicitly accepts that automated coverage is not feasible.
- SOLID principles are mandatory design constraints: keep responsibilities focused, dependencies explicit and substitutable, interfaces narrow, and high-level policy independent from low-level details.
- Clean Code is mandatory: use intention-revealing names, simple control flow, cohesive functions, clear errors, and code that can be reviewed without decoding hidden conventions.
- Architecture boundaries must remain explicit. UI, transport, persistence, framework, and vendor details must not leak into core business rules.
- Prefer the simplest design that preserves correctness and future change. Do not add speculative abstractions, dead code, broad public APIs, or clever indirection.
- Any exception to these rules must be called out with the tradeoff and verification that makes the exception safe.

## Installed Capabilities

- `spec-kit` — Formal specification workflow for feature definition and delivery
- `git` — Focused git workflow helpers for atomic commits
- `ddd-hexagonal` — DDD+Hexagonal standards with curated architecture skills See [`docs/aircury/capabilities/ddd-hexagonal.md`](./docs/aircury/capabilities/ddd-hexagonal.md).
- `decision-records` — Requires agents to capture material architectural and workflow decisions in ADRs under specs/decisions/. See [`docs/aircury/capabilities/decision-records.md`](./docs/aircury/capabilities/decision-records.md).
- `testing` — Testing standards plus curated Playwright and E2E testing skills See [`docs/aircury/capabilities/testing.md`](./docs/aircury/capabilities/testing.md).
- `code-style` — Automatically detects and follows project-specific linting and parsing rules by analysing package.json and config files. See [`docs/aircury/capabilities/code-style.md`](./docs/aircury/capabilities/code-style.md).
- `frontend` — Frontend standards with a self-contained UI workflow skill See [`docs/aircury/capabilities/frontend.md`](./docs/aircury/capabilities/frontend.md).
- `resilience` — Error-handling and structured-logging standards with curated resilience skills See [`docs/aircury/capabilities/resilience.md`](./docs/aircury/capabilities/resilience.md).
- `specs` — Skills for extracting authoritative specs and designing re-implementations from them
- `language` — British business English guidance for project communication
- `ask-question` — Requires agents to use the IDE AskQuestion tool when asking the user to choose between options

Detailed capability rules are generated as separate files under [`docs/aircury/capabilities/`](./docs/aircury/capabilities/). `FRAMEWORK.md` remains the governing entrypoint; linked capability docs define the detailed standards for enabled capabilities.

## Coding Standards

- Use British English spelling in documentation, specs, commit messages, skill text, and user-facing copy.
- Prefer British English identifiers and names when introducing new code, unless an external API, tool, or established project interface requires a different spelling.
- Order date entry controls Day-before-Month in UI: date pickers, recurrence editors, and numeric day/month selectors. Expose date entry through a shared date primitive with this order built in; do not hand-roll date control ordering per screen.
- Use explicit names that reflect the problem space.
- Keep functions small, cohesive, and intention-revealing.
- Prefer immutable data and side-effect isolation.
- Fail with clear errors and documented tradeoffs.
- Avoid boolean flag arguments when a richer type or explicit method is clearer.
- Prefer composition over inheritance.
- Keep modules deep: small public surface, meaningful internal behaviour.
- Remove dead code and speculative abstractions.

## Change Workflow

For any non-trivial change:

1. Identify the affected capability and observable behaviour.
2. Define or confirm the public behaviour.
3. Choose the workflow mode with the user through meta-agent routing.
4. Implement inside the selected standards profile.
5. Follow the engineering non-negotiables: TDD where feasible, SOLID design, Clean Code, and explicit boundaries.
6. Refactor for clarity and boundary enforcement.
7. Run relevant verification, then broader checks.
8. Prepare atomic working tree changes and summarise what is ready for review.

## Agent Operating Rules

Before starting any task:

- Read `FRAMEWORK.md` in full if you have not already done so in this session.
- Read `FRAMEWORK.local.md` when it exists and apply its project-specific instructions alongside this framework.
- Read the relevant specs in `specs/features/` that relate to the area you are changing.
- Read the linked capability docs in `docs/aircury/capabilities/` for the enabled standards that apply to your task.
- Read the relevant ADRs in `specs/decisions/` when the area is governed by prior decisions.
- Analyse `package.json` and local config files to identify the project's linting and formatting strategy.
- Act as a routing meta-agent: analyse the request, recommend a workflow mode, and ask the user how they want to proceed before implementing anything. Follow the routing protocol defined in `FRAMEWORK.md § Meta-agent routing`.

While executing work:

- Use British English spelling in documentation, specs, commit messages, skill text, and user-facing copy unless an external interface requires a different spelling.
- Order date entry controls Day-before-Month in any UI you generate or modify, preferably via the project's shared date primitive.
- All observable behaviour changes MUST update `specs/features/` before the work is done.
- Follow TDD for observable behaviour changes when automated testing is feasible: failing test, minimum implementation, refactor.
- Preserve SOLID design, Clean Code, and explicit architecture boundaries in every change.
- Use the `commit-changes` skill only when the user asks you to create commits. When committing, organise changes into atomic Conventional Commits; until then, keep changes organised in the working tree for review.
- After the user selects a workflow mode, follow `FRAMEWORK.md § Mode execution rules` exactly.
- Selecting `plan-build` authorises planning first, not automatic implementation.
- Selecting `spec-kit` requires following the full Spec Kit sequence in order unless the user explicitly changes modes.

## Workflow Framework

This framework uses a framework-agnostic change workflow.

### Supported modes

- `plan-build`: complete a planning step first, then implement only after the plan is finished and the user asks to proceed.
- `spec-kit`: spec-driven development using the Spec Kit workflow. Best for new features, cross-cutting concerns, or work requiring formal spec governance.

These are operating modes, not different specification systems. They all converge on the same canonical source of truth: `specs/features/`.

### Meta-agent routing

Before starting any non-trivial change, the agent MUST act as a routing meta-agent. Its role is to analyse the request and recommend the most appropriate mode, but the user makes the final decision.

**Routing protocol:**

1. Analyse the request for complexity, ambiguity, and scope.
2. Recommend one of the supported modes and briefly explain why.
3. Present the user with explicit workflow choices.
4. Ask the user how they want to proceed before doing any implementation work.

### Mode execution rules

Once the user selects a mode, the agent MUST follow that mode strictly. Do not merge modes, skip required steps, or silently continue into a later phase.

- `plan-build`:
  1. Plan first.
  2. Stop after the plan and present it clearly.
  3. Do not start building in the same step unless the user explicitly asks to continue with implementation after seeing the plan.
- `spec-kit`:
  1. Follow the Spec Kit sequence strictly: `spec-kit-specify` → `spec-kit-clarify` → `spec-kit-plan` → `spec-kit-tasks` → `spec-kit-analyse` → `spec-kit-implement`.
  2. `spec-kit-analyse` MUST run after tasks to validate consistency across all artefacts and user-story coverage.
  3. CRITICAL findings from `spec-kit-analyse` block implementation. Stop the workflow and fix them before continuing to `spec-kit-implement`.
  4. `spec-kit-checklist` may be used as a review or quality gate, but it does not replace required sequence steps.
  5. Do not skip ahead when an earlier required Spec Kit step has not been completed.

## Definition of Done

A change is not done unless all of the following are true:

- Relevant verification has been run for the affected scope.
- TDD was followed where automated testing was feasible, or the exception is explicit and justified.
- Naming matches the chosen problem language of the project.
- SOLID, Clean Code, and explicit architecture boundaries were preserved.
- No unnecessary abstractions, dead code, or framework leakage were introduced.
- Relevant spec in `specs/features/` reflects the current behaviour.
- Relevant behaviour is covered by tests.
- DDD and hexagonal architecture boundaries still hold.
- Material architectural decisions are captured and revised in `specs/decisions/`.
- Error paths distinguish operational failures from programmer errors and handle them accordingly.
- Logging is structured, correlated, and free of secrets or unnecessary sensitive data.
- The code style is consistent with the project's configured tools.
- Visual modifications align with the project design system tokens in `specs/ui/style-guide.md`, extracted from the existing frontend through `frontend-ui-workflow`.
- New UI and substantial frontend changes follow `specs/features/<feature>/implementation-plan.md` or an equivalent reviewed structure plan.
- Frontend code is shippable without a cleanup refactor: component responsibilities are clear, state ownership is simple, conditional rendering is readable, local primitives are reused, and unnecessary abstractions are absent.

## Living Specifications

`specs/features/` is the authoritative, technology-agnostic description of what the system does. It is not a planning artefact. It is a permanent record of system behaviour.

### Non-Negotiable Rule

Every observable behaviour change to the codebase MUST update `specs/features/` before the change is considered done.

### Spec format

```md
### Requirement: <system behaviour as a declarative statement>
<One-sentence description using SHALL/MUST.>

#### Scenario: <observable outcome>
- **WHEN** <condition or trigger>
- **THEN** <expected system response>
```

Use RFC 2119 language. Do not include implementation details, technology names, or framework references. Specs describe behaviour, not code.

## Review Checklist

Before finishing work, verify:

- Is the chosen behaviour reflected in `specs/features/`?
- Is the code aligned with the enabled capabilities?
- Are tradeoffs explicit enough that a future agent can continue safely?
- Would this change still make sense if infrastructure or tooling changed?

If the answer to any of these is "no", the change is not ready.

## Default Agent Behaviour

When contributing:

- Start by identifying the capability or boundary you are changing.
- Prefer existing package and boundary structure over creating ad hoc modules.
- Keep docs, specs, tests, and implementation aligned.
- If forced to choose, protect clarity of intent first and adapt tools around it.
