import { deleteJson, getJson, patchJson, postJson, putJson } from "@/shared/api/client";
import type {
  DeleteWorkflowResponse,
  ListWorkflowsResponse,
  SaveWorkflowRequest,
  WorkflowRecordResponse,
  WorkflowSnapshotResponse,
} from "@/shared/api/workflowContracts";

export const ACCESS_KEY = "mindverse-access-code";

export const listWorkflows = (accessCode: string) =>
  getJson<ListWorkflowsResponse>(`/api/workflows?accessCode=${encodeURIComponent(accessCode)}`, "Access denied.");

export const createWorkflowRemote = (accessCode: string, name: string) =>
  postJson<WorkflowRecordResponse>("/api/workflows", { accessCode, name }, "Could not create workflow.");

export const renameWorkflowRemote = (workflowId: string, accessCode: string, name: string) =>
  patchJson<WorkflowRecordResponse>(`/api/workflows/${encodeURIComponent(workflowId)}`, { accessCode, name }, "Could not rename workflow.");

export const deleteWorkflowRemote = (workflowId: string, accessCode: string) =>
  deleteJson<DeleteWorkflowResponse>(`/api/workflows/${encodeURIComponent(workflowId)}?accessCode=${encodeURIComponent(accessCode)}`, "Could not delete workflow.");

export const getWorkflowSnapshot = (workflowId: string, accessCode: string) =>
  getJson<WorkflowSnapshotResponse>(`/api/workflows/${encodeURIComponent(workflowId)}?accessCode=${encodeURIComponent(accessCode)}`, "Could not load workflow.");

export const saveWorkflowSnapshot = (workflowId: string, request: SaveWorkflowRequest) =>
  putJson<WorkflowRecordResponse>(`/api/workflows/${encodeURIComponent(workflowId)}`, request, "Remote workflow save failed.");
