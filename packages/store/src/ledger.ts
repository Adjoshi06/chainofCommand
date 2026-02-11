import {
  appendFileSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

import { type ProtocolEvent } from "@coc/contracts";

import {
  traceDirectory,
  traceEventsPath,
  TraceStore
} from "./trace-store.js";

const sleepSync = (milliseconds: number): void => {
  const doneAt = Date.now() + milliseconds;
  while (Date.now() < doneAt) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
};

export class TraceLedger {
  private readonly cocHome: string;
  private readonly traceStore: TraceStore;

  public constructor(cocHome: string) {
    this.cocHome = cocHome;
    this.traceStore = new TraceStore(cocHome);
  }

  private lockPath(traceId: string): string {
    return join(traceDirectory(this.cocHome, traceId), ".append.lock");
  }

  private withTraceLock<T>(traceId: string, operation: () => T): T {
    const lockPath = this.lockPath(traceId);
    const timeoutAt = Date.now() + 5000;

    while (true) {
      try {
        const fileDescriptor = openSync(lockPath, "wx");
        writeFileSync(fileDescriptor, String(process.pid), "utf8");
        closeSync(fileDescriptor);
        break;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
          throw error;
        }
        if (Date.now() >= timeoutAt) {
          throw new Error(`Timed out acquiring trace lock for ${traceId}`);
        }
        sleepSync(25);
      }
    }

    try {
      return operation();
    } finally {
      if (existsSync(lockPath)) {
        rmSync(lockPath);
      }
    }
  }

  public readEvents(traceId: string, recoverMalformedTail: boolean = true): ProtocolEvent[] {
    const filePath = traceEventsPath(this.cocHome, traceId);
    if (!existsSync(filePath)) {
      return [];
    }

    const raw = readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return [];
    }

    const lines = raw.split("\n");
    const parsed: ProtocolEvent[] = [];
    let validByteLength = 0;
    let malformedFound = false;

    for (const line of lines) {
      if (!line.trim()) {
        validByteLength += Buffer.byteLength(line, "utf8") + 1;
        continue;
      }
      try {
        const event = JSON.parse(line) as ProtocolEvent;
        parsed.push(event);
        validByteLength += Buffer.byteLength(line, "utf8") + 1;
      } catch (_error) {
        malformedFound = true;
        break;
      }
    }

    if (malformedFound && recoverMalformedTail) {
      truncateSync(filePath, Math.max(0, validByteLength - 1));
    }

    return parsed;
  }

  public appendEvent(traceId: string, event: ProtocolEvent): ProtocolEvent {
    return this.withTraceLock(traceId, () => {
      const session = this.traceStore.loadTrace(traceId);
      if (event.trace_id !== traceId) {
        throw new Error(`Trace mismatch. expected=${traceId} actual=${event.trace_id}`);
      }
      if (event.prev_event_hash !== session.head_event_hash) {
        throw new Error(
          `Chain head mismatch for ${traceId}. expected prev_event_hash=${session.head_event_hash}`
        );
      }

      const events = this.readEvents(traceId);
      const hasDuplicateEventId = events.some((existing) => existing.event_id === event.event_id);
      if (hasDuplicateEventId) {
        throw new Error(`Duplicate event_id in trace: ${event.event_id}`);
      }

      const line = `${JSON.stringify(event)}\n`;
      appendFileSync(traceEventsPath(this.cocHome, traceId), line, "utf8");
      session.head_event_hash = event.event_hash;
      session.event_count += 1;
      session.artifact_count += event.artifacts.length;
      this.traceStore.saveTrace(session);
      return event;
    });
  }
}
