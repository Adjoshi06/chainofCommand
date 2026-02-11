# Cryptography and Trust Model

## Summary
This document defines the cryptographic controls, key lifecycle, signing scope, trust assumptions, and threat model for cryptographic accountability.

## Cryptographic Choices
- Hash algorithm: SHA-256.
- Signature algorithm: Ed25519.
- Canonicalization: RFC 8785 canonical JSON.
- Randomness source: OS cryptographically secure random generator.

Rationale:
- Ed25519 provides fast signing and verification with strong security and compact keys.
- SHA-256 aligns with broad tooling support and audit portability.

## Signing Scope
Each signed event covers canonical bytes of:
- `schema_version`
- `trace_id`
- `event_id`
- `event_type`
- `created_at`
- `actor`
- `payload_hash`
- `payload_type`
- `claims`
- `artifacts`
- `prev_event_hash`

Not signed directly:
- `event_hash` field itself.
- Derived local index metadata.

Rule:
- Signature verification must fail if any signed field differs by even one byte post-canonicalization.

## Event Hash Scope
Event hash is SHA-256 of canonical event body excluding:
- `event_hash`
- non-deterministic local metadata

Chain rule:
- Event N must include `prev_event_hash` equal to event N-1 `event_hash`.
- Genesis event must use configured constant `GENESIS_PREV_HASH`.

## Key Lifecycle

### Key Generation
- Generate one Ed25519 keypair per agent identity.
- Development mode uses local filesystem key storage with strict permissions.
- Key fingerprints are SHA-256 of public key bytes.

### Key Activation
- A key becomes active after registration in key registry.
- Each event must reference active `key_id` at event creation time.

### Key Rotation
- Rotation event must be recorded in ledger with old and new key IDs.
- New events use new key immediately after rotation timestamp.
- Historical verification resolves key by event time.

### Key Revocation
- Revocation event marks key unusable for new signatures.
- Existing signatures remain verifiable unless revocation reason is compromise and policy marks trust invalid retroactively.

## Key Storage Policy
- Private keys must never be written in logs or reports.
- Local key files must use owner-only filesystem access.
- Optional future extension: OS keychain provider.

## Trust Boundaries
Trusted for v1:
- Correct implementation of canonicalization and cryptographic primitives.
- Integrity of local binary and runtime dependencies.

Partially trusted:
- Host filesystem and process environment under normal developer conditions.

Out of scope for v1 guarantees:
- Fully privileged malicious host that can alter runtime behavior and key material pre-signing.

## Threat Model

### Attacks to Detect
- Event payload mutation after creation.
- Event insertion, deletion, or reorder in ledger.
- Artifact content substitution.
- Replay of previously signed event into new trace.
- Claim assertion without linked evidence.

### Attacks Partially Mitigated
- Key theft after event creation can sign fraudulent future events; detection depends on key rotation and policy controls.

### Attacks Not Mitigated by Design
- Runtime memory tampering by privileged attacker before signing.
- Compromised OS entropy source.

## Anti-Replay Controls
- `event_id` uniqueness per trace is mandatory.
- `(trace_id, event_id)` pair must be globally unique.
- Verification fails on duplicate IDs or duplicate signature payload in disallowed context.

## Redaction and Privacy Strategy
- Redacted artifacts keep original hash and store redaction metadata.
- Claim evidence can reference redacted blobs with reason and policy tag.
- Verifier reports must indicate when findings are limited by redaction.

## Crypto Compliance Checks
Verifier must include mandatory checks:
- Canonicalization reproducibility.
- Signature validation for required event types.
- Event hash recomputation.
- Chain continuity validation.
- Key status validation at event time.

## Future Extensions
- Optional artifact encryption-at-rest with envelope keys.
- Hardware-backed signing providers.
- Threshold signatures for high-risk actions.
