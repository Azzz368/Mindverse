import type { CanvasEditPatch } from "./agentSchema";

export type AgentRunPhase =
  | "planning"
  | "applying"
  | "executing"
  | "observing"
  | "repairing"
  | "completed"
  | "blocked"
  | "cancelled";

export type AgentRunEvent = {
  id: string;
  phase: AgentRunPhase;
  message: string;
  createdAt: string;
  nodeId?: string;
  attempt?: number;
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
