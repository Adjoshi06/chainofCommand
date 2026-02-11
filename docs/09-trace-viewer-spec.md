# Trace Viewer Specification

## Summary
The trace viewer is a browser-based investigation interface for exploring trace sessions, verifying cryptographic status, and performing root-cause analysis.

## Primary Users
- Reviewer validating claims.
- Operator investigating unsafe action proposals.
- Compliance lead generating evidence packets.

## User Experience Objectives
- Understand what happened in a run within minutes.
- Identify who made each claim or action.
- See cryptographic validity status at event and trace level.
- Navigate directly from claim to supporting artifacts.

## Information Architecture
Top-level views:
- Trace List
- Trace Overview
- Event Timeline
- Event Detail
- Artifact Detail
- Verification Report
- Export Session

## Required View Content

### Trace List
- Trace ID
- task ID
- start and end times
- status
- verification verdict
- participant roles

### Trace Overview
- session summary
- event counts by type
- artifact counts
- current head hash
- quick links to failures and warnings

### Event Timeline
- ordered events with actor, role, type, timestamp
- integrity badges: signature valid, chain valid, artifact linked
- filters by role, event type, severity

### Event Detail
- canonical event fields
- signature metadata and key ID
- payload hash and linked artifact descriptors
- previous and next chain links

### Artifact Detail
- artifact metadata
- hash and byte size
- producer event reference
- redaction status
- verification status

### Verification Report
- overall verdict
- checks table
- failures and warnings
- remediation recommendations

## Interaction Workflows

### Investigate Claim
1. Open trace overview.
2. Jump to claim events.
3. Open claim detail and evidence links.
4. Verify signature and artifact checks.
5. Export findings.

### Unsafe Proposal Attribution
1. Filter timeline by `proposal_created` and critic challenges.
2. Open proposal event.
3. Inspect actor identity and signature.
4. Follow chain to final statement.

### Compliance Report Export
1. Open verification report tab.
2. Select export format.
3. Download evidence bundle with report and referenced metadata.

## API Contracts for Viewer
- `GET /api/traces`
- `GET /api/traces/{trace_id}`
- `GET /api/traces/{trace_id}/events?cursor&limit&type&role`
- `GET /api/traces/{trace_id}/events/{event_id}`
- `GET /api/artifacts/{artifact_hash}/metadata`
- `GET /api/traces/{trace_id}/reports/latest`
- `GET /api/traces/{trace_id}/reports/{report_id}`
- `POST /api/traces/{trace_id}/verify`

API response requirements:
- Stable pagination cursors.
- Deterministic ordering by ledger position.
- Explicit null handling for optional fields.

## Performance Targets
- Trace list render under 1 second for 500 traces.
- Timeline virtualized rendering for 10,000 events without browser freeze.
- Event detail opening under 200 milliseconds with warm cache.

## Accessibility and Usability
- Keyboard navigable timeline and filters.
- Color alone must not convey integrity status.
- Timestamp display supports UTC and local toggle.
- Exported text reports must be readable without UI.

## Security and Privacy
- Viewer never exposes private keys.
- Raw sensitive artifact content is hidden by default.
- Redacted artifact content displays policy reason and access guidance.
- API must sanitize filesystem paths and deny traversal patterns.

## Error Handling UX
- Distinguish missing data from failed verification.
- Show actionable remediation for every failure code.
- Preserve partial view when non-critical fetch fails.

## Future UI Extensions
- Diff view between two verification runs.
- Side-by-side claim and evidence graph.
- Multi-trace correlation dashboard.
