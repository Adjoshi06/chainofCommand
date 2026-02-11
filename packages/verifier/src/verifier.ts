import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkCatalog,
  eventTypeSchema,
  failureCodeSchema,
  GENESIS_PREV_HASH,
  newReportId,
  nowIso,
  policyProfileSchema,
  protocolEventSchema,
  requiredSignedEventTypes,
  rolePolicy,
  verificationReportSchema,
  type CheckId,
  type FailureCode,
  type PolicyProfile,
  type ProtocolEvent,
  type Severity,
  type VerificationCheck,
  type VerificationFailure,
  type VerificationReport,
  type VerificationWarning
} from "@coc/contracts";
import {
  canonicalSignedBytes,
  computeEventHash,
  resolveIdentityByKeyId,
  resolvePublicKeyByKeyId,
  sha256Hex,
  verifyBytes
} from "@coc/crypto";
import { renderHumanReport } from "@coc/reporting";
import {
  ArtifactStore,
  TraceLedger,
  TraceStore,
  traceLatestReportPath,
  traceReportsDirectory
} from "@coc/store";

type VerifyInput = {
  coc_home: string;
  trace_id: string;
  policy_profile?: PolicyProfile;
  write_reports?: boolean;
  report_id?: string;
  allow_incomplete_finalization?: boolean;
};

type FailureBuilder = {
  code: FailureCode;
  severity: Severity;
  check_id: CheckId;
  message: string;
  suggested_action: string;
  event_id?: string;
  artifact_hash?: string;
};

const failure = (input: FailureBuilder): VerificationFailure => ({
  failure_code: failureCodeSchema.parse(input.code),
  severity: input.severity,
  ...(input.event_id ? { event_id: input.event_id } : {}),
  ...(input.artifact_hash ? { artifact_hash: input.artifact_hash } : {}),
  message: input.message,
  suggested_action: input.suggested_action,
  detected_at: nowIso(),
  description: input.message,
  verification_step: input.check_id,
  recommended_remediation: input.suggested_action
});

const warning = (input: {
  warning_code: string;
  severity: Severity;
  message: string;
  event_id?: string;
}): VerificationWarning => ({
  warning_code: input.warning_code,
  severity: input.severity,
  message: input.message,
  ...(input.event_id ? { event_id: input.event_id } : {}),
  detected_at: nowIso()
});

const startCheck = (
  checks: VerificationCheck[],
  checkId: CheckId,
  scope: string,
  evidence: string[],
  operation: () => "pass" | "warning" | "fail"
): void => {
  const startedAt = performance.now();
  const status = operation();
  const elapsedMs = performance.now() - startedAt;
  checks.push({
    check_id: checkId,
    name: checkId,
    status,
    scope,
    evidence,
    elapsed_ms: elapsedMs
  });
};

export type VerifyOutput = {
  report: VerificationReport;
  report_json_path?: string;
  report_text_path?: string;
};

export const verifyTrace = (input: VerifyInput): VerifyOutput => {
  const traceStore = new TraceStore(input.coc_home);
  const ledger = new TraceLedger(input.coc_home);
  const artifactStore = new ArtifactStore(input.coc_home);
  const trace = traceStore.loadTrace(input.trace_id);
  const policyProfile = policyProfileSchema.parse(input.policy_profile ?? trace.policy_profile);
  const events = ledger.readEvents(input.trace_id, true);

  const checks: VerificationCheck[] = [];
  const failures: VerificationFailure[] = [];
  const warnings: VerificationWarning[] = [];

  const schemaValidEvents = new Set<string>();
  const signatureValidEvents = new Set<string>();
  const existingArtifacts = new Set<string>();
  const artifactHashValid = new Set<string>();

  const verificationStartedAt = performance.now();

  startCheck(
    checks,
    "CHK_SCHEMA_CONFORMANCE",
    `events:${events.length}`,
    [],
    () => {
      const seenEventIds = new Set<string>();
      for (const event of events) {
        const parsed = protocolEventSchema.safeParse(event);
        if (!parsed.success) {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_SCHEMA_CONFORMANCE",
              event_id: event.event_id,
              message: `Event failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
              suggested_action: "Inspect event payload and regenerate trace."
            })
          );
          continue;
        }

        if (seenEventIds.has(event.event_id)) {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_SCHEMA_CONFORMANCE",
              event_id: event.event_id,
              message: "Duplicate event_id detected (anti-replay guard).",
              suggested_action: "Remove replayed event and rerun protocol."
            })
          );
          continue;
        }

        seenEventIds.add(event.event_id);
        schemaValidEvents.add(event.event_id);

        if (event.trace_id !== input.trace_id) {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_SCHEMA_CONFORMANCE",
              event_id: event.event_id,
              message: `Event trace_id mismatch. expected=${input.trace_id} actual=${event.trace_id}`,
              suggested_action: "Remove replayed event from other traces."
            })
          );
        }

        const parsedEventType = eventTypeSchema.safeParse(event.event_type);
        if (!parsedEventType.success) {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_SCHEMA_CONFORMANCE",
              event_id: event.event_id,
              message: `Unknown event type: ${event.event_type}`,
              suggested_action: "Upgrade reader or reject unsupported event schema."
            })
          );
        }
      }
      return failures.some((entry) => entry.verification_step === "CHK_SCHEMA_CONFORMANCE")
        ? "fail"
        : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_EVENT_HASH_INTEGRITY",
    `events:${events.length}`,
    [],
    () => {
      for (const event of events) {
        const { event_hash: _eventHash, ...withoutHash } = event;
        const recomputed = computeEventHash(withoutHash as Omit<ProtocolEvent, "event_hash">);
        if (recomputed !== event.event_hash) {
          failures.push(
            failure({
              code: "HASH_MISMATCH",
              severity: "critical",
              check_id: "CHK_EVENT_HASH_INTEGRITY",
              event_id: event.event_id,
              message: `Event hash mismatch. expected=${event.event_hash} actual=${recomputed}`,
              suggested_action: "Restore immutable ledger from trusted backup."
            })
          );
        }
      }

      return failures.some((entry) => entry.verification_step === "CHK_EVENT_HASH_INTEGRITY")
        ? "fail"
        : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_CHAIN_CONTINUITY",
    `events:${events.length}`,
    [],
    () => {
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index] as ProtocolEvent;
        const expectedPrev = index === 0 ? GENESIS_PREV_HASH : events[index - 1]?.event_hash;
        if (event.prev_event_hash !== expectedPrev) {
          failures.push(
            failure({
              code: "CHAIN_BREAK",
              severity: "critical",
              check_id: "CHK_CHAIN_CONTINUITY",
              event_id: event.event_id,
              message: `prev_event_hash mismatch at index ${index}. expected=${expectedPrev} actual=${event.prev_event_hash}`,
              suggested_action: "Identify first broken line and restore from last trusted checkpoint."
            })
          );
          break;
        }
      }

      return failures.some((entry) => entry.verification_step === "CHK_CHAIN_CONTINUITY")
        ? "fail"
        : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_SIGNATURE_VALIDITY",
    `events:${events.length}`,
    [],
    () => {
      for (const event of events) {
        if (!requiredSignedEventTypes.has(event.event_type)) {
          continue;
        }

        if (!event.signature) {
          failures.push(
            failure({
              code: "SIG_MISSING",
              severity: "critical",
              check_id: "CHK_SIGNATURE_VALIDITY",
              event_id: event.event_id,
              message: "Required signature is missing.",
              suggested_action: "Reject event and rerun protocol step with signing enabled."
            })
          );
          continue;
        }

        const publicKey = resolvePublicKeyByKeyId(input.coc_home, event.actor.key_id);
        if (!publicKey) {
          failures.push(
            failure({
              code: "SIG_INVALID",
              severity: "critical",
              check_id: "CHK_SIGNATURE_VALIDITY",
              event_id: event.event_id,
              message: `Public key not found for key_id=${event.actor.key_id}.`,
              suggested_action: "Restore key registry and rerun verification."
            })
          );
          continue;
        }

        const valid = verifyBytes(publicKey, canonicalSignedBytes(event), event.signature);
        if (!valid) {
          failures.push(
            failure({
              code: "SIG_INVALID",
              severity: "critical",
              check_id: "CHK_SIGNATURE_VALIDITY",
              event_id: event.event_id,
              message: "Signature validation failed for signed event.",
              suggested_action: "Treat trace as tampered and rotate impacted keys."
            })
          );
          continue;
        }

        signatureValidEvents.add(event.event_id);
      }
      return failures.some((entry) => entry.verification_step === "CHK_SIGNATURE_VALIDITY")
        ? "fail"
        : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_KEY_STATUS",
    `events:${events.length}`,
    [],
    () => {
      for (const event of events) {
        const identity = resolveIdentityByKeyId(input.coc_home, event.actor.key_id);
        if (!identity) {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_KEY_STATUS",
              event_id: event.event_id,
              message: `Actor key_id not found in registry: ${event.actor.key_id}`,
              suggested_action: "Reconcile key registry with trace participants."
            })
          );
          continue;
        }

        if (identity.agent_id !== event.actor.agent_id) {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_KEY_STATUS",
              event_id: event.event_id,
              message: "Actor agent_id does not match key registry identity.",
              suggested_action: "Reject mismatched event and reissue with correct key."
            })
          );
          continue;
        }

        if (identity.status === "revoked" && identity.revoked_at && event.created_at >= identity.revoked_at) {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_KEY_STATUS",
              event_id: event.event_id,
              message: "Event signed with revoked key after revocation timestamp.",
              suggested_action: "Invalidate event and rotate key material."
            })
          );
        }
      }

      return failures.some((entry) => entry.verification_step === "CHK_KEY_STATUS") ? "fail" : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_ARTIFACT_EXISTENCE",
    `events:${events.length}`,
    [],
    () => {
      for (const event of events) {
        for (const descriptor of event.artifacts) {
          if (!artifactStore.hasArtifact(descriptor.artifact_hash)) {
            failures.push(
              failure({
                code: "ARTIFACT_MISSING",
                severity: "high",
                check_id: "CHK_ARTIFACT_EXISTENCE",
                event_id: event.event_id,
                artifact_hash: descriptor.artifact_hash,
                message: "Referenced artifact blob missing from content-addressed store.",
                suggested_action: "Restore artifact blob from backup or regenerate trace."
              })
            );
            continue;
          }
          existingArtifacts.add(descriptor.artifact_hash);
        }
      }
      return failures.some((entry) => entry.verification_step === "CHK_ARTIFACT_EXISTENCE")
        ? "fail"
        : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_ARTIFACT_HASH_MATCH",
    `artifacts:${existingArtifacts.size}`,
    [],
    () => {
      for (const artifactHash of existingArtifacts) {
        const bytes = artifactStore.readArtifact(artifactHash);
        if (!bytes) {
          continue;
        }
        const recomputed = sha256Hex(bytes);
        if (recomputed !== artifactHash) {
          failures.push(
            failure({
              code: "ARTIFACT_HASH_MISMATCH",
              severity: "high",
              check_id: "CHK_ARTIFACT_HASH_MATCH",
              artifact_hash: artifactHash,
              message: `Artifact bytes do not match descriptor hash. expected=${artifactHash} actual=${recomputed}`,
              suggested_action: "Replace corrupted blob with immutable source copy."
            })
          );
          continue;
        }
        artifactHashValid.add(artifactHash);
      }

      return failures.some((entry) => entry.verification_step === "CHK_ARTIFACT_HASH_MATCH")
        ? "fail"
        : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_CLAIM_EVIDENCE_SUFFICIENCY",
    `claims:${events.filter((event) => event.event_type === "claim_issued").length}`,
    [],
    () => {
      const challengedClaims = new Map<string, ProtocolEvent>();
      for (const event of events) {
        if (event.event_type === "claim_challenged") {
          const challengedClaimId = (event.payload as { challenged_claim_id?: string }).challenged_claim_id;
          if (challengedClaimId) {
            challengedClaims.set(challengedClaimId, event);
          }
        }
      }

      for (const event of events) {
        if (event.event_type !== "claim_issued") {
          continue;
        }
        const payload = event.payload as {
          claim_id?: string;
          evidence_artifacts?: string[];
          resolved?: boolean;
        };
        const claimId = payload.claim_id ?? event.claims[0];
        const evidenceArtifacts = payload.evidence_artifacts ?? event.artifacts.map((item) => item.artifact_hash);

        if (!claimId || evidenceArtifacts.length === 0) {
          failures.push(
            failure({
              code: "CLAIM_UNPROVEN",
              severity: "high",
              check_id: "CHK_CLAIM_EVIDENCE_SUFFICIENCY",
              event_id: event.event_id,
              message: "Claim has no evidence artifact references.",
              suggested_action: "Attach artifact evidence before issuing claim."
            })
          );
          continue;
        }

        const evidenceOk = evidenceArtifacts.every((artifactHash) => artifactHashValid.has(artifactHash));
        if (!evidenceOk || !signatureValidEvents.has(event.event_id)) {
          failures.push(
            failure({
              code: "CLAIM_UNPROVEN",
              severity: "high",
              check_id: "CHK_CLAIM_EVIDENCE_SUFFICIENCY",
              event_id: event.event_id,
              message: "Claim evidence set is incomplete or invalid.",
              suggested_action: "Reissue claim after restoring artifact and signature integrity."
            })
          );
        }

        const challengeEvent = challengedClaims.get(claimId);
        if (challengeEvent && payload.resolved !== true) {
          if (policyProfile === "strict") {
            failures.push(
              failure({
                code: "CLAIM_UNPROVEN",
                severity: "high",
                check_id: "CHK_CLAIM_EVIDENCE_SUFFICIENCY",
                event_id: challengeEvent.event_id,
                message: `Claim ${claimId} is disputed and unresolved under strict policy.`,
                suggested_action: "Resolve or retract disputed claim."
              })
            );
          } else {
            warnings.push(
              warning({
                warning_code: "CLAIM_DISPUTED",
                severity: "medium",
                event_id: challengeEvent.event_id,
                message: `Claim ${claimId} remains disputed.`
              })
            );
          }
        }
      }

      const hasFailure = failures.some(
        (entry) => entry.verification_step === "CHK_CLAIM_EVIDENCE_SUFFICIENCY"
      );
      if (hasFailure) {
        return "fail";
      }
      return warnings.some((entry) => entry.warning_code === "CLAIM_DISPUTED") ? "warning" : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_ROLE_POLICY_CONFORMANCE",
    `events:${events.length}`,
    [],
    () => {
      for (const event of events) {
        if (!rolePolicy[event.actor.role]?.has(event.event_type)) {
          failures.push(
            failure({
              code: "ROLE_POLICY_VIOLATION",
              severity: "medium",
              check_id: "CHK_ROLE_POLICY_CONFORMANCE",
              event_id: event.event_id,
              message: `Role ${event.actor.role} emitted disallowed event ${event.event_type}.`,
              suggested_action: "Correct role assignment and rerun workflow."
            })
          );
        }
      }
      return failures.some((entry) => entry.verification_step === "CHK_ROLE_POLICY_CONFORMANCE")
        ? "fail"
        : "pass";
    }
  );

  startCheck(
    checks,
    "CHK_FINALIZATION_INTEGRITY",
    `events:${events.length}`,
    [],
    () => {
      const finalStatementIndex = events.findIndex(
        (event) => event.event_type === "final_statement_signed"
      );
      const verificationCompletedIndex = events.findIndex(
        (event) => event.event_type === "verification_run_completed"
      );
      const verificationStartedIndex = events.findIndex(
        (event) => event.event_type === "verification_run_started"
      );

      if (finalStatementIndex < 0) {
        failures.push(
          failure({
            code: "SCHEMA_INVALID",
            severity: "medium",
            check_id: "CHK_FINALIZATION_INTEGRITY",
            message: "Missing final_statement_signed event.",
            suggested_action: "Emit final statement before verification."
          })
        );
      }
      if (verificationStartedIndex < 0) {
        failures.push(
          failure({
            code: "SCHEMA_INVALID",
            severity: "medium",
            check_id: "CHK_FINALIZATION_INTEGRITY",
            message: "Missing verification_run_started event.",
            suggested_action: "Record verification run start event."
          })
        );
      }
      if (verificationCompletedIndex < 0) {
        if (input.allow_incomplete_finalization) {
          warnings.push(
            warning({
              warning_code: "FINALIZATION_INCOMPLETE",
              severity: "low",
              message: "verification_run_completed not present in current snapshot."
            })
          );
        } else {
          failures.push(
            failure({
              code: "SCHEMA_INVALID",
              severity: "medium",
              check_id: "CHK_FINALIZATION_INTEGRITY",
              message: "Missing verification_run_completed event.",
              suggested_action: "Record verification completion event."
            })
          );
        }
      }
      if (finalStatementIndex >= 0 && verificationCompletedIndex >= 0 && finalStatementIndex > verificationCompletedIndex) {
        failures.push(
          failure({
            code: "ROLE_POLICY_VIOLATION",
            severity: "medium",
            check_id: "CHK_FINALIZATION_INTEGRITY",
            event_id: events[finalStatementIndex]?.event_id,
            message: "final_statement_signed occurs after verification completion.",
            suggested_action: "Move final statement before verification completion."
          })
        );
      }

      if (failures.some((entry) => entry.verification_step === "CHK_FINALIZATION_INTEGRITY")) {
        return "fail";
      }
      return warnings.some((entry) => entry.warning_code === "FINALIZATION_INCOMPLETE")
        ? "warning"
        : "pass";
    }
  );

  const verificationDurationMs = performance.now() - verificationStartedAt;
  const verificationStatus =
    failures.length > 0 ? "fail" : warnings.length > 0 ? "pass-with-warnings" : "pass";

  const reportId = input.report_id ?? newReportId();
  const report: VerificationReport = verificationReportSchema.parse({
    schema_version: trace.schema_version,
    report_id: reportId,
    trace_id: trace.trace_id,
    verified_at: nowIso(),
    verification_status: verificationStatus,
    summary:
      verificationStatus === "pass"
        ? "All required checks passed."
        : verificationStatus === "pass-with-warnings"
          ? "Integrity checks passed with warnings."
          : "Verification failed with one or more integrity failures.",
    checks,
    failures,
    warnings,
    metrics: {
      event_count: events.length,
      artifact_reference_count: events.reduce((sum, event) => sum + event.artifacts.length, 0),
      verification_duration_ms: verificationDurationMs
    },
    policy_profile: policyProfile
  });

  if (input.write_reports ?? true) {
    const reportsDir = traceReportsDirectory(input.coc_home, input.trace_id);
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    const reportJsonPath = join(reportsDir, `${report.report_id}.json`);
    const reportTextPath = join(reportsDir, `${report.report_id}.txt`);
    writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf8");
    writeFileSync(reportTextPath, renderHumanReport(report), "utf8");
    writeFileSync(traceLatestReportPath(input.coc_home, input.trace_id), JSON.stringify(report, null, 2), "utf8");

    return {
      report,
      report_json_path: reportJsonPath,
      report_text_path: reportTextPath
    };
  }

  return { report };
};

export const requiredChecks = checkCatalog;
