# Processing Flows and Sequence Scenarios

## Summary
This document defines end-to-end processing flows for normal operation and critical fault scenarios. Each sequence is implementation-binding and must be reflected in state machine and tests.

## Flow A: Standard Protocol Run
1. CLI receives task specification.
2. Protocol orchestrator initializes trace session.
3. Planner emits signed proposal events.
4. Critic reviews proposals and records decision.
5. Executor emits signed tool intent.
6. Critic approves or blocks intent based on policy.
7. Executor runs tool and captures inputs and outputs as artifacts.
8. Artifact descriptors are linked to execution events.
9. Executor issues evidence-backed claims.
10. Critic challenges weak claims if needed.
11. Executor or Planner publishes final signed statement.
12. Auditor triggers verification run.
13. Verifier produces pass or fail report.
14. Trace session closes with final status.

Expected outputs:
- Complete hash-chained ledger.
- Artifact store entries for all referenced payloads.
- Verification report in JSON and text formats.

## Flow B: Tool Execution Failure with Recovery
1. Executor emits intent and starts tool execution.
2. Tool fails due to runtime error.
3. `tool_execution_failed` event is appended with failure metadata.
4. Executor proposes retry path or alternate tool.
5. Critic reviews retry risk.
6. On approval, new intent is emitted and execution retried.
7. Claims must reference successful attempt artifacts only unless explicitly claiming failure analysis.

Recovery constraints:
- Failed attempt history remains immutable.
- Retry must never overwrite prior artifacts or events.

## Flow C: Signature Mismatch Detection
1. Verifier recomputes canonical signed bytes.
2. Signature validation fails for event.
3. Verifier emits `SIG_INVALID` failure.
4. Trace verdict becomes fail.
5. Report highlights event ID, actor, and likely tamper location.

Protocol consequence:
- Session transitions to failed if mismatch occurs during active run.

## Flow D: Missing Artifact Detection
1. Claim references artifact hash.
2. Verifier resolves artifact path.
3. Blob missing from content store.
4. Verifier emits `ARTIFACT_MISSING` failure.
5. Claim marked unproven.

Operator response path:
- Investigate producer event.
- Reconcile storage corruption or incomplete write.

## Flow E: Chain Tampering Detection
1. Verifier scans ledger linearly.
2. Finds event with `prev_event_hash` mismatch.
3. Emits `CHAIN_BREAK` critical failure.
4. Marks all downstream events as untrusted for integrity guarantee.

Report requirement:
- Identify first broken index and last trusted event.

## Flow F: Claim Challenge and Resolution
1. Executor issues claim.
2. Critic emits challenge citing missing or weak evidence.
3. Executor submits supplementary evidence or retracts claim.
4. Final statement includes claim resolution status.
5. Verifier checks disputed claims against policy profile.

## Flow G: Crash Recovery During Append
1. Process crashes after partial event write.
2. On restart, ledger loader reads last line.
3. If malformed, truncate incomplete trailing bytes.
4. Recompute head hash from last valid line.
5. Resume protocol from last committed state.

## Idempotency Rules
- Starting verification twice without trace change yields equivalent report findings.
- Retried tool calls are new events, never in-place update.
- Session initialization with same task ID generates new trace ID.

## Sequence Integrity Requirements
- Every event after initialization must have valid predecessor reference.
- Role actions must follow allowed transition matrix.
- Evidence references must point to immutable artifact descriptors.

## Transition Guard Matrix
- Planner can emit proposals and revisions only.
- Executor can emit intents, execution outcomes, claims, final statements.
- Critic can emit reviews and challenges.
- Auditor can emit verification run events.

Any violation triggers `ROLE_POLICY_VIOLATION`.

## Observability in Flows
Each step must emit logs containing:
- trace ID
- event ID if available
- actor role
- operation status
- latency metric

## Workflow Acceptance Criteria
- Each flow must be reproducible using CLI and deterministic test fixtures.
- Every negative scenario must produce expected failure code and severity.
- Investigators must be able to navigate from final verdict to root event and artifact.
