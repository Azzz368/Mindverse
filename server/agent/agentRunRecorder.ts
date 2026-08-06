import "server-only";

import type {
  AgentRunEvent,
  AgentRunEventKind,
  AgentRunMetadataValue,
  AgentRunPhase,
  AgentRunStatus,
  AgentRunTrace,
} from "@/shared/agent/agentAutonomy";

type EventOptions = {
  kind?: AgentRunEventKind;
  nodeId?: string;
  attempt?: number;
  durationMs?: number;
  metadata?: Record<string, AgentRunMetadataValue | undefined>;
};

const cleanMetadata = (value: EventOptions["metadata"]) => value
  ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, AgentRunMetadataValue] => entry[1] !== undefined))
  : undefined;

export function createAgentRunRecorder(initial?: AgentRunTrace) {
  const id = initial?.id || crypto.randomUUID();
  const startedAt = initial?.startedAt || new Date().toISOString();
  const events: AgentRunEvent[] = [...(initial?.events || [])];
  let status: AgentRunStatus = "running";
  let currentPhase: AgentRunPhase = "received";
  let intent: string | undefined = initial?.intent;
  let summary: string | undefined = initial?.summary;

  const add = (phase: AgentRunPhase, message: string, options: EventOptions = {}) => {
    currentPhase = phase;
    const event: AgentRunEvent = {
      id: crypto.randomUUID(),
      runId: id,
      phase,
      kind: options.kind || "stage",
      message,
      createdAt: new Date().toISOString(),
      nodeId: options.nodeId,
      attempt: options.attempt,
      durationMs: options.durationMs,
      metadata: cleanMetadata(options.metadata),
    };
    events.push(event);
    return event;
  };

  const setIntent = (value: string, reason?: string) => {
    intent = value;
    add("routing", reason ? `Intent: ${value}. ${reason}` : `Intent: ${value}.`, {
      kind: "decision",
      metadata: { intent: value },
    });
  };

  const setStatus = (nextStatus: AgentRunStatus, phase: AgentRunPhase, nextSummary?: string) => {
    status = nextStatus;
    currentPhase = phase;
    if (nextSummary !== undefined) summary = nextSummary;
  };

  const finish = (nextStatus: Exclude<AgentRunStatus, "running">, phase: AgentRunPhase, message: string) => {
    status = nextStatus;
    summary = message;
    add(phase, message, { kind: nextStatus === "blocked" ? "error" : "stage" });
  };

  const snapshot = (): AgentRunTrace => ({
    id,
    status,
    currentPhase,
    startedAt,
    updatedAt: new Date().toISOString(),
    intent,
    summary,
    events: [...events],
  });

  return { id, add, setIntent, setStatus, finish, snapshot };
}
