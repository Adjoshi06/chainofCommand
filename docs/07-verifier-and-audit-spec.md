# Verifier and Audit Specification

## Summary
This document defines the verification pipeline, deterministic check ordering, failure classification, and report generation rules used to audit traces.

## Verification Objectives
- Prove event chain integrity.
- Prove signature validity and key legitimacy at event time.
- Prove artifact existence and hash correctness.
- Prove claims are evidence-backed.
- Produce machine-readable and human-readable results.

## Verification Inputs
- Trace path or `trace_id` reference.
- Event ledger file.
- Artifact store root.
- Key registry snapshot.
- Optional policy profile for strictness levels.

## Verification Pipeline
1. Load trace metadata and event ledger snapshot.
2. Validate schema for each event.
3. Recompute and compare event hash.
4. Validate `prev_event_hash` chain continuity.
5. Verify signatures for required event types.
6. Resolve referenced artifacts and validate hashes.
7. Evaluate claim-evidence linkage policy.
8. Aggregate check outcomes.
9. Emit report artifacts.

Pipeline ordering is mandatory and deterministic.

## Check Catalog
- `CHK_SCHEMA_CONFORMANCE`
- `CHK_EVENT_HASH_INTEGRITY`
- `CHK_CHAIN_CONTINUITY`
- `CHK_SIGNATURE_VALIDITY`
- `CHK_KEY_STATUS`
- `CHK_ARTIFACT_EXISTENCE`
- `CHK_ARTIFACT_HASH_MATCH`
- `CHK_CLAIM_EVIDENCE_SUFFICIENCY`
- `CHK_ROLE_POLICY_CONFORMANCE`
- `CHK_FINALIZATION_INTEGRITY`

Each check must emit:
- status
- checked scope
- evidence references
- elapsed time

## Verdict Rules
- `pass`: all required checks pass, zero failures.
- `pass-with-warnings`: no failures, at least one warning.
- `fail`: at least one failure in required checks.

Required checks are all checks listed in catalog unless explicitly disabled by policy profile.

## Failure Classification
Severity levels:
- critical
- high
- medium
- low

Severity mapping examples:
- `CHAIN_BREAK` is critical.
- `SIG_INVALID` is critical.
- `ARTIFACT_MISSING` is high.
- `CLAIM_UNPROVEN` is high.
- `ROLE_POLICY_VIOLATION` is medium.
- `SCHEMA_INVALID` is medium.

## Claim Validation Rules
A claim is considered proven only if:
- It references at least one artifact descriptor.
- Every referenced artifact exists.
- Every referenced artifact hash validates.
- Claim source event signature is valid.
- Claim has not been superseded by contradiction without resolution.

## Contradiction Handling
- If claim is challenged and unresolved, mark claim status as disputed.
- Disputed claim does not automatically fail trace, but contributes warning unless policy declares fail-on-dispute.

## Report Outputs

### Machine Report
- Stored as JSON.
- Includes full check list, failure entries, warning entries, and metrics.

### Human Report
- Stored as plain text summary.
- Includes executive verdict, key failures, likely root cause chain, and remediation guidance.

Required report sections:
- Trace identity and run context.
- Verification verdict.
- Findings sorted by severity.
- Evidence links.
- Recommended next actions.

## Failure Codes and Required Metadata
Every failure must include:
- `failure_code`
- `severity`
- `event_id` or `artifact_hash`
- `detected_at`
- `description`
- `verification_step`
- `recommended_remediation`

## Performance Expectations
- Full verification of 10,000-event trace under 3 seconds on baseline developer hardware.
- Incremental verification mode should reuse prior successful checks when head hash unchanged.

## Verifier Idempotency
- Re-running verification on unchanged trace must produce identical machine report except for report timestamp and report ID.
- Any difference beyond allowed fields is treated as deterministic behavior defect.

## Tamper Simulation Requirements
Verifier test suite must include:
- Single event payload modification.
- Event deletion from middle of chain.
- Event insertion with forged `prev_event_hash`.
- Artifact byte substitution preserving filename.
- Duplicate event replay across trace IDs.

Expected behavior:
- Every simulation triggers deterministic failure codes with correct severity.

## Policy Profiles
- `strict`: all checks mandatory, disputes fail.
- `default`: all checks mandatory, disputes warn.
- `lenient`: schema and integrity mandatory, selected policy checks warn.

Policy profile used must be recorded in verification report.
