# Product to Architecture Mapping

## Summary
This document maps PRD goals and requirements to concrete architecture components, ownership boundaries, and acceptance evidence. It defines how implementation and testing prove compliance.

## Requirement Catalog

### Goals
- G1: Artifact-first multi-agent protocol where every tool call and output is hashed, signed, and stored.
- G2: Auditor can verify claims such as test execution, retrieved documents, and output provenance.
- G3: Trace viewer enables investigation across event chain, signatures, and artifacts.

### Functional Requirements
- FR1: Agent identity with keypair per agent and local development key support.
- FR2: Content-addressed artifact store for tool inputs and outputs.
- FR3: Agent signatures for proposals, tool intents, and final statements.
- FR4: Append-only notary ledger with hash chaining.
- FR5: Verifier validates signatures, chain integrity, artifact existence, and hash matches.
- FR6: Protocol with roles Planner, Executor, Critic, Auditor and signed envelopes.
- FR7: UI trace viewer for event chain, signature status, and artifact links.

### Non-Functional Requirements
- NFR1: Storage efficiency through deduplication.
- NFR2: Easy local setup without external infrastructure.
- NFR3: Human-readable audit reports.

### Non-Goals
- NG1: Full blockchain system.
- NG2: Absolute tamper prevention under fully privileged hostile host.

## Architecture Component Inventory
- C1: Identity and Key Manager
- C2: Canonicalization and Hashing Engine
- C3: Signing Service
- C4: Artifact Store
- C5: Append-Only Ledger
- C6: Protocol Orchestrator
- C7: Agent Runtime (Planner, Executor, Critic, Auditor roles)
- C8: Verifier Engine
- C9: Audit Report Generator
- C10: CLI Surface
- C11: Trace API Service
- C12: Trace Viewer UI

## Traceability Matrix
| Requirement | Components | Primary Artifact of Compliance | Validation Mechanism |
| --- | --- | --- | --- |
| G1 | C2, C3, C4, C5, C6, C7 | Signed event chain and referenced artifacts | Integration test with full trace reconstruction |
| G2 | C8, C9, C10, C11 | Verification report with deterministic checks | Tamper simulation suite |
| G3 | C11, C12 | UI session view with linked evidence and verdicts | End-to-end investigator workflow tests |
| FR1 | C1, C3 | Agent key registry and key fingerprints in events | Unit tests and key rotation integration tests |
| FR2 | C4 | Content-addressed blobs and metadata sidecars | Deduplication and hash-consistency tests |
| FR3 | C2, C3, C7 | Valid signatures on required event types | Signature compliance contract tests |
| FR4 | C5 | JSONL ledger with `prev_event_hash` chain | Chain integrity verification tests |
| FR5 | C8, C9 | Structured verification output and failure codes | Verifier matrix tests |
| FR6 | C6, C7 | Role-specific event sequence and transitions | Protocol state-machine tests |
| FR7 | C11, C12 | Trace timeline, signature panel, artifact details | UI scenario tests |
| NFR1 | C4 | Single storage record for identical payload hash | Load and dedup tests |
| NFR2 | C10, C11 | Local init and run without cloud dependencies | Fresh-machine setup test |
| NFR3 | C9, C12 | Human-readable verification summary and findings | Investigator usability scenario |

## Ownership Model
- Platform Core Team: C1, C2, C3, C4, C5, C6.
- Protocol Team: C7.
- Audit Team: C8, C9.
- Experience Team: C10, C11, C12.

## Milestone-to-Requirement Mapping
- M0 covers FR1, FR2, FR3 baseline primitives.
- M1 covers FR4 and FR6 integrated protocol trace.
- M2 covers FR5 and tamper detection depth.
- M3 covers FR7 and NFR3.
- M4 covers end-to-end demos and hardening against all goals.

## Acceptance Signals
- A run is acceptable only if every claim references immutable artifacts and signed events.
- A trace is acceptable only if full hash chain and all required signatures validate.
- A UI session is acceptable only if an investigator can derive who did what, with which evidence, and whether verification passed.

## Out-of-Scope Confirmation
- Distributed consensus and public blockchain semantics are excluded.
- Rooted-host hardening beyond standard local controls is excluded from v1.
