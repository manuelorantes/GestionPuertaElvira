# Resilience Capability

> This file is maintained by Aircury AI Framework. Do not edit it directly. Add project-specific rules in FRAMEWORK.local.md.

Error-handling and structured-logging standards with curated resilience skills

## Framework Rules

## Error Handling

Errors are a first-class part of the system design. Handle expected failures deliberately and fail fast on bugs.

### Error Classification

- **Operational errors** are expected runtime failures such as invalid input, timeouts, unavailable dependencies, rate limits, or missing resources.
- **Programmer errors** are bugs such as broken invariants, impossible states, incorrect assumptions, or null access on required values.

### Required Handling Rules

- Validate external input at boundaries before domain or application logic consumes it.
- Handle operational errors explicitly near the boundary where they become meaningful.
- Return safe user-facing messages. Do not leak stack traces, SQL fragments, filesystem paths, secrets, or internal topology.
- Log enough internal context for diagnosis, but keep recovery logic separate from presentation logic.
- Treat programmer errors as defects. Surface them quickly, log them with context, and fix the root cause rather than masking them.

### Recovery Patterns

Use recovery only when the failure mode is expected and the operation semantics allow it.

- Retry transient failures with bounded attempts, backoff, and jitter where appropriate.
- Use fallback paths only when degraded behaviour is still correct and explicit.
- Use compensation for multi-step flows when partial completion would leave the system inconsistent.
- Do not retry non-idempotent operations blindly.

### Anti-Patterns

- Silent catch blocks.
- Returning generic success when a meaningful failure occurred.
- Converting programmer errors into normal control flow.
- Mixing validation, authorisation, and system failures into the same vague error response.
- Retrying without limits or without understanding failure semantics.

## Structured Logging

Logs are part of the product's operating surface. They must support debugging, correlation, and incident response without exposing sensitive data.

### Logging Format

- Prefer structured machine-readable events such as JSON objects.
- Use consistent field names across services and modules.
- Include request IDs, correlation IDs, job IDs, or equivalent identifiers whenever work crosses boundaries.
- Include the operation name, outcome, duration, and relevant domain context when available.

### Wide Event Preference

Prefer one context-rich event per meaningful operation or request over many scattered log lines.

Good examples of useful context:

- Correlation identifier
- Route, command, or use-case name
- Outcome and status
- Duration or latency
- Safe business context that explains impact

### Logging Safety Rules

- Never log passwords, API keys, tokens, credentials, secrets, or encryption material.
- Avoid raw request and response bodies unless they are explicitly sanitised and necessary.
- Redact or omit personal data unless it is required for diagnosis and approved by the product context.
- Keep stack traces in internal logs only when they are safe and useful.

### Logging Quality Rules

- Do not scatter unstructured `console.log` style debug statements through request paths.
- Use a consistent logger interface for the project.
- Distinguish durable operational events from temporary local debugging noise.
- Make logs searchable by outcome, boundary, and correlation identifier.

## Agent Operating Rules

- Classify failures as operational errors or programmer errors before choosing a handling strategy.
- Operational errors at system boundaries MUST be handled explicitly with safe user-facing responses and clear internal context.
- Programmer errors and invariant violations MUST fail fast. Do not hide bugs behind generic success paths or silent recovery.
- Prefer retries only for transient failures and only with bounded attempts, backoff, and idempotent semantics.
- When an operation cannot complete normally, return or propagate an error shape that preserves intent, actionability, and boundary ownership.

- Emit structured logs as machine-readable events rather than ad hoc strings.
- Include correlation identifiers and operation context in logs that describe requests, jobs, or workflow steps.
- Prefer one context-rich completion event per meaningful operation over scattered low-signal log lines.
- Never log secrets, tokens, credentials, full sensitive payloads, or personal data that is not required for diagnosis.
- Keep log field names consistent across the codebase so events can be searched and correlated reliably.
