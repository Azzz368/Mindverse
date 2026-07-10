import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteBunnyFile, getJsonFromBunny, uploadJsonToBunny } from "./bunnyClient";
import type { CanvasSnapshot } from "@/shared/canvas";

export type WorkflowSummary = { id: string; name: string; createdAt: string; updatedAt: string };
export type StoredWorkflow = WorkflowSummary & CanvasSnapshot;

const ACCESS_CODE = "666666";
const emptySnapshot = (projectName: string): CanvasSnapshot => ({ version: 1, projectName, nodes: [], edges: [] });
const accountPath = (accessCode: string) => `workflows/access-${accessCode}`;
const indexPath = (accessCode: string) => `${accountPath(accessCode)}/index.json`;
const workflowPath = (accessCode: string, workflowId: string) => `${accountPath(accessCode)}/${workflowId}.json`;
const localStorageRoot = () =>
  process.env.MINDVERSE_LOCAL_STORAGE_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || os.homedir(), "Mindverse", "workflow-storage");
const localPath = (remotePath: string) => path.join(localStorageRoot(), ...remotePath.split("/"));
const legacyLocalStorageRoot = () => path.join(process.cwd(), ".mindverse-local");
const legacyLocalPath = (remotePath: string) => path.join(legacyLocalStorageRoot(), ...remotePath.split("/"));
const canUseLocalFallback = () => process.env.WORKFLOW_STORAGE_PROVIDER === "local" || process.env.NODE_ENV !== "production";

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

async function getLocalJson<T>(remotePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(localPath(remotePath), "utf8")) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      try {
        return JSON.parse(await readFile(legacyLocalPath(remotePath), "utf8")) as T;
      } catch (legacyError) {
        if (legacyError && typeof legacyError === "object" && "code" in legacyError && legacyError.code === "ENOENT") return null;
        throw legacyError;
      }
    }
    throw error;
  }
}

async function uploadLocalJson(remotePath: string, value: unknown) {
  const filePath = localPath(remotePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function deleteLocalJson(remotePath: string) {
  await rm(localPath(remotePath), { force: true });
}

const readLocalIndex = async (accessCode: string) => {
  const index = await getLocalJson<{ workflows: WorkflowSummary[] }>(indexPath(accessCode));
  return { workflows: Array.isArray(index?.workflows) ? index.workflows : [] };
};

const writeLocalIndex = async (accessCode: string, workflows: WorkflowSummary[]) => {
  await uploadLocalJson(indexPath(accessCode), { workflows });
};

async function withLocalFallback<T>(operation: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (process.env.WORKFLOW_STORAGE_PROVIDER === "local") return fallback();
  try {
    return await operation();
  } catch (error) {
    if (!canUseLocalFallback()) throw error;
    console.warn("Bunny workflow storage unavailable; using local workflow storage.", error instanceof Error ? error.message : error);
    return fallback();
  }
}

export async function listWorkflows(accessCodeValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  return withLocalFallback(() => readIndex(accessCode), () => readLocalIndex(accessCode));
}

export async function createWorkflow(accessCodeValue: unknown, nameValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  const now = new Date().toISOString();
  const id = `workflow-${crypto.randomUUID()}`;
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : "Untitled workflow";
  const summary: WorkflowSummary = { id, name, createdAt: now, updatedAt: now };
  const workflow: StoredWorkflow = { ...summary, ...emptySnapshot(name) };
  return withLocalFallback(
    async () => {
      const index = await readIndex(accessCode);
      await uploadJsonToBunny(workflowPath(accessCode, id), workflow);
      await writeIndex(accessCode, [summary, ...index.workflows]);
      return workflow;
    },
    async () => {
      const index = await readLocalIndex(accessCode);
      await uploadLocalJson(workflowPath(accessCode, id), workflow);
      await writeLocalIndex(accessCode, [summary, ...index.workflows]);
      return workflow;
    },
  );
}

export async function getWorkflow(accessCodeValue: unknown, workflowId: string) {
  const accessCode = requireAccessCode(accessCodeValue);
  if (process.env.WORKFLOW_STORAGE_PROVIDER === "local") return getLocalJson<StoredWorkflow>(workflowPath(accessCode, workflowId));
  try {
    const remote = await getJsonFromBunny<StoredWorkflow>(workflowPath(accessCode, workflowId));
    if (remote) return remote;
    if (canUseLocalFallback()) return getLocalJson<StoredWorkflow>(workflowPath(accessCode, workflowId));
    return null;
  } catch (error) {
    if (!canUseLocalFallback()) throw error;
    console.warn("Bunny workflow storage unavailable; using local workflow storage.", error instanceof Error ? error.message : error);
    return getLocalJson<StoredWorkflow>(workflowPath(accessCode, workflowId));
  }
}

export async function saveWorkflow(accessCodeValue: unknown, workflowId: string, snapshot: CanvasSnapshot, nameValue?: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  return withLocalFallback(
    async () => saveWorkflowTo("bunny", accessCode, workflowId, snapshot, nameValue),
    async () => saveWorkflowTo("local", accessCode, workflowId, snapshot, nameValue),
  );
}

export async function renameWorkflow(accessCodeValue: unknown, workflowId: string, nameValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  const existing = await getWorkflow(accessCode, workflowId);
  if (!existing) throw new Error("Workflow not found.");
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : existing.name;
  return saveWorkflow(accessCode, workflowId, { version: 1, projectName: name, nodes: existing.nodes, edges: existing.edges, agentMemory: existing.agentMemory }, name);
}

export async function deleteWorkflow(accessCodeValue: unknown, workflowId: string) {
  const accessCode = requireAccessCode(accessCodeValue);
  await withLocalFallback(
    async () => {
      const index = await readIndex(accessCode);
      await deleteBunnyFile(workflowPath(accessCode, workflowId));
      await writeIndex(accessCode, index.workflows.filter((item) => item.id !== workflowId));
    },
    async () => {
      const index = await readLocalIndex(accessCode);
      await deleteLocalJson(workflowPath(accessCode, workflowId));
      await writeLocalIndex(accessCode, index.workflows.filter((item) => item.id !== workflowId));
    },
  );
}

async function saveWorkflowTo(storage: "bunny" | "local", accessCode: string, workflowId: string, snapshot: CanvasSnapshot, nameValue?: unknown) {
  const pathForWorkflow = workflowPath(accessCode, workflowId);
  const existing = storage === "bunny" ? await getJsonFromBunny<StoredWorkflow>(pathForWorkflow) : await getLocalJson<StoredWorkflow>(pathForWorkflow);
  if (!existing) throw new Error("Workflow not found.");
  const now = new Date().toISOString();
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : snapshot.projectName || existing.name;
  const workflow: StoredWorkflow = { ...existing, ...snapshot, id: workflowId, name, projectName: name, updatedAt: now };
  const index = storage === "bunny" ? await readIndex(accessCode) : await readLocalIndex(accessCode);
  const workflows = index.workflows.map((item) => item.id === workflowId ? { id: workflowId, name, createdAt: item.createdAt || existing.createdAt, updatedAt: now } : item);
  if (storage === "bunny") {
    await uploadJsonToBunny(pathForWorkflow, workflow);
    await writeIndex(accessCode, workflows);
  } else {
    await uploadLocalJson(pathForWorkflow, workflow);
    await writeLocalIndex(accessCode, workflows);
  }
  return workflow;
}
