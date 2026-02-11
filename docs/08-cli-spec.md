# CLI Specification

## Summary
This document specifies the command line interface for protocol execution and trace verification. The CLI is the primary automation and operator surface.

## Command Set
- `protocol run --task <task-file>`
- `audit verify --trace <trace-file-or-id>`

Additional required options:
- `--config <config-file>` optional, defaults to local config path.
- `--output <path>` optional for report destination override.
- `--format <text|json>` optional output format.
- `--strict` optional strict policy for verification.

## `protocol run` Behavior
Input:
- Task specification file.

Processing:
1. Load and validate task schema.
2. Initialize trace session and participants.
3. Run protocol state machine through planning, reviewing, executing, claiming, auditing.
4. Persist artifacts and events.
5. Trigger verification and emit final session status.

Output:
- Text mode: run summary, trace ID, verdict, counts.
- JSON mode: machine-readable run result object.

## `audit verify` Behavior
Input:
- Trace identifier or explicit ledger path.

Processing:
1. Resolve trace and immutable sources.
2. Run full verifier pipeline.
3. Write report artifacts.
4. Print verdict and key findings.

Output:
- Text mode: concise findings and remediation hints.
- JSON mode: full report object.

## Task File Contract
Required fields:
- `task_id`
- `objective`
- `input_artifacts` list
- `constraints` list
- `policy_profile`
- `requested_roles`

Optional fields:
- `time_budget_seconds`
- `max_tool_calls`
- `sensitivity_level`
- `tags`

Validation rules:
- At least three roles required.
- Unknown role names are rejected.
- Policy profile must map to known profile.

## Exit Code Policy
- `0`: success with pass verdict.
- `1`: verification failed.
- `2`: input or schema validation error.
- `3`: runtime protocol failure.
- `4`: internal system error.
- `5`: policy violation preflight block.

Exit code must be deterministic for identical failure class.

## Logging and Console Rules
- Default console output is concise and human-readable.
- `--format json` emits one structured object only.
- Sensitive artifact content must never be printed.
- Logs include trace ID and event IDs for correlation.

## Error Contract
Every CLI error output must include:
- error category
- human message
- trace ID when available
- recommended next command

## Reproducibility Rules
- CLI must record tool versions, policy profile, and config fingerprint in trace metadata.
- Re-running with identical inputs should produce comparable event sequences except timestamps and generated IDs.

## Operational Commands (Optional v1.1)
Not required for v1 but reserved:
- `trace list`
- `trace show --id <trace-id>`
- `keys rotate --agent <agent-id>`
- `store check-integrity`

## Automation Guidance
- CI should use JSON output mode.
- Machine consumers must parse report schema, not text output.
- CLI should remain backward-compatible in options for all v1 minor releases.
