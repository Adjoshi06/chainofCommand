import { Buffer } from "node:buffer";

import {
  newEventId,
  newClaimId,
  rolePolicy,
  type EventType,
  type ProtocolEvent,
  type Role,
  type TaskSpec,
  type TraceParticipant
} from "@coc/contracts";
import { ensureAgentKey, hashCanonical, type LoadedKeyMaterial } from "@coc/crypto";
import { ArtifactStore, TraceLedger, TraceStore } from "@coc/store";

import { buildSignedEvent } from "./event-factory.js";

const defaultAgentIdentity = (role: Role): { agentId: string; displayName: string } => ({
  agentId: `${role}-agent`,
  displayName: `${role[0].toUpperCase()}${role.slice(1)} Agent`
});

const assertRoleCanEmit = (role: Role, eventType: EventType): void => {
  if (!rolePolicy[role].has(eventType)) {
    throw new Error(`Role policy violation: role=${role} event_type=${eventType}`);
  }
};

type ProtocolAgentContext = {
  role: Role;
  material: LoadedKeyMaterial;
};

const actorFromContext = (agent: ProtocolAgentContext) => ({
  agent_id: agent.material.identity.agent_id,
  role: agent.role,
  key_id: agent.material.identity.key_id
});

export type ProtocolRunResult = {
  trace_id: string;
  task_id: string;
  participants: TraceParticipant[];
  claim_ids: string[];
  last_event_hash: string;
  events_emitted: number;
};

export const runProtocolFlow = (params: {
  coc_home: string;
  task: TaskSpec;
}): ProtocolRunResult => {
  const traceStore = new TraceStore(params.coc_home);
  const ledger = new TraceLedger(params.coc_home);
  const artifactStore = new ArtifactStore(params.coc_home);

  const requiredRoles: Role[] = ["planner", "executor", "critic", "auditor"];
  const requestedRoleSet = new Set(params.task.requested_roles);
  for (const role of requiredRoles) {
    requestedRoleSet.add(role);
  }

  const agentContexts = Array.from(requestedRoleSet).reduce<Record<Role, ProtocolAgentContext>>(
    (accumulator, role) => {
      const identity = defaultAgentIdentity(role);
      const material = ensureAgentKey({
        cocHome: params.coc_home,
        agentId: identity.agentId,
        displayName: identity.displayName,
        roleCapabilities: [role]
      });
      accumulator[role] = { role, material };
      return accumulator;
    },
    {} as Record<Role, ProtocolAgentContext>
  );

  const participants = Object.values(agentContexts).map((context) => ({
    agent_id: context.material.identity.agent_id,
    role: context.role,
    key_id: context.material.identity.key_id
  }));

  const trace = traceStore.createTrace({
    task_id: params.task.task_id,
    participants,
    policy_profile: params.task.policy_profile,
    tool_versions: {
      node: process.version
    },
    config_fingerprint: hashCanonical({
      policy_profile: params.task.policy_profile,
      requested_roles: params.task.requested_roles
    })
  });

  let prevHash = trace.head_event_hash;
  let eventCount = 0;
  const claimIds: string[] = [];

  const emit = (input: {
    role: Role;
    event_type: EventType;
    payload_type: string;
    payload: unknown;
    claims?: string[];
    artifacts?: ReturnType<typeof artifactStore.writeArtifact>[];
    event_id?: string;
  }): ProtocolEvent => {
    assertRoleCanEmit(input.role, input.event_type);
    const context = agentContexts[input.role];
    const event = buildSignedEvent({
      trace_id: trace.trace_id,
      event_type: input.event_type,
      actor: actorFromContext(context),
      payload_type: input.payload_type,
      payload: input.payload,
      claims: input.claims,
      artifacts: input.artifacts,
      prev_event_hash: prevHash,
      private_key_pem: context.material.private_key_pem,
      event_id: input.event_id
    });
    ledger.appendEvent(trace.trace_id, event);
    prevHash = event.event_hash;
    eventCount += 1;
    return event;
  };

  emit({
    role: "planner",
    event_type: "session_initialized",
    payload_type: "session",
    payload: {
      task_id: params.task.task_id,
      objective: params.task.objective,
      constraints: params.task.constraints
    }
  });

  emit({
    role: "planner",
    event_type: "proposal_created",
    payload_type: "proposal",
    payload: {
      objective: params.task.objective,
      assumptions: ["local-first execution", "immutable ledger"],
      required_tools: ["local.echo"],
      expected_evidence: ["tool-input", "tool-output"]
    }
  });

  emit({
    role: "critic",
    event_type: "proposal_reviewed",
    payload_type: "proposal_review",
    payload: {
      proposal_status: "approved",
      risk_assessment: "low",
      rationale: "Objective and constraints are compatible with local policy profile."
    }
  });

  const normalizedInput = {
    objective: params.task.objective,
    input_artifacts: params.task.input_artifacts,
    constraints: params.task.constraints
  };

  emit({
    role: "executor",
    event_type: "tool_intent_signed",
    payload_type: "tool_intent",
    payload: {
      tool_name: "local.echo",
      normalized_input_hash: hashCanonical(normalizedInput),
      safety_classification: "standard",
      justification: "Produce deterministic execution evidence."
    }
  });

  const startedEventId = newEventId();
  const inputArtifact = artifactStore.writeArtifact({
    trace_id: trace.trace_id,
    producer_event_id: startedEventId,
    bytes: Buffer.from(JSON.stringify(normalizedInput), "utf8"),
    media_type: "application/json",
    encoding: "utf-8"
  });

  emit({
    role: "executor",
    event_type: "tool_execution_started",
    payload_type: "tool_execution",
    payload: {
      tool_name: "local.echo",
      execution_id: `exec_${trace.trace_id}`,
      status: "started"
    },
    artifacts: [inputArtifact],
    event_id: startedEventId
  });

  emit({
    role: "executor",
    event_type: "artifact_recorded",
    payload_type: "artifact_descriptor",
    payload: {
      artifact_hash: inputArtifact.artifact_hash,
      media_type: inputArtifact.media_type
    },
    artifacts: [inputArtifact]
  });

  const outputPayload = {
    summary: `Objective processed: ${params.task.objective}`,
    constraint_count: params.task.constraints.length,
    input_artifact_count: params.task.input_artifacts.length
  };

  const completedEventId = newEventId();
  const outputArtifact = artifactStore.writeArtifact({
    trace_id: trace.trace_id,
    producer_event_id: completedEventId,
    bytes: Buffer.from(JSON.stringify(outputPayload), "utf8"),
    media_type: "application/json",
    encoding: "utf-8"
  });

  emit({
    role: "executor",
    event_type: "tool_execution_completed",
    payload_type: "tool_execution_result",
    payload: {
      tool_name: "local.echo",
      execution_id: `exec_${trace.trace_id}`,
      exit_status: 0,
      output_artifact_hashes: [outputArtifact.artifact_hash]
    },
    artifacts: [outputArtifact],
    event_id: completedEventId
  });

  emit({
    role: "executor",
    event_type: "artifact_recorded",
    payload_type: "artifact_descriptor",
    payload: {
      artifact_hash: outputArtifact.artifact_hash,
      media_type: outputArtifact.media_type
    },
    artifacts: [outputArtifact]
  });

  const claimId = newClaimId();
  claimIds.push(claimId);

  emit({
    role: "executor",
    event_type: "claim_issued",
    payload_type: "claim",
    payload: {
      claim_id: claimId,
      claim_text: "Tool output is traceable to signed intent and recorded artifacts.",
      confidence: 0.91,
      evidence_artifacts: [outputArtifact.artifact_hash]
    },
    claims: [claimId],
    artifacts: [outputArtifact]
  });

  emit({
    role: "executor",
    event_type: "final_statement_signed",
    payload_type: "final_statement",
    payload: {
      consolidated_claim_ids: claimIds,
      final_verdict_text: "Execution completed with artifact-backed claim evidence."
    },
    claims: claimIds,
    artifacts: [outputArtifact]
  });

  return {
    trace_id: trace.trace_id,
    task_id: trace.task_id,
    participants,
    claim_ids: claimIds,
    last_event_hash: prevHash,
    events_emitted: eventCount
  };
};
