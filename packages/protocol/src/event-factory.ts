import {
  SCHEMA_VERSION,
  newEventId,
  nowIso,
  type Actor,
  type ArtifactDescriptor,
  type EventType,
  type ProtocolEvent
} from "@coc/contracts";
import {
  canonicalSignedBytes,
  computeEventHash,
  hashCanonical,
  signBytes
} from "@coc/crypto";

type BuildEventInput = {
  trace_id: string;
  event_type: EventType;
  actor: Actor;
  payload_type: string;
  payload: unknown;
  claims?: string[];
  artifacts?: ArtifactDescriptor[];
  prev_event_hash: string;
  private_key_pem: string;
  created_at?: string;
  event_id?: string;
};

export const buildSignedEvent = (input: BuildEventInput): ProtocolEvent => {
  const eventId = input.event_id ?? newEventId();
  const createdAt = input.created_at ?? nowIso();
  const claims = input.claims ?? [];
  const artifacts = input.artifacts ?? [];
  const payloadHash = hashCanonical(input.payload);

  const unsigned = {
    schema_version: SCHEMA_VERSION,
    trace_id: input.trace_id,
    event_id: eventId,
    event_type: input.event_type,
    created_at: createdAt,
    actor: input.actor,
    payload_hash: payloadHash,
    prev_event_hash: input.prev_event_hash,
    payload_type: input.payload_type,
    payload: input.payload,
    claims,
    artifacts
  };

  const signature = signBytes(input.private_key_pem, canonicalSignedBytes(unsigned));
  const withSignature = {
    ...unsigned,
    signature
  };
  const eventHash = computeEventHash(withSignature);

  return {
    ...withSignature,
    event_hash: eventHash
  };
};
