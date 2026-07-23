import type { CanvasEditPatch } from "./agentSchema";
import type { CanvasSnapshot } from "../canvas";
import type { CapabilityRetrievalRequest } from "./capabilityTypes";

export type AgentRunPhase =
  | "received"
  | "routing"
  | "clarifying"
  | "planning"
  | "tooling"
  | "validating"
  | "awaiting_user"
  | "applying"
  | "executing"
  | "observing"
  | "repairing"
  | "completed"
  | "blocked"
  | "cancelled";

export type AgentRunStatus = "running" | "awaiting_user" | "ready" | "completed" | "blocked" | "cancelled";

export type AgentRunEventKind = "stage" | "decision" | "model" | "tool" | "validation" | "node" | "error";

export type AgentRunMetadataValue = string | number | boolean | null;

export type AgentRunEvent = {
  id: string;
  runId?: string;
  phase: AgentRunPhase;
  kind?: AgentRunEventKind;
  message: string;
  createdAt: string;
  nodeId?: string;
  attempt?: number;
  durationMs?: number;
  metadata?: Record<string, AgentRunMetadataValue>;
};

export type AgentRunTrace = {
  id: string;
  status: AgentRunStatus;
  currentPhase: AgentRunPhase;
  startedAt: string;
  updatedAt: string;
  intent?: string;
  summary?: string;
  events: AgentRunEvent[];
};

export type AgentRunExecutionMode = "browser" | "worker";

export type AgentRunCheckpoint = {
  version: 1;
  savedAt: string;
  canvasSnapshot?: CanvasSnapshot;
  selectedNodeIds: string[];
  executedNodeIds: string[];
  repairAttempts: number;
  planResponse?: Record<string, unknown>;
  retrieval?: AgentRunRetrievalTrace;
};

export type AgentRunRetrievalTrace = {
  query: CapabilityRetrievalRequest;
  retrievalMode: "catalog" | "postgres-hybrid";
  candidateIds: string[];
  selectedCapabilityIds: string[];
  evidenceIds: string[];
  generatedAt: string;
};

export type AgentRunLease = {
  workerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
};

export type AgentRunRecord = AgentRunTrace & {
  schemaVersion: 1;
  revision: number;
  executionMode: AgentRunExecutionMode;
  request?: {
    userMessage: string;
    selectedNodeIds: string[];
    workflowId?: string;
  };
  checkpoint?: AgentRunCheckpoint;
  lease?: AgentRunLease;
  cancelRequestedAt?: string;
  resumeRequestedAt?: string;
};

export type AgentRunUpdate = {
  events?: AgentRunEvent[];
  status?: AgentRunStatus;
  currentPhase?: AgentRunPhase;
  summary?: string;
  checkpoint?: AgentRunCheckpoint;
};

export type AgentObservedNode = {
  id: string;
  type: string;
  title: string;
  status: string;
  outputSummary?: string;
  error?: string;
  aspectRatio?: string;
  duration?: number;
  width?: number;
  height?: number;
  codexOk?: boolean;
};

export type AgentObservationReport = {
  expectedAspectRatio?: string;
  expectedDuration?: number;
  nodes: AgentObservedNode[];
  issues: string[];
  warnings: string[];
  allTerminal: boolean;
  allSuccessful: boolean;
};

export type AgentVerificationStatus = "completed" | "repair" | "blocked";

export type AgentVerificationDecision = {
  status: AgentVerificationStatus;
  summary: string;
  repairInstruction?: string;
};

export type AgentObserveResponse = {
  ok: true;
  status: AgentVerificationStatus;
  summary: string;
  observation: AgentObservationReport;
  repairPatch?: CanvasEditPatch;
  repairInstruction?: string;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function validateAgentVerificationDecision(value: unknown): AgentVerificationDecision {
  const raw = record(value);
  const status = raw.status === "repair" || raw.status === "blocked" ? raw.status : "completed";
  return {
    status,
    summary: text(raw.summary) || (status === "completed" ? "The requested workflow completed successfully." : "The run needs attention."),
    repairInstruction: status === "repair" ? text(raw.repairInstruction) || undefined : undefined,
  };
}
