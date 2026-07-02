import "server-only";

import { deleteBunnyFile, getJsonFromBunny, uploadJsonToBunny } from "./bunnyClient";
import type { CanvasSnapshot } from "@/types/canvas";

export type WorkflowSummary = { id: string; name: string; createdAt: string; updatedAt: string };
export type StoredWorkflow = WorkflowSummary & CanvasSnapshot;

const ACCESS_CODE = "666666";
const emptySnapshot = (projectName: string): CanvasSnapshot => ({ version: 1, projectName, nodes: [], edges: [] });
const accountPath = (accessCode: string) => `workflows/access-${accessCode}`;
const indexPath = (accessCode: string) => `${accountPath(accessCode)}/index.json`;
const workflowPath = (accessCode: string, workflowId: string) => `${accountPath(accessCode)}/${workflowId}.json`;

export const isValidAccessCode = (value: unknown) => typeof value === "string" && value.trim() === ACCESS_CODE;

const requireAccessCode = (accessCode: unknown) => {
  if (!isValidAccessCode(accessCode)) throw new Error("Invalid access code.");
  return ACCESS_CODE;
};

const readIndex = async (accessCode: string) => {
  const index = await getJsonFromBunny<{ workflows: WorkflowSummary[] }>(indexPath(accessCode));
  return { workflows: Array.isArray(index?.workflows) ? index.workflows : [] };
};

const writeIndex = async (accessCode: string, workflows: WorkflowSummary[]) => {
  await uploadJsonToBunny(indexPath(accessCode), { workflows });
};

export async function listWorkflows(accessCodeValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  return readIndex(accessCode);
}

export async function createWorkflow(accessCodeValue: unknown, nameValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  const now = new Date().toISOString();
  const id = `workflow-${crypto.randomUUID()}`;
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : "Untitled workflow";
  const summary: WorkflowSummary = { id, name, createdAt: now, updatedAt: now };
  const workflow: StoredWorkflow = { ...summary, ...emptySnapshot(name) };
  const index = await readIndex(accessCode);
  await uploadJsonToBunny(workflowPath(accessCode, id), workflow);
  await writeIndex(accessCode, [summary, ...index.workflows]);
  return workflow;
}

export async function getWorkflow(accessCodeValue: unknown, workflowId: string) {
  const accessCode = requireAccessCode(accessCodeValue);
  return getJsonFromBunny<StoredWorkflow>(workflowPath(accessCode, workflowId));
}

export async function saveWorkflow(accessCodeValue: unknown, workflowId: string, snapshot: CanvasSnapshot, nameValue?: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  const existing = await getWorkflow(accessCode, workflowId);
  if (!existing) throw new Error("Workflow not found.");
  const now = new Date().toISOString();
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : snapshot.projectName || existing.name;
  const workflow: StoredWorkflow = { ...existing, ...snapshot, id: workflowId, name, projectName: name, updatedAt: now };
  const index = await readIndex(accessCode);
  const workflows = index.workflows.map((item) => item.id === workflowId ? { id: workflowId, name, createdAt: item.createdAt || existing.createdAt, updatedAt: now } : item);
  await uploadJsonToBunny(workflowPath(accessCode, workflowId), workflow);
  await writeIndex(accessCode, workflows);
  return workflow;
}

export async function renameWorkflow(accessCodeValue: unknown, workflowId: string, nameValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  const existing = await getWorkflow(accessCode, workflowId);
  if (!existing) throw new Error("Workflow not found.");
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : existing.name;
  return saveWorkflow(accessCode, workflowId, { version: 1, projectName: name, nodes: existing.nodes, edges: existing.edges }, name);
}

export async function deleteWorkflow(accessCodeValue: unknown, workflowId: string) {
  const accessCode = requireAccessCode(accessCodeValue);
  const index = await readIndex(accessCode);
  await deleteBunnyFile(workflowPath(accessCode, workflowId));
  await writeIndex(accessCode, index.workflows.filter((item) => item.id !== workflowId));
}
