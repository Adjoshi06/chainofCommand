# Delivery Roadmap and Milestones

## Summary
This roadmap converts PRD milestones into an execution plan with deliverables, dependencies, and acceptance checkpoints.

## Milestone Overview
- M0: Core integrity primitives.
- M1: Multi-agent protocol and trace generation.
- M2: Verifier and tamper detection.
- M3: Trace viewer and reporting UX.
- M4: Demo readiness and hardening.

## M0: Integrity Primitives
Deliverables:
- canonicalization implementation rules aligned to RFC 8785.
- hashing and signature services.
- key manager with dev-mode lifecycle.
- content-addressed artifact store baseline.

Dependencies:
- domain contracts finalized.

Exit criteria:
- signing and verification unit tests pass.
- artifact dedup and hash consistency proven.

## M1: Protocol and Ledger
Deliverables:
- role state machines for Planner, Executor, Critic, Auditor.
- protocol orchestrator transitions.
- append-only ledger with hash chaining.
- CLI `protocol run` baseline path.

Dependencies:
- M0 complete.

Exit criteria:
- trace generation with signed events and linked artifacts.
- policy guards enforced for role actions.

## M2: Verifier and Tamper Tests
Deliverables:
- verifier pipeline implementing all required checks.
- failure code registry and severity mapping.
- CLI `audit verify` command.
- tamper simulation suite.

Dependencies:
- M1 complete with stable event contracts.

Exit criteria:
- all tamper scenarios detected deterministically.
- report outputs in machine and human formats available.

## M3: Trace Viewer and Reporting
Deliverables:
- local API service for trace browsing.
- viewer timeline, event detail, artifact detail, report panels.
- export flow for audit reports.

Dependencies:
- M2 complete with report schema stability.

Exit criteria:
- investigator workflows validated end-to-end.
- UI performance thresholds achieved.

## M4: Demo and Hardening
Deliverables:
- demonstration scenarios for reviewer, operator, compliance lead.
- operational runbooks and incident response guide.
- compatibility and migration validation for schema evolution.

Dependencies:
- M3 complete.

Exit criteria:
- PRD success metrics measured and met in demo pack.
- implementation docs and acceptance evidence finalized.

## Critical Path
1. contracts and integrity primitives
2. protocol and ledger immutability
3. verifier correctness
4. viewer usability and report workflows
5. demo reproducibility and operational polish

## Parallelization Opportunities
- API and viewer scaffolding can begin during late M2 using mocked report contracts.
- test fixture authoring can run in parallel after contracts are stable.
- operational documentation can begin in M3 while UI hardening proceeds.

## Risks and Mitigations
- Canonicalization inconsistency
  - mitigation: golden fixtures and cross-check tests.
- key management complexity
  - mitigation: strict dev-mode scope and rotation tests.
- ledger corruption on crash
  - mitigation: append recovery scanner and durability tests.
- viewer performance degradation on large traces
  - mitigation: virtualization and indexed query pagination.

## Release Readiness Checklist
- all milestone exit criteria achieved.
- no unresolved critical or high defects.
- acceptance scenario matrix complete.
- documentation reflects final schema versions and CLI surface.

## Post-v1 Backlog
- remote object store backend.
- optional encryption at rest.
- hardware-backed key storage.
- multi-node execution topology.
