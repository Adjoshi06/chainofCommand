# Domain Model and Data Contracts

## Summary
This document defines all canonical entities, schemas, constraints, and versioning policies for the platform. These contracts are mandatory and shared across runtime, storage, verifier, CLI, and UI.

## Global Contract Rules
- All persisted objects must include `schema_version`.
- All timestamps must be ISO 8601 UTC with millisecond precision.
- All identifiers are lowercase ASCII strings.
- Hash values are lowercase hexadecimal.
- Signature bytes are base64 encoded.
- Unknown fields must be preserved by readers and ignored by validators unless explicitly marked forbidden.

## Canonical Entities

### AgentIdentity
Required fields:
- `agent_id`: stable unique ID for an agent.
- `display_name`: human-readable label.
- `role_capabilities`: list of allowed roles.
- `key_id`: active key identifier.
- `public_key`: encoded public key.
- `key_algorithm`: signature algorithm identifier.
- `status`: active, rotated, revoked.
- `created_at`: timestamp.
- `updated_at`: timestamp.

Constraints:
- `agent_id` and `key_id` are immutable once published in a trace.
- Revoked keys cannot sign new events but remain valid for historical verification if event time predates revocation time.

### MessageEnvelope
Required fields:
- `schema_version`
- `trace_id`
- `event_id`
- `event_type`
- `created_at`
- `actor`
- `payload_hash`
- `prev_event_hash`
- `event_hash`
- `signature`

Nested `actor` fields:
- `agent_id`
- `role`: planner, executor, critic, auditor.
- `key_id`

Nested `signature` fields:
- `algorithm`
- `signature_b64`
- `signed_bytes_hash`

Constraints:
- `event_hash` is computed from canonical event body excluding `event_hash` itself.
- `prev_event_hash` for first event equals a constant genesis value defined in configuration.
- `payload_hash` must resolve to an artifact or inline canonical payload according to event type rules.

### ProtocolEvent
Required fields:
- All `MessageEnvelope` fields.
- `payload_type`
- `payload`
- `claims`
- `artifacts`

Constraints:
- `claims` list must include claim IDs for all auditable assertions.
- `artifacts` list must include only descriptor references, not raw binary.

### ArtifactDescriptor
Required fields:
- `artifact_hash`
- `hash_algorithm`
- `media_type`
- `encoding`
- `byte_size`
- `created_at`
- `producer_event_id`
- `storage_uri`
- `redaction_status`

Constraints:
- `artifact_hash` is derived from raw bytes before compression or encryption.
- `storage_uri` must be local-relative path in v1.
- `redaction_status` values: none, redacted, redacted-with-pointer.

### TraceSession
Required fields:
- `trace_id`
- `task_id`
- `started_at`
- `ended_at`
- `status`
- `participants`
- `head_event_hash`
- `event_count`
- `artifact_count`

Constraints:
- `participants` must include at least three roles for PRD compliance.
- `status` values: running, succeeded, failed, aborted, tampered.

### VerificationReport
Required fields:
- `schema_version`
- `report_id`
- `trace_id`
- `verified_at`
- `verification_status`
- `summary`
- `checks`
- `failures`
- `warnings`
- `metrics`

`checks` entry fields:
- `check_id`
- `name`
- `status`
- `scope`
- `evidence`

`failures` entry fields:
- `failure_code`
- `severity`
- `event_id`
- `artifact_hash`
- `message`
- `suggested_action`

Constraints:
- `verification_status` values: pass, pass-with-warnings, fail.
- Every failed check must produce at least one failure entry.

## Event Taxonomy
Mandatory event types:
- `session_initialized`
- `proposal_created`
- `proposal_reviewed`
- `tool_intent_signed`
- `tool_execution_started`
- `tool_execution_completed`
- `tool_execution_failed`
- `artifact_recorded`
- `claim_issued`
- `claim_challenged`
- `final_statement_signed`
- `verification_run_started`
- `verification_run_completed`

Event-specific payload requirements:
- `tool_intent_signed` must include tool name, normalized input hash, safety classification.
- `tool_execution_completed` must include output artifact hashes and exit status.
- `claim_issued` must include claim text and evidence artifact references.
- `final_statement_signed` must include consolidated claim IDs and final verdict text.

## Canonicalization Rules
- Use RFC 8785 JSON Canonicalization Scheme semantics.
- Numeric values must be encoded without superfluous precision.
- Object properties must be lexicographically ordered.
- No insignificant whitespace is allowed in signed canonical payload bytes.
- UTF-8 normalization must follow NFC.

## Identifier Formats
- `trace_id`: ULID string.
- `event_id`: ULID string.
- `report_id`: ULID string.
- `claim_id`: prefix `claim_` plus ULID.
- `artifact_hash`: 64-char hex for SHA-256.
- `event_hash`: 64-char hex for SHA-256.

## Failure Code Registry
- `SIG_INVALID`: signature does not verify.
- `SIG_MISSING`: required signature missing.
- `CHAIN_BREAK`: `prev_event_hash` mismatch.
- `HASH_MISMATCH`: recomputed event hash differs from stored hash.
- `ARTIFACT_MISSING`: referenced artifact absent from store.
- `ARTIFACT_HASH_MISMATCH`: artifact bytes do not match declared hash.
- `CLAIM_UNPROVEN`: claim lacks sufficient evidence references.
- `ROLE_POLICY_VIOLATION`: role performed disallowed action.
- `SCHEMA_INVALID`: event or report violates schema.

## Compatibility and Migration Rules
- Readers must support current and previous minor schema versions.
- Migration must never rewrite original ledger lines.
- Migration outputs are stored as derived projections, not source replacements.
- Verification always runs against original immutable source records.
