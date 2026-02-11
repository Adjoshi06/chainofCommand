import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import Fastify from "fastify";

import { HEX_64_REGEX } from "@coc/contracts";
import { ArtifactStore, resolveCocHome, TraceLedger, TraceStore, traceReportsDirectory } from "@coc/store";
import { verifyTrace } from "@coc/verifier";

const cocHome = resolveCocHome();
const traceStore = new TraceStore(cocHome);
const ledger = new TraceLedger(cocHome);
const artifactStore = new ArtifactStore(cocHome);

const encodeCursor = (offset: number): string => Buffer.from(String(offset), "utf8").toString("base64url");
const decodeCursor = (cursor?: string): number => {
  if (!cursor) {
    return 0;
  }
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const value = Number.parseInt(decoded, 10);
  return Number.isNaN(value) ? 0 : Math.max(0, value);
};

const reportPath = (traceId: string, reportId: string): string =>
  resolve(traceReportsDirectory(cocHome, traceId), `${reportId}.json`);

const app = Fastify({ logger: true });

app.get("/api/traces", async () => {
  const traces = traceStore.listTraces().map((trace) => {
    const latestPath = resolve(cocHome, "traces", trace.trace_id, "verification.latest.json");
    const latest = existsSync(latestPath)
      ? (JSON.parse(readFileSync(latestPath, "utf8")) as { verification_status?: string })
      : undefined;
    return {
      trace_id: trace.trace_id,
      task_id: trace.task_id,
      started_at: trace.started_at,
      ended_at: trace.ended_at ?? null,
      status: trace.status,
      verification_verdict: latest?.verification_status ?? null,
      participant_roles: trace.participants.map((participant) => participant.role)
    };
  });
  return { items: traces };
});

app.get<{ Params: { trace_id: string } }>("/api/traces/:trace_id", async (request) => {
  const trace = traceStore.loadTrace(request.params.trace_id);
  return {
    ...trace,
    head_event_hash: trace.head_event_hash
  };
});

app.get<{
  Params: { trace_id: string };
  Querystring: { cursor?: string; limit?: string; type?: string; role?: string };
}>("/api/traces/:trace_id/events", async (request) => {
  const traceId = request.params.trace_id;
  const offset = decodeCursor(request.query.cursor);
  const limit = Math.min(Number.parseInt(request.query.limit ?? "100", 10) || 100, 1000);
  const typeFilter = request.query.type;
  const roleFilter = request.query.role;

  let events = ledger.readEvents(traceId, true);
  if (typeFilter) {
    events = events.filter((event) => event.event_type === typeFilter);
  }
  if (roleFilter) {
    events = events.filter((event) => event.actor.role === roleFilter);
  }

  const items = events.slice(offset, offset + limit).map((event, index) => ({
    cursor: encodeCursor(offset + index + 1),
    ...event
  }));

  const nextOffset = offset + items.length;
  return {
    items,
    next_cursor: nextOffset < events.length ? encodeCursor(nextOffset) : null
  };
});

app.get<{ Params: { trace_id: string; event_id: string } }>(
  "/api/traces/:trace_id/events/:event_id",
  async (request, reply) => {
    const event = ledger
      .readEvents(request.params.trace_id, true)
      .find((entry) => entry.event_id === request.params.event_id);

    if (!event) {
      return reply.status(404).send({ error: "event_not_found" });
    }
    return event;
  }
);

app.get<{ Params: { artifact_hash: string } }>("/api/artifacts/:artifact_hash/metadata", async (request, reply) => {
  const artifactHash = request.params.artifact_hash;
  if (!HEX_64_REGEX.test(artifactHash)) {
    return reply.status(400).send({ error: "invalid_artifact_hash" });
  }
  const descriptor = artifactStore.readDescriptor(artifactHash);
  if (!descriptor) {
    return reply.status(404).send({ error: "artifact_not_found" });
  }
  return descriptor;
});

app.get<{ Params: { trace_id: string } }>("/api/traces/:trace_id/reports/latest", async (request, reply) => {
  const latestPath = resolve(cocHome, "traces", request.params.trace_id, "verification.latest.json");
  if (!existsSync(latestPath)) {
    return reply.status(404).send({ error: "report_not_found" });
  }
  return JSON.parse(readFileSync(latestPath, "utf8"));
});

app.get<{ Params: { trace_id: string; report_id: string } }>(
  "/api/traces/:trace_id/reports/:report_id",
  async (request, reply) => {
    const path = reportPath(request.params.trace_id, request.params.report_id);
    if (!existsSync(path)) {
      return reply.status(404).send({ error: "report_not_found" });
    }
    return JSON.parse(readFileSync(path, "utf8"));
  }
);

app.post<{ Params: { trace_id: string } }>("/api/traces/:trace_id/verify", async (request) => {
  const result = verifyTrace({
    coc_home: cocHome,
    trace_id: request.params.trace_id
  });
  return result.report;
});

const host = process.env.COC_API_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.COC_API_PORT ?? "4310", 10);

app
  .listen({ host, port })
  .then(() => {
    app.log.info({ host, port }, "trace api ready");
  })
  .catch((error) => {
    app.log.error(error, "failed to start api");
    process.exit(1);
  });
