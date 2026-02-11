# System Architecture

## Summary
The platform is a single-node local system composed of modular TypeScript services. It uses content-addressed storage plus an append-only hash-chained ledger to provide cryptographic accountability for all agent actions and claims.

## Technology Stack
- Language: TypeScript (strict mode enabled).
- Runtime: Node.js 22 LTS.
- Package manager: pnpm.
- CLI framework: Commander.
- API framework: Fastify.
- Web UI: React with Vite.
- Data validation: Zod.
- Local index and query store: SQLite.
- Logging: Pino structured logs.
- Test stack: Vitest and Playwright.

## Logical Architecture
- Agent Runtime Layer
  - Executes role behavior for Planner, Executor, Critic, and Auditor.
- Protocol Layer
  - Enforces state transitions, event ordering, and role sequencing.
- Integrity Layer
  - Canonicalizes payloads, computes hashes, signs/verifies events.
- Persistence Layer
  - Stores artifacts as content-addressed blobs and events in append-only ledger.
- Verification Layer
  - Replays trace, validates chain/signatures/artifacts, produces findings.
- Interface Layer
  - CLI for execution and verification, API for viewer, browser-based trace viewer.

## Runtime Topology (Local-First Single Node)
- One local process group provides CLI and optional local API server.
- Filesystem hosts artifact blobs, trace ledger files, and verification outputs.
- SQLite is local and used for indexing and fast lookup, not as source of truth for immutable records.
- No remote services are required for v1.

## Repository Structure Specification
- `apps/cli`: protocol run and audit verify command handling.
- `apps/viewer`: investigator web interface.
- `apps/api`: local API service for trace browsing and report retrieval.
- `packages/contracts`: shared schemas and enums.
- `packages/crypto`: canonicalization, hashing, signing, verification utilities.
- `packages/store`: artifact store and ledger implementation.
- `packages/protocol`: orchestration and role state machines.
- `packages/verifier`: verification pipeline and failure classification.
- `packages/reporting`: human-readable and machine-readable report generation.

## Component Responsibilities
- Identity and Key Manager
  - Creates, loads, rotates, and validates agent key material.
- Canonicalization Engine
  - Produces deterministic JSON bytes for signing and hashing.
- Signing Service
  - Signs required event types and verifies signature integrity.
- Artifact Store
  - Persists unique blobs by hash and tracks metadata.
- Ledger
  - Appends immutable event records with hash chain references.
- Protocol Orchestrator
  - Drives role sequence and enforces transition rules.
- Verifier
  - Validates end-to-end trace integrity and claim evidence.
- Reporter
  - Produces concise investigator-facing summaries and detailed findings.
- Trace API
  - Serves query endpoints for traces, events, artifacts, and reports.
- Trace Viewer
  - Presents timeline and cryptographic verification state.

## Dependency Rules
- Interface layer depends on protocol and verifier layers, never the reverse.
- Protocol layer depends on contracts and integrity primitives.
- Store layer depends on contracts and integrity primitives.
- Verifier depends on contracts, integrity primitives, and read-only store interfaces.
- Viewer depends only on API contracts, never direct filesystem access.

## Data Ownership Rules
- Immutable source of truth for events: ledger JSONL.
- Immutable source of truth for artifact contents: content-addressed blob files.
- Mutable acceleration indices: SQLite and viewer caches.
- Any mismatch between index and immutable sources must self-heal by recomputation.

## Versioning Strategy
- `schema_version` is present in every event and report object.
- Backward-compatible additions are allowed for optional fields.
- Breaking field changes require new major schema version and migration plan.

## Availability and Performance Targets
- Single trace verification target: complete within 3 seconds for up to 10,000 events on developer hardware.
- UI timeline render target: first meaningful paint under 2 seconds for 5,000-event traces.
- Artifact dedup target: duplicate payload write incurs metadata-only path, no duplicate blob write.

## Security and Privacy Boundaries
- Integrity and provenance are guaranteed through cryptography and append-only policies.
- Confidentiality is best effort in v1 through redaction options and local file permissions.
- Full hostile-host guarantees are explicitly out of scope.

## Architecture Decisions
- Use append-only hash chain ledger instead of mutable DB history to optimize auditability.
- Use content-addressed blobs to ensure tamper detectability and deduplication.
- Use local-first topology to satisfy setup simplicity and enterprise demo portability.
