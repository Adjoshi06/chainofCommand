# Agent Protocol Specification

## Summary
This specification defines the multi-agent protocol, role behaviors, message lifecycle, transition rules, and error semantics. The protocol requires at least Planner, Executor, and Critic roles, with Auditor integrated for verification actions.

## Protocol Roles
- Planner
  - Converts task input into actionable proposal set.
  - Signs `proposal_created` events.
- Executor
  - Emits signed tool intents and records tool execution artifacts.
  - Issues evidence-backed claims.
- Critic
  - Reviews proposals and actions for safety and policy risk.
  - Can challenge claims and block unsafe intents.
- Auditor
  - Initiates and records verification runs.
  - Signs verification summaries.

## Session Lifecycle
States:
- `initialized`
- `planning`
- `reviewing`
- `executing`
- `claiming`
- `auditing`
- `completed`
- `failed`
- `aborted`

State transitions:
1. `initialized` to `planning` after `session_initialized`.
2. `planning` to `reviewing` after at least one `proposal_created`.
3. `reviewing` to `executing` after `proposal_reviewed` with approved status.
4. `executing` to `claiming` after execution success or bounded failure handling.
5. `claiming` to `auditing` after at least one `claim_issued`.
6. `auditing` to `completed` when verifier status is pass or pass-with-warnings.
7. Any state to `failed` on unrecoverable integrity violation.
8. Any state to `aborted` on explicit operator abort.

## Protocol Event Ordering Rules
- Events are append-only and globally ordered within a trace.
- Each new event references immediate predecessor hash.
- Role-specific ordering constraints:
  - `tool_intent_signed` must precede any tool execution event.
  - `tool_execution_completed` or `tool_execution_failed` must precede related `claim_issued`.
  - `final_statement_signed` must be the last role event before verification completion.

## Mandatory Signed Event Types
- `proposal_created`
- `tool_intent_signed`
- `claim_issued`
- `claim_challenged`
- `final_statement_signed`
- `verification_run_completed`

## Proposal Workflow
1. Planner parses task and emits one or more proposal units.
2. Each proposal includes objective, assumptions, required tools, expected evidence.
3. Critic reviews each proposal and records approval, conditional approval, or rejection.
4. Rejected proposals cannot proceed to execution.

## Tool Intent and Execution Workflow
1. Executor emits `tool_intent_signed` with normalized input hash, risk class, and justification.
2. Critic may block intent if policy thresholds are exceeded.
3. On approval, tool execution begins and `tool_execution_started` is recorded.
4. Tool input and output are stored as artifacts.
5. Executor records `tool_execution_completed` with result metadata or `tool_execution_failed` with failure context.

## Claim Workflow
1. Executor emits `claim_issued` with claim text, confidence level, and required evidence references.
2. Critic can emit `claim_challenged` if evidence is weak or contradictory.
3. Planner and Executor may issue revisions through new events; prior events remain immutable.
4. Final claim bundle is included in `final_statement_signed`.

## Auditor Workflow
1. Auditor starts verification with `verification_run_started`.
2. Verifier executes all mandatory checks.
3. Auditor records `verification_run_completed` including status and report reference.
4. Session completes only if verification event exists.

## Concurrency Model
- Multiple proposed actions may exist in parallel.
- Ledger append is serialized by a trace-level write lock.
- Artifact writes may run concurrently but must complete before referencing event commit.
- Any race causing non-sequential hash chain is rejected and retried.

## Failure Semantics
- Signature invalid: mark trace status `failed` and stop protocol progression.
- Missing artifact at claim time: allow continuation to auditing with expected failure outcome.
- Tool runtime failure: record failure event and allow fallback proposal if policy permits.
- Critic block: proposal or tool intent transitions to blocked state; execution prohibited until revision.

## Retry and Recovery Rules
- Retrying a tool execution creates a new intent and new execution events; previous attempt remains in history.
- Recovery after process crash:
  - Reload trace head from ledger.
  - Validate last complete event.
  - Resume at next valid state transition only.

## Policy Guards
- Role guard: only designated roles can emit each event type.
- Action guard: risky tools require critic approval.
- Evidence guard: claims require artifact references and minimum evidence count.
- Finalization guard: final statement blocked until required checks pass.

## Protocol Invariants
- Every emitted claim is attributable to one agent key and one signed event.
- Every tool execution has at least one stored input or output artifact.
- Every verification report references immutable trace identifiers.
- No event mutation or deletion is allowed post-append.
