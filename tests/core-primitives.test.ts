import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalize, ensureAgentKey, signBytes, verifyBytes } from "@coc/crypto";
import { ArtifactStore, ensureCocLayout } from "@coc/store";

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

describe("core primitives", () => {
  it("canonicalizes object keys deterministically", () => {
    const left = canonicalize({ b: 2, a: [3, { z: "x", y: "n" }] });
    const right = canonicalize({ a: [3, { y: "n", z: "x" }], b: 2 });
    expect(left).toBe(right);
    expect(left).toBe("{\"a\":[3,{\"y\":\"n\",\"z\":\"x\"}],\"b\":2}");
  });

  it("signs and verifies bytes with ed25519 keys", () => {
    const cocHome = mkdtempSync(join(tmpdir(), "coc-crypto-"));
    ensureCocLayout(cocHome);
    const material = ensureAgentKey({
      cocHome,
      agentId: "planner-agent",
      displayName: "Planner Agent",
      roleCapabilities: ["planner"]
    });
    const bytes = Buffer.from("signed-content", "utf8");
    const signature = signBytes(material.private_key_pem, bytes);
    expect(verifyBytes(material.public_key_pem, bytes, signature)).toBe(true);
    rmSync(cocHome, { recursive: true, force: true });
  });

  it("deduplicates identical artifacts by hash", () => {
    const cocHome = mkdtempSync(join(tmpdir(), "coc-artifacts-"));
    const store = new ArtifactStore(cocHome);
    const bytes = Buffer.from("{\"hello\":\"world\"}", "utf8");
    const first = store.writeArtifact({
      trace_id: "01JZ5G4JYV7RS6P7Q1R66RHCQW",
      producer_event_id: "01JZ5G4JYV7RS6P7Q1R66RHCQX",
      bytes,
      media_type: "application/json",
      encoding: "utf-8"
    });
    const second = store.writeArtifact({
      trace_id: "01JZ5G4JYV7RS6P7Q1R66RHCQZ",
      producer_event_id: "01JZ5G4JYV7RS6P7Q1R66RHCRA",
      bytes,
      media_type: "application/json",
      encoding: "utf-8"
    });

    expect(first.artifact_hash).toBe(second.artifact_hash);
    const allFiles = walk(join(cocHome, "artifacts"));
    const blobs = allFiles.filter((file) => file.endsWith(".blob"));
    expect(blobs).toHaveLength(1);
    rmSync(cocHome, { recursive: true, force: true });
  });
});
