# Testing Strategy and Acceptance Criteria

## Summary
This document defines validation strategy, required test suites, scenario coverage, and release gates aligned to PRD success metrics.

## Quality Objectives
- Near-100 percent verifiability of claims through signed events and artifacts.
- Deterministic tamper detection across simulated attack scenarios.
- Fast investigator root-cause workflow through trace viewer and reports.

## Test Pyramid

### Unit Tests
Scope:
- canonicalization behavior
- hash generation
- signature sign/verify
- schema validation
- event hash chaining logic

Requirements:
- deterministic fixtures for all crypto operations
- boundary tests for malformed payloads and invalid encoding

### Integration Tests
Scope:
- protocol orchestrator plus artifact store plus ledger append
- verifier against generated traces
- key rotation and revocation handling

Requirements:
- end-to-end trace generation without UI
- recovery from crash and partial write simulation

### System Tests
Scope:
- CLI `protocol run` and `audit verify` lifecycle
- API endpoints for trace and report retrieval
- Viewer workflows for investigation

Requirements:
- scenario-driven test data packs
- deterministic assertions on verdict and failure codes

### Performance Tests
Scope:
- trace ingestion and verification at target scale
- viewer timeline rendering at large event counts

Requirements:
- baseline hardware profile documented
- performance regressions fail release gate if thresholds exceeded by more than 10 percent

## Required Scenario Matrix
1. valid complete trace with pass verdict.
2. mutated event payload causes `SIG_INVALID`.
3. deleted middle event causes `CHAIN_BREAK`.
4. inserted forged event causes `HASH_MISMATCH` or `CHAIN_BREAK`.
5. missing artifact causes `ARTIFACT_MISSING`.
6. altered artifact bytes cause `ARTIFACT_HASH_MISMATCH`.
7. claim without evidence causes `CLAIM_UNPROVEN`.
8. unauthorized role emission causes `ROLE_POLICY_VIOLATION`.
9. duplicate event replay causes anti-replay failure.
10. key rotation preserves historical verification continuity.
11. strict profile turns disputed claim into fail verdict.
12. default profile turns disputed claim into warning.

## Acceptance Criteria by Milestone

### M0 Acceptance
- keypair generation and signing primitives validated.
- canonicalization deterministic across fixtures.
- content-addressed artifact dedup validated.

### M1 Acceptance
- multi-role protocol run produces complete hash-chained ledger.
- required event signatures present and valid.
- role transition policy enforced.

### M2 Acceptance
- verifier detects all tamper scenarios in matrix.
- failure codes and severities match specification.
- machine and human reports generated.

### M3 Acceptance
- viewer supports trace navigation and finding drill-down.
- investigator can locate source event and artifact for any failure.
- performance targets met for timeline and report load.

### M4 Acceptance
- demo scenarios pass reproducibly.
- documentation and runbooks are complete.
- traceability matrix fully satisfied.

## CI Pipeline Requirements
- Run unit and integration tests on every change.
- Run system tests on protected branch merges.
- Run tamper and performance suites nightly or before release candidate.
- Publish verification artifacts for failed pipeline runs.

## Test Data Governance
- Maintain immutable golden traces for regression.
- Version fixture packs with schema version.
- Include redacted fixture variants for privacy-path testing.

## Defect Severity Policy
- Critical: any undetected integrity break.
- High: false pass for invalid claim evidence.
- Medium: nondeterministic report outputs.
- Low: viewer usability defects without audit correctness impact.

## Release Gate Checklist
- 100 percent pass on required scenario matrix.
- zero open critical or high defects.
- performance budgets met.
- migration compatibility tests pass for prior minor schema version.
