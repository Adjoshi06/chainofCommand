import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

import {
  SIGNATURE_ALGORITHM,
  type ProtocolEvent,
  type SignatureEnvelope
} from "@coc/contracts";

import { canonicalizeToBytes } from "./canonicalize.js";
import { sha256Hex } from "./hash.js";

const signedFields = [
  "schema_version",
  "trace_id",
  "event_id",
  "event_type",
  "created_at",
  "actor",
  "payload_hash",
  "payload_type",
  "claims",
  "artifacts",
  "prev_event_hash"
] as const;

type SignedField = (typeof signedFields)[number];

export const extractSignedPayload = (
  event: Omit<ProtocolEvent, "event_hash" | "signature"> | ProtocolEvent
): Record<SignedField, unknown> => {
  const payload = {} as Record<SignedField, unknown>;
  for (const field of signedFields) {
    payload[field] = event[field];
  }
  return payload;
};

export const canonicalSignedBytes = (
  event: Omit<ProtocolEvent, "event_hash" | "signature"> | ProtocolEvent
): Buffer => canonicalizeToBytes(extractSignedPayload(event));

export const computeEventHash = (
  event: Omit<ProtocolEvent, "event_hash">
): string => {
  const { event_hash: _ignored, ...eventWithoutHash } = event as ProtocolEvent & {
    event_hash?: string;
  };
  return sha256Hex(canonicalizeToBytes(eventWithoutHash));
};

export const signBytes = (privateKeyPem: string, bytes: Buffer): SignatureEnvelope => {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, bytes, key);
  return {
    algorithm: SIGNATURE_ALGORITHM,
    signature_b64: signature.toString("base64"),
    signed_bytes_hash: sha256Hex(bytes)
  };
};

export const verifyBytes = (
  publicKeyPem: string,
  bytes: Buffer,
  signatureEnvelope: SignatureEnvelope
): boolean => {
  if (signatureEnvelope.algorithm !== SIGNATURE_ALGORITHM) {
    return false;
  }

  if (signatureEnvelope.signed_bytes_hash !== sha256Hex(bytes)) {
    return false;
  }

  const key = createPublicKey(publicKeyPem);
  return verify(null, bytes, key, Buffer.from(signatureEnvelope.signature_b64, "base64"));
};
