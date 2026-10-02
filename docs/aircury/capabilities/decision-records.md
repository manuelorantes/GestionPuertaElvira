# ADRs Capability

> This file is maintained by Aircury AI Framework. Do not edit it directly. Add project-specific rules in FRAMEWORK.local.md.

Requires agents to capture material architectural and workflow decisions in ADRs under specs/decisions/.

## Framework Rules

## Architecture Decision Records

This installation uses ADRs to preserve current architectural and workflow intent.

## ADR Rules

- Store ADRs under `specs/decisions/`.
- Create an ADR when a task introduces a material architectural or workflow decision.
- Keep one ADR for each decision and revise it when the decision evolves.
- Name each ADR file with a unique lowercase, hyphen-separated descriptive slug.
- Use the human-readable decision title as the ADR heading.
- Link to related ADRs with an explicit repository-relative Markdown path, such as `[Use Redis-backed sessions](specs/decisions/use-redis-backed-sessions.md)`.
- Include `Context`, `Decision`, and `Consequences` sections.
- Read relevant ADRs before implementing work in an area governed by prior decisions.

## ADR Template

```md
# <decision title>

## Context
<why this decision is needed>

## Decision
<what was decided>

## Consequences
<tradeoffs, follow-ups, and constraints>
```

## Agent Operating Rules

- Material architectural or workflow decisions MUST be captured in `specs/decisions/`.
- ADR filenames MUST use a unique lowercase, hyphen-separated descriptive slug.
- Agents MUST keep one ADR for each decision and revise it when the decision evolves.
- ADR links MUST use explicit repository-relative Markdown paths, such as `[Use Redis-backed sessions](specs/decisions/use-redis-backed-sessions.md)`.
- Each ADR MUST include `Context`, `Decision`, and `Consequences` sections.
