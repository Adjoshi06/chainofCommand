import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import { canonicalizeToBytes } from "./canonicalize.js";

export const sha256Hex = (input: Buffer | string): string =>
  createHash("sha256").update(input).digest("hex");

export const hashCanonical = (value: unknown): string => sha256Hex(canonicalizeToBytes(value));

export const hashFilePath = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
