import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  HASH_ALGORITHM,
  nowIso,
  type ArtifactDescriptor
} from "@coc/contracts";
import { sha256Hex } from "@coc/crypto";

import { ensureCocLayout } from "./layout.js";

type WriteArtifactInput = {
  trace_id: string;
  producer_event_id: string;
  bytes: Buffer;
  media_type: string;
  encoding: string;
  redaction_status?: ArtifactDescriptor["redaction_status"];
};

type ArtifactSidecar = ArtifactDescriptor & {
  references?: Array<{
    trace_id: string;
    producer_event_id: string;
    created_at: string;
  }>;
};

export class ArtifactStore {
  private readonly cocHome: string;

  public constructor(cocHome: string) {
    this.cocHome = cocHome;
    ensureCocLayout(cocHome);
  }

  private shardPath(hash: string): { shardDir: string; blobPath: string; metaPath: string } {
    const p1 = hash.slice(0, 2);
    const p2 = hash.slice(2, 4);
    const shardDir = join(this.cocHome, "artifacts", "sha256", p1, p2);
    const blobPath = join(shardDir, `${hash}.blob`);
    const metaPath = join(shardDir, `${hash}.meta.json`);
    return { shardDir, blobPath, metaPath };
  }

  public resolveBlobPath(artifactHash: string): string {
    return this.shardPath(artifactHash).blobPath;
  }

  public resolveMetaPath(artifactHash: string): string {
    return this.shardPath(artifactHash).metaPath;
  }

  public writeArtifact(input: WriteArtifactInput): ArtifactDescriptor {
    const artifactHash = sha256Hex(input.bytes);
    const { shardDir, blobPath, metaPath } = this.shardPath(artifactHash);
    mkdirSync(shardDir, { recursive: true });

    if (!existsSync(blobPath)) {
      writeFileSync(blobPath, input.bytes);
    }

    const now = nowIso();
    const storageUri = relative(this.cocHome, blobPath).replaceAll("\\", "/");
    const descriptor: ArtifactDescriptor = {
      artifact_hash: artifactHash,
      hash_algorithm: HASH_ALGORITHM,
      media_type: input.media_type,
      encoding: input.encoding,
      byte_size: input.bytes.byteLength,
      created_at: now,
      producer_event_id: input.producer_event_id,
      storage_uri: storageUri,
      redaction_status: input.redaction_status ?? "none",
      trace_id: input.trace_id,
      integrity_verified_at: now
    };

    if (!existsSync(metaPath)) {
      const sidecar: ArtifactSidecar = {
        ...descriptor,
        references: [
          {
            trace_id: input.trace_id,
            producer_event_id: input.producer_event_id,
            created_at: now
          }
        ]
      };
      writeFileSync(metaPath, JSON.stringify(sidecar, null, 2), "utf8");
      return descriptor;
    }

    const current = JSON.parse(readFileSync(metaPath, "utf8")) as ArtifactSidecar;
    const references = current.references ?? [];
    const alreadyLinked = references.some(
      (entry) =>
        entry.trace_id === input.trace_id && entry.producer_event_id === input.producer_event_id
    );

    if (!alreadyLinked) {
      references.push({
        trace_id: input.trace_id,
        producer_event_id: input.producer_event_id,
        created_at: now
      });
      writeFileSync(
        metaPath,
        JSON.stringify(
          {
            ...current,
            references
          },
          null,
          2
        ),
        "utf8"
      );
    }

    return {
      ...descriptor,
      created_at: current.created_at,
      byte_size: current.byte_size,
      media_type: current.media_type,
      encoding: current.encoding
    };
  }

  public readArtifact(artifactHash: string): Buffer | undefined {
    const path = this.resolveBlobPath(artifactHash);
    if (!existsSync(path)) {
      return undefined;
    }
    return readFileSync(path);
  }

  public readDescriptor(artifactHash: string): ArtifactDescriptor | undefined {
    const metaPath = this.resolveMetaPath(artifactHash);
    if (!existsSync(metaPath)) {
      return undefined;
    }

    const parsed = JSON.parse(readFileSync(metaPath, "utf8")) as ArtifactSidecar;
    return {
      artifact_hash: parsed.artifact_hash,
      hash_algorithm: parsed.hash_algorithm,
      media_type: parsed.media_type,
      encoding: parsed.encoding,
      byte_size: parsed.byte_size,
      created_at: parsed.created_at,
      producer_event_id: parsed.producer_event_id,
      storage_uri: parsed.storage_uri,
      redaction_status: parsed.redaction_status,
      trace_id: parsed.trace_id,
      integrity_verified_at: parsed.integrity_verified_at
    };
  }

  public hasArtifact(artifactHash: string): boolean {
    return existsSync(this.resolveBlobPath(artifactHash));
  }

  public resolveAbsoluteStorageUri(storageUri: string): string {
    return join(this.cocHome, storageUri);
  }
}
