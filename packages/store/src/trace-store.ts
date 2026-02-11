import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  GENESIS_PREV_HASH,
  SCHEMA_VERSION,
  nowIso,
  newTraceId,
  type PolicyProfile,
  type TraceParticipant,
  type TraceSession,
  type TraceStatus
} from "@coc/contracts";

import { ensureCocLayout } from "./layout.js";

export const traceDirectory = (cocHome: string, traceId: string): string =>
  join(cocHome, "traces", traceId);

export const traceEventsPath = (cocHome: string, traceId: string): string =>
  join(traceDirectory(cocHome, traceId), "events.jsonl");

export const traceMetaPath = (cocHome: string, traceId: string): string =>
  join(traceDirectory(cocHome, traceId), "trace.meta.json");

export const traceReportsDirectory = (cocHome: string, traceId: string): string =>
  join(traceDirectory(cocHome, traceId), "reports");

export const traceLatestReportPath = (cocHome: string, traceId: string): string =>
  join(traceDirectory(cocHome, traceId), "verification.latest.json");

type InitializeTraceInput = {
  task_id: string;
  participants: TraceParticipant[];
  policy_profile: PolicyProfile;
  trace_id?: string;
  config_fingerprint?: string;
  tool_versions?: Record<string, string>;
};

export class TraceStore {
  private readonly cocHome: string;

  public constructor(cocHome: string) {
    this.cocHome = cocHome;
    ensureCocLayout(cocHome);
  }

  public createTrace(input: InitializeTraceInput): TraceSession {
    const traceId = input.trace_id ?? newTraceId();
    const dir = traceDirectory(this.cocHome, traceId);
    const reportsDir = traceReportsDirectory(this.cocHome, traceId);
    mkdirSync(dir, { recursive: true });
    mkdirSync(reportsDir, { recursive: true });

    const startedAt = nowIso();
    const session: TraceSession = {
      schema_version: SCHEMA_VERSION,
      trace_id: traceId,
      task_id: input.task_id,
      started_at: startedAt,
      status: "running",
      participants: input.participants,
      head_event_hash: GENESIS_PREV_HASH,
      event_count: 0,
      artifact_count: 0,
      policy_profile: input.policy_profile,
      config_fingerprint: input.config_fingerprint,
      tool_versions: input.tool_versions
    };
    writeFileSync(traceMetaPath(this.cocHome, traceId), JSON.stringify(session, null, 2), "utf8");
    if (!existsSync(traceEventsPath(this.cocHome, traceId))) {
      writeFileSync(traceEventsPath(this.cocHome, traceId), "", "utf8");
    }
    return session;
  }

  public loadTrace(traceId: string): TraceSession {
    const metaPath = traceMetaPath(this.cocHome, traceId);
    if (!existsSync(metaPath)) {
      throw new Error(`Trace not found: ${traceId}`);
    }
    return JSON.parse(readFileSync(metaPath, "utf8")) as TraceSession;
  }

  public saveTrace(trace: TraceSession): void {
    writeFileSync(traceMetaPath(this.cocHome, trace.trace_id), JSON.stringify(trace, null, 2), "utf8");
  }

  public updateTraceStatus(
    traceId: string,
    status: TraceStatus,
    endedAt: string = nowIso()
  ): TraceSession {
    const trace = this.loadTrace(traceId);
    trace.status = status;
    trace.ended_at = endedAt;
    this.saveTrace(trace);
    return trace;
  }

  public listTraceIds(): string[] {
    const traceRoot = join(this.cocHome, "traces");
    if (!existsSync(traceRoot)) {
      return [];
    }
    return readdirSync(traceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  public listTraces(): TraceSession[] {
    return this.listTraceIds()
      .map((traceId) => this.loadTrace(traceId))
      .sort((left, right) => right.started_at.localeCompare(left.started_at));
  }

  public resolveTraceId(traceFileOrId: string): string {
    const candidateId = traceFileOrId.trim();
    const directPath = resolve(candidateId);

    if (existsSync(directPath)) {
      const maybeTraceDir = directPath.endsWith("events.jsonl")
        ? dirname(directPath)
        : directPath;
      const parts = maybeTraceDir.split(/[/\\]/).filter(Boolean);
      return parts[parts.length - 1] as string;
    }

    return candidateId;
  }
}
