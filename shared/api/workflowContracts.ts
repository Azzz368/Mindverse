import type { CanvasSnapshotPayload } from "./aiContracts";

export type WorkflowSummary = { id: string; name: string; createdAt: string; updatedAt: string };

export type ListWorkflowsResponse = { ok: true; output?: { workflows?: WorkflowSummary[] } };
export type WorkflowRecordResponse = { ok: true; output?: WorkflowSummary };
export type DeleteWorkflowResponse = { ok: true };
export type WorkflowSnapshotResponse = { ok: true; output?: { projectName?: string; name?: string; nodes?: unknown[]; edges?: unknown[] } };

export type SaveWorkflowRequest = { accessCode: string; name: string; snapshot: CanvasSnapshotPayload };
