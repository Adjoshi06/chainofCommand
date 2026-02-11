import { ulid } from "ulid";
import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0";
export const GENESIS_PREV_HASH = "0".repeat(64);
export const HASH_ALGORITHM = "sha256";
export const SIGNATURE_ALGORITHM = "ed25519";

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const HEX_64_REGEX = /^[a-f0-9]{64}$/;
export const ISO_UTC_MS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const roleSchema = z.enum(["planner", "executor", "critic", "auditor"]);
export type Role = z.infer<typeof roleSchema>;

export const keyStatusSchema = z.enum(["active", "rotated", "revoked"]);
export type KeyStatus = z.infer<typeof keyStatusSchema>;

export const traceStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "aborted",
  "tampered"
]);
export type TraceStatus = z.infer<typeof traceStatusSchema>;

export const policyProfileSchema = z.enum(["strict", "default", "lenient"]);
export type PolicyProfile = z.infer<typeof policyProfileSchema>;

export const verificationStatusSchema = z.enum(["pass", "pass-with-warnings", "fail"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const eventTypeSchema = z.enum([
  "session_initialized",
  "proposal_created",
  "proposal_reviewed",
  "tool_intent_signed",
  "tool_execution_started",
  "tool_execution_completed",
  "tool_execution_failed",
  "artifact_recorded",
  "claim_issued",
  "claim_challenged",
  "final_statement_signed",
  "verification_run_started",
  "verification_run_completed"
]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const requiredSignedEventTypes = new Set<EventType>([
  "proposal_created",
  "tool_intent_signed",
  "claim_issued",
  "claim_challenged",
  "final_statement_signed",
  "verification_run_completed"
]);

export const failureCodeSchema = z.enum([
  "SIG_INVALID",
  "SIG_MISSING",
  "CHAIN_BREAK",
  "HASH_MISMATCH",
  "ARTIFACT_MISSING",
  "ARTIFACT_HASH_MISMATCH",
  "CLAIM_UNPROVEN",
  "ROLE_POLICY_VIOLATION",
  "SCHEMA_INVALID"
]);
export type FailureCode = z.infer<typeof failureCodeSchema>;

export const severitySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof severitySchema>;

export const actorSchema = z
  .object({
    agent_id: z.string().min(1).regex(/^[a-z0-9._-]+$/),
    role: roleSchema,
    key_id: z.string().min(1).regex(/^[a-z0-9._-]+$/)
  })
  .passthrough();
export type Actor = z.infer<typeof actorSchema>;

export const agentIdentitySchema = z
  .object({
    agent_id: z.string().min(1).regex(/^[a-z0-9._-]+$/),
    display_name: z.string().min(1),
    role_capabilities: z.array(roleSchema).min(1),
    key_id: z.string().min(1).regex(/^[a-z0-9._-]+$/),
    public_key: z.string().min(1),
    key_algorithm: z.literal(SIGNATURE_ALGORITHM),
    status: keyStatusSchema,
    created_at: z.string().regex(ISO_UTC_MS_REGEX),
    updated_at: z.string().regex(ISO_UTC_MS_REGEX),
    revoked_at: z.string().regex(ISO_UTC_MS_REGEX).optional(),
    revoked_reason: z.string().optional()
  })
  .passthrough();
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;

export const signatureSchema = z
  .object({
    algorithm: z.literal(SIGNATURE_ALGORITHM),
    signature_b64: z.string().min(1),
    signed_bytes_hash: z.string().regex(HEX_64_REGEX)
  })
  .passthrough();
export type SignatureEnvelope = z.infer<typeof signatureSchema>;

export const artifactDescriptorSchema = z
  .object({
    artifact_hash: z.string().regex(HEX_64_REGEX),
    hash_algorithm: z.literal(HASH_ALGORITHM),
    media_type: z.string().min(1),
    encoding: z.string().min(1),
    byte_size: z.number().int().nonnegative(),
    created_at: z.string().regex(ISO_UTC_MS_REGEX),
    producer_event_id: z.string().regex(ULID_REGEX),
    storage_uri: z.string().min(1),
    redaction_status: z.enum(["none", "redacted", "redacted-with-pointer"]),
    trace_id: z.string().regex(ULID_REGEX).optional(),
    integrity_verified_at: z.string().regex(ISO_UTC_MS_REGEX).optional()
  })
  .passthrough();
export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>;

export const claimSchema = z
  .object({
    claim_id: z.string().regex(/^claim_[0-9A-HJKMNP-TV-Z]{26}$/),
    claim_text: z.string().min(1),
    confidence: z.number().min(0).max(1),
    evidence_artifacts: z.array(z.string().regex(HEX_64_REGEX)),
    challenged: z.boolean().optional(),
    resolved: z.boolean().optional()
  })
  .passthrough();
export type Claim = z.infer<typeof claimSchema>;

export const protocolEventSchema = z
  .object({
    schema_version: z.string().min(1),
    trace_id: z.string().regex(ULID_REGEX),
    event_id: z.string().regex(ULID_REGEX),
    event_type: eventTypeSchema,
    created_at: z.string().regex(ISO_UTC_MS_REGEX),
    actor: actorSchema,
    payload_hash: z.string().regex(HEX_64_REGEX),
    prev_event_hash: z.string().regex(HEX_64_REGEX),
    event_hash: z.string().regex(HEX_64_REGEX),
    signature: signatureSchema,
    payload_type: z.string().min(1),
    payload: z.unknown(),
    claims: z.array(z.string().regex(/^claim_[0-9A-HJKMNP-TV-Z]{26}$/)),
    artifacts: z.array(artifactDescriptorSchema)
  })
  .passthrough();
export type ProtocolEvent = z.infer<typeof protocolEventSchema>;

export const traceParticipantSchema = z
  .object({
    agent_id: z.string().regex(/^[a-z0-9._-]+$/),
    role: roleSchema,
    key_id: z.string().regex(/^[a-z0-9._-]+$/)
  })
  .passthrough();
export type TraceParticipant = z.infer<typeof traceParticipantSchema>;

export const traceSessionSchema = z
  .object({
    schema_version: z.string().min(1),
    trace_id: z.string().regex(ULID_REGEX),
    task_id: z.string().min(1).regex(/^[a-z0-9._-]+$/),
    started_at: z.string().regex(ISO_UTC_MS_REGEX),
    ended_at: z.string().regex(ISO_UTC_MS_REGEX).optional(),
    status: traceStatusSchema,
    participants: z.array(traceParticipantSchema).min(3),
    head_event_hash: z.string().regex(HEX_64_REGEX),
    event_count: z.number().int().nonnegative(),
    artifact_count: z.number().int().nonnegative(),
    policy_profile: policyProfileSchema,
    tool_versions: z.record(z.string()).optional(),
    config_fingerprint: z.string().regex(HEX_64_REGEX).optional()
  })
  .passthrough();
export type TraceSession = z.infer<typeof traceSessionSchema>;

export const verificationCheckSchema = z
  .object({
    check_id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["pass", "warning", "fail"]),
    scope: z.string().min(1),
    evidence: z.array(z.string()),
    elapsed_ms: z.number().nonnegative()
  })
  .passthrough();
export type VerificationCheck = z.infer<typeof verificationCheckSchema>;

export const verificationFailureSchema = z
  .object({
    failure_code: failureCodeSchema,
    severity: severitySchema,
    event_id: z.string().regex(ULID_REGEX).optional(),
    artifact_hash: z.string().regex(HEX_64_REGEX).optional(),
    message: z.string().min(1),
    suggested_action: z.string().min(1),
    detected_at: z.string().regex(ISO_UTC_MS_REGEX),
    description: z.string().min(1),
    verification_step: z.string().min(1),
    recommended_remediation: z.string().min(1)
  })
  .passthrough();
export type VerificationFailure = z.infer<typeof verificationFailureSchema>;

export const verificationWarningSchema = z
  .object({
    warning_code: z.string().min(1),
    severity: severitySchema,
    event_id: z.string().regex(ULID_REGEX).optional(),
    message: z.string().min(1),
    detected_at: z.string().regex(ISO_UTC_MS_REGEX)
  })
  .passthrough();
export type VerificationWarning = z.infer<typeof verificationWarningSchema>;

export const verificationReportSchema = z
  .object({
    schema_version: z.string().min(1),
    report_id: z.string().regex(ULID_REGEX),
    trace_id: z.string().regex(ULID_REGEX),
    verified_at: z.string().regex(ISO_UTC_MS_REGEX),
    verification_status: verificationStatusSchema,
    summary: z.string().min(1),
    checks: z.array(verificationCheckSchema),
    failures: z.array(verificationFailureSchema),
    warnings: z.array(verificationWarningSchema),
    metrics: z.record(z.union([z.string(), z.number(), z.boolean()])),
    policy_profile: policyProfileSchema
  })
  .passthrough();
export type VerificationReport = z.infer<typeof verificationReportSchema>;

export const taskSchema = z
  .object({
    task_id: z.string().min(1).regex(/^[a-z0-9._-]+$/),
    objective: z.string().min(1),
    input_artifacts: z.array(z.string()),
    constraints: z.array(z.string()),
    policy_profile: policyProfileSchema,
    requested_roles: z.array(roleSchema).min(3),
    time_budget_seconds: z.number().int().positive().optional(),
    max_tool_calls: z.number().int().positive().optional(),
    sensitivity_level: z.string().optional(),
    tags: z.array(z.string()).optional()
  })
  .passthrough();
export type TaskSpec = z.infer<typeof taskSchema>;

export const rolePolicy: Record<Role, Set<EventType>> = {
  planner: new Set(["session_initialized", "proposal_created"]),
  executor: new Set([
    "tool_intent_signed",
    "tool_execution_started",
    "tool_execution_completed",
    "tool_execution_failed",
    "artifact_recorded",
    "claim_issued",
    "final_statement_signed"
  ]),
  critic: new Set(["proposal_reviewed", "claim_challenged"]),
  auditor: new Set(["verification_run_started", "verification_run_completed"])
};

export const checkCatalog = [
  "CHK_SCHEMA_CONFORMANCE",
  "CHK_EVENT_HASH_INTEGRITY",
  "CHK_CHAIN_CONTINUITY",
  "CHK_SIGNATURE_VALIDITY",
  "CHK_KEY_STATUS",
  "CHK_ARTIFACT_EXISTENCE",
  "CHK_ARTIFACT_HASH_MATCH",
  "CHK_CLAIM_EVIDENCE_SUFFICIENCY",
  "CHK_ROLE_POLICY_CONFORMANCE",
  "CHK_FINALIZATION_INTEGRITY"
] as const;
export type CheckId = (typeof checkCatalog)[number];

export const nowIso = (): string => new Date().toISOString();

export const newTraceId = (): string => ulid();
export const newEventId = (): string => ulid();
export const newReportId = (): string => ulid();
export const newClaimId = (): string => `claim_${ulid()}`;
