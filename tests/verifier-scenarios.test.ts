import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  newReportId,
  type PolicyProfile,
  type ProtocolEvent,
  type TaskSpec
} from "@coc/contracts";
import { ensureAgentKey } from "@coc/crypto";
import { buildSignedEvent, runProtocolFlow } from "@coc/protocol";
import {
  ArtifactStore,
  TraceLedger,
  TraceStore,
  traceEventsPath
} from "@coc/store";
import { verifyTrace } from "@coc/verifier";

const defaultTask = (): TaskSpec => ({
  task_id: "demo_task",
  objective: "Generate accountable execution proof.",
  input_artifacts: [],
  constraints: ["local-only"],
  policy_profile: "default",
  requested_roles: ["planner", "executor", "critic", "auditor"]
});

const readEvents = (cocHome: string, traceId: string): ProtocolEvent[] => {
  const path = traceEventsPath(cocHome, traceId);
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => JSON.parse(line) as ProtocolEvent);
};

const writeEvents = (cocHome: string, traceId: string, events: ProtocolEvent[]): void => {
  const path = traceEventsPath(cocHome, traceId);
  writeFileSync(path, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
};

const appendChallengeEvent = (cocHome: string, traceId: string, claimId: string): void => {
  const traceStore = new TraceStore(cocHome);
  const ledger = new TraceLedger(cocHome);
  const trace = traceStore.loadTrace(traceId);
  const critic = ensureAgentKey({
    cocHome,
    agentId: "critic-agent",
    displayName: "Critic Agent",
    roleCapabilities: ["critic"]
  });

  const event = buildSignedEvent({
    trace_id: traceId,
    event_type: "claim_challenged",
    actor: {
      agent_id: critic.identity.agent_id,
      role: "critic",
      key_id: critic.identity.key_id
    },
    payload_type: "challenge",
    payload: {
      challenged_claim_id: claimId,
      reason: "Insufficient corroborating artifacts."
    },
    claims: [claimId],
    prev_event_hash: trace.head_event_hash,
    private_key_pem: critic.private_key_pem
  });
  ledger.appendEvent(traceId, event);
};

const appendVerificationEvents = (cocHome: string, traceId: string): void => {
  const traceStore = new TraceStore(cocHome);
  const ledger = new TraceLedger(cocHome);
  const auditor = ensureAgentKey({
    cocHome,
    agentId: "auditor-agent",
    displayName: "Auditor Agent",
    roleCapabilities: ["auditor"]
  });

  const trace = traceStore.loadTrace(traceId);
  const started = buildSignedEvent({
    trace_id: traceId,
    event_type: "verification_run_started",
    actor: {
      agent_id: auditor.identity.agent_id,
      role: "auditor",
      key_id: auditor.identity.key_id
    },
    payload_type: "verification_run",
    payload: {
      policy_profile: "default"
    },
    prev_event_hash: trace.head_event_hash,
    private_key_pem: auditor.private_key_pem
  });
  ledger.appendEvent(traceId, started);

  const refreshed = traceStore.loadTrace(traceId);
  const completed = buildSignedEvent({
    trace_id: traceId,
    event_type: "verification_run_completed",
    actor: {
      agent_id: auditor.identity.agent_id,
      role: "auditor",
      key_id: auditor.identity.key_id
    },
    payload_type: "verification_report",
    payload: {
      verification_status: "pass",
      report_id: newReportId()
    },
    prev_event_hash: refreshed.head_event_hash,
    private_key_pem: auditor.private_key_pem
  });
  ledger.appendEvent(traceId, completed);
};

const setupTrace = (params?: { challenged?: boolean }): { cocHome: string; traceId: string } => {
  const cocHome = mkdtempSync(join(tmpdir(), "coc-trace-"));
  const runResult = runProtocolFlow({
    coc_home: cocHome,
    task: defaultTask()
  });
  if (params?.challenged) {
    appendChallengeEvent(cocHome, runResult.trace_id, runResult.claim_ids[0] as string);
  }
  appendVerificationEvents(cocHome, runResult.trace_id);
  return { cocHome, traceId: runResult.trace_id };
};

const failureCodes = (cocHome: string, traceId: string, policy: PolicyProfile = "default"): string[] =>
  verifyTrace({
    coc_home: cocHome,
    trace_id: traceId,
    policy_profile: policy
  }).report.failures.map((entry) => entry.failure_code);

describe("verifier tamper scenarios", () => {
  it("passes for a valid complete trace", () => {
    const { cocHome, traceId } = setupTrace();
    const report = verifyTrace({ coc_home: cocHome, trace_id: traceId }).report;
    expect(report.verification_status).toBe("pass");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects signature invalid after payload mutation", () => {
    const { cocHome, traceId } = setupTrace();
    const events = readEvents(cocHome, traceId);
    const target = events.find((event) => event.event_type === "proposal_created");
    expect(target).toBeDefined();
    if (target) {
      target.payload = { tampered: true };
      writeEvents(cocHome, traceId, events);
    }
    expect(failureCodes(cocHome, traceId)).toContain("SIG_INVALID");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects chain break after middle-event deletion", () => {
    const { cocHome, traceId } = setupTrace();
    const events = readEvents(cocHome, traceId);
    events.splice(Math.floor(events.length / 2), 1);
    writeEvents(cocHome, traceId, events);
    expect(failureCodes(cocHome, traceId)).toContain("CHAIN_BREAK");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects forged insertion with invalid prev hash", () => {
    const { cocHome, traceId } = setupTrace();
    const events = readEvents(cocHome, traceId);
    const forged = {
      ...events[1],
      event_id: "01JZ5Z4JYV7RS6P7Q1R66RHCQB",
      prev_event_hash: "f".repeat(64)
    };
    events.splice(2, 0, forged);
    writeEvents(cocHome, traceId, events);
    const codes = failureCodes(cocHome, traceId);
    expect(codes.includes("CHAIN_BREAK") || codes.includes("HASH_MISMATCH")).toBe(true);
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects missing artifact blobs", () => {
    const { cocHome, traceId } = setupTrace();
    const store = new ArtifactStore(cocHome);
    const events = readEvents(cocHome, traceId);
    const artifactHash = events.flatMap((event) => event.artifacts).at(0)?.artifact_hash;
    expect(artifactHash).toBeDefined();
    if (artifactHash) {
      unlinkSync(store.resolveBlobPath(artifactHash));
    }
    expect(failureCodes(cocHome, traceId)).toContain("ARTIFACT_MISSING");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects artifact hash mismatch after byte substitution", () => {
    const { cocHome, traceId } = setupTrace();
    const store = new ArtifactStore(cocHome);
    const events = readEvents(cocHome, traceId);
    const artifactHash = events.flatMap((event) => event.artifacts).at(0)?.artifact_hash;
    expect(artifactHash).toBeDefined();
    if (artifactHash) {
      writeFileSync(store.resolveBlobPath(artifactHash), Buffer.from("tampered-bytes", "utf8"));
    }
    expect(failureCodes(cocHome, traceId)).toContain("ARTIFACT_HASH_MISMATCH");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects claim without evidence references", () => {
    const { cocHome, traceId } = setupTrace();
    const events = readEvents(cocHome, traceId);
    const claimEvent = events.find((event) => event.event_type === "claim_issued");
    expect(claimEvent).toBeDefined();
    if (claimEvent) {
      claimEvent.payload = { ...(claimEvent.payload as object), evidence_artifacts: [] };
      claimEvent.artifacts = [];
      writeEvents(cocHome, traceId, events);
    }
    expect(failureCodes(cocHome, traceId)).toContain("CLAIM_UNPROVEN");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects unauthorized role emission", () => {
    const { cocHome, traceId } = setupTrace();
    const events = readEvents(cocHome, traceId);
    const proposal = events.find((event) => event.event_type === "proposal_created");
    expect(proposal).toBeDefined();
    if (proposal) {
      proposal.actor.role = "auditor";
      writeEvents(cocHome, traceId, events);
    }
    expect(failureCodes(cocHome, traceId)).toContain("ROLE_POLICY_VIOLATION");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("detects duplicate event replay", () => {
    const { cocHome, traceId } = setupTrace();
    const events = readEvents(cocHome, traceId);
    events.push(events[0] as ProtocolEvent);
    writeEvents(cocHome, traceId, events);
    expect(failureCodes(cocHome, traceId)).toContain("SCHEMA_INVALID");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("strict policy fails unresolved disputed claims", () => {
    const { cocHome, traceId } = setupTrace({ challenged: true });
    const report = verifyTrace({
      coc_home: cocHome,
      trace_id: traceId,
      policy_profile: "strict"
    }).report;
    expect(report.verification_status).toBe("fail");
    expect(report.failures.map((entry) => entry.failure_code)).toContain("CLAIM_UNPROVEN");
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("default policy warns unresolved disputed claims", () => {
    const { cocHome, traceId } = setupTrace({ challenged: true });
    const report = verifyTrace({
      coc_home: cocHome,
      trace_id: traceId,
      policy_profile: "default"
    }).report;
    expect(report.verification_status).toBe("pass-with-warnings");
    expect(report.warnings.map((entry) => entry.warning_code)).toContain("CLAIM_DISPUTED");
    rmSync(cocHome, { recursive: true, force: true });
  });
});
