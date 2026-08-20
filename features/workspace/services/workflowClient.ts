import { deleteJson, getJson, patchJson, postJson, putJson } from "@/shared/api/client";
import type { DeleteWorkflowResponse, ListWorkflowsResponse, SaveWorkflowRequest, WorkflowRecordResponse, WorkflowSnapshotResponse } from "@/shared/api/workflowContracts";

export const listWorkflows = () => getJson<ListWorkflowsResponse>("/api/workflows", "Please sign in first.");
export const createWorkflowRemote = (name: string) => postJson<WorkflowRecordResponse>("/api/workflows", { name }, "Could not create workflow.");
export const renameWorkflowRemote = (workflowId: string, name: string) => patchJson<WorkflowRecordResponse>(`/api/workflows/${encodeURIComponent(workflowId)}`, { name }, "Could not rename workflow.");
export const deleteWorkflowRemote = (workflowId: string) => deleteJson<DeleteWorkflowResponse>(`/api/workflows/${encodeURIComponent(workflowId)}`, "Could not delete workflow.");
export const getWorkflowSnapshot = (workflowId: string) => getJson<WorkflowSnapshotResponse>(`/api/workflows/${encodeURIComponent(workflowId)}`, "Could not load workflow.");
export const saveWorkflowSnapshot = (workflowId: string, request: SaveWorkflowRequest) => putJson<WorkflowRecordResponse>(`/api/workflows/${encodeURIComponent(workflowId)}`, request, "Remote workflow save failed.");
