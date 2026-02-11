# Operational Model and Security Controls

## Summary
This document defines deployment, configuration, observability, and security controls for local-first operation.

## Deployment Model
- Single host deployment with local filesystem persistence.
- Components can run as:
  - CLI-only mode for scripted runs.
  - API plus Viewer mode for investigations.
- No external managed services are required for v1.

## Runtime Profiles
- `dev`: verbose logs, local keys, rapid feedback.
- `demo`: stable settings for stakeholder walkthroughs.
- `ci`: deterministic output, JSON logging, strict verification.

## Configuration Model
Configuration sources precedence:
1. CLI flags
2. environment variables
3. config file
4. defaults

Required configuration domains:
- storage paths
- key management mode
- policy profile defaults
- logging verbosity
- verifier strictness
- UI/API bind address

## Environment Variables
Define and document:
- `COC_HOME`
- `COC_CONFIG_PATH`
- `COC_LOG_LEVEL`
- `COC_POLICY_PROFILE`
- `COC_API_HOST`
- `COC_API_PORT`

## Filesystem and Permission Controls
- `.coc/keys` must be readable only by process owner.
- Artifact and trace directories must disallow world-write permissions.
- Temporary files must be written under controlled temp directory and cleaned on completion.

## Observability Model

### Logging
- Structured JSON logs in all non-interactive modes.
- Minimum fields:
  - timestamp
  - level
  - component
  - trace_id
  - event_id
  - operation
  - duration_ms
  - outcome

### Metrics
Expose local metrics endpoint or file export with:
- trace runs count
- verification success/failure count
- signature failure count
- chain break count
- artifact dedup ratio
- average verification latency

### Audit Events
Record operational security events:
- key creation
- key rotation
- key revocation
- integrity scanner failures
- policy profile overrides

## Security Controls

### Integrity Controls
- Mandatory canonicalization before signing.
- Mandatory signature checks in verifier.
- Mandatory chain continuity checks.
- Immutable append-only event log policy.

### Access Controls
- Role-based emission rules enforced by protocol layer.
- Sensitive operations require explicit policy approval events.
- Viewer endpoints exposing artifact content must enforce redaction policy.

### Privacy Controls
- Artifact redaction policy levels: none, partial, strict.
- Redacted material must keep provenance metadata.
- Human reports must avoid raw sensitive payload display.

## Incident Response Workflow
1. Detect failure via verifier or scanner.
2. Tag affected trace as suspect.
3. Generate forensic report snapshot.
4. Rotate impacted keys if compromise suspected.
5. Preserve immutable evidence for investigation.

## Backup and Recovery
- Backup immutable trace and artifact directories on schedule.
- Restore process must preserve original paths and hashes.
- Post-restore verification run is mandatory before system acceptance.

## Upgrade and Compatibility Policy
- Upgrades must not mutate historical ledger lines.
- Schema migration outputs are additive and versioned.
- Regression test suite must run before profile promotion.

## Operational SLO Targets
- CLI command startup under 500 milliseconds.
- Trace verification completion under 3 seconds for baseline volume.
- API availability target of 99.5 percent for local demo sessions.

## Future Operational Enhancements
- Hardware-backed key providers.
- Encrypted artifact vault.
- Remote signed backup replication.
