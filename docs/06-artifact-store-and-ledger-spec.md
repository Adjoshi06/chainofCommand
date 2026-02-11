# Artifact Store and Ledger Specification

## Summary
This document defines immutable persistence for artifact payloads and protocol events. The model is content-addressed storage plus append-only JSONL ledger with hash chaining.

## Filesystem Layout
Root directory: `.coc`

Subdirectories:
- `.coc/keys`
- `.coc/artifacts/sha256`
- `.coc/traces/<trace_id>`
- `.coc/traces/<trace_id>/reports`
- `.coc/index`

Artifact layout:
- Blob path: `.coc/artifacts/sha256/<p1>/<p2>/<artifact_hash>.blob`
- Metadata path: `.coc/artifacts/sha256/<p1>/<p2>/<artifact_hash>.meta.json`
- `<p1>` is first two hash chars, `<p2>` is next two hash chars.

Trace layout:
- `.coc/traces/<trace_id>/trace.meta.json`
- `.coc/traces/<trace_id>/events.jsonl`
- `.coc/traces/<trace_id>/verification.latest.json`
- `.coc/traces/<trace_id>/reports/<report_id>.json`
- `.coc/traces/<trace_id>/reports/<report_id>.txt`

Index layout:
- `.coc/index/catalog.sqlite`

## Artifact Write Protocol
1. Compute SHA-256 of raw payload bytes.
2. Determine deterministic blob path from hash prefix.
3. If blob already exists and hash matches, skip blob rewrite.
4. Write metadata sidecar with producer event linkage.
5. Return `ArtifactDescriptor`.

Mandatory metadata fields:
- `artifact_hash`
- `hash_algorithm`
- `media_type`
- `byte_size`
- `created_at`
- `producer_event_id`
- `trace_id`
- `redaction_status`
- `integrity_verified_at`

## Deduplication Rules
- Deduplication key is `artifact_hash` only.
- Identical bytes across traces map to one blob.
- Per-trace relationship is tracked by metadata references and index entries.
- Metadata updates must never alter blob bytes.

## Ledger Append Protocol
1. Read current ledger head hash from trace metadata.
2. Build canonical event body.
3. Compute `event_hash`.
4. Set `prev_event_hash` to current head.
5. Verify signature presence for required event type.
6. Append exactly one JSON line to `events.jsonl`.
7. Update trace metadata head and counters atomically.

## Atomicity and Consistency
- Append and metadata head update must be atomic from observer perspective.
- On crash during append, recovery scans last complete JSON line.
- Partial or malformed trailing line is discarded and logged as crash artifact.
- Index updates are best effort and can be rebuilt from immutable files.

## Ledger Record Constraints
- Every line is a single complete event object.
- No line edits, deletions, or in-place rewrites.
- Events must remain chronologically ordered by append position.
- `event_id` uniqueness is enforced per trace at write time.

## Locking Model
- Trace-level exclusive lock for ledger append operations.
- Artifact blob writes use hash-level lock to avoid duplicate concurrent writes.
- Verifier reads acquire shared lock and must tolerate concurrent appends by using bounded snapshot semantics.

## Read Model
Primary immutable reads:
- Event scan from `events.jsonl`.
- Blob read from content-addressed location.

Accelerated reads via SQLite index:
- events by type
- events by role
- claims by status
- artifact reference lookup

Rebuild behavior:
- If index is missing or stale, rebuild from ledger and metadata files.

## Retention and Cleanup
- Default retention for traces: indefinite in v1.
- Optional purge tool may remove entire trace directories only, never partial event ranges.
- Artifact garbage collection is reference-count based and disabled by default in v1.

## Integrity Monitoring
- Background integrity scanner periodically re-hashes sampled blobs.
- Scanner also validates ledger continuity for recent traces.
- Any mismatch emits critical audit alert entry.

## Future Storage Extensions
- Pluggable object-store backend retaining same `ArtifactDescriptor` contract.
- Remote notary mirror for ledger replication.
- Compression and encryption wrappers without changing hash-of-raw policy.
