import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getJsonFromBunny, uploadJsonToBunny } from "./bunnyClient";
import { queryPostgres } from "@/server/db/postgres";
import { agentMemorySummary } from "@/shared/agent/projectMemory";
import type { CanvasSnapshot } from "@/shared/canvas";
import { indexProjectMemory } from "@/server/rag/sources/projectSource";
import { indexSuccessfulWorkflow } from "@/server/rag/sources/workflowSource";
import { deactivateRagDocument } from "@/server/rag/documentIngestion";

export type WorkflowSummary = { id: string; name: string; createdAt: string; updatedAt: string; revision: number; previewUrl?: string };
export type StoredWorkflow = WorkflowSummary & CanvasSnapshot;
export type WorkflowOwner = { workspaceId: string; userId: string };

export class WorkflowStorageError extends Error {
  constructor(message: string, public status = 400, public code = "WORKFLOW_STORAGE_ERROR") {
    super(message);
    this.name = "WorkflowStorageError";
  }
}

type WorkflowRow = {
  id: string;
  name: string;
  snapshot_storage_key: string;
  revision: number;
  created_at: Date | string;
  updated_at: Date | string;
};

const emptySnapshot = (projectName: string): CanvasSnapshot => ({ version: 1, projectName, nodes: [], edges: [] });
const snapshotPath = (workspaceId: string, workflowId: string, revision: number, writeId?: string) =>
  `workspaces/${workspaceId}/workflows/${workflowId}/snapshots/revision-${revision}${writeId ? `-${writeId}` : ""}.json`;
const localRoot = () => process.env.MINDVERSE_LOCAL_STORAGE_ROOT || path.join(process.cwd(), ".mindverse-local");
const localPath = (remotePath: string) => path.join(localRoot(), ...remotePath.split("/"));
const useLocal = () => process.env.WORKFLOW_STORAGE_PROVIDER === "local";
const demoMode = () => process.env.NODE_ENV !== "production" && process.env.MINDVERSE_DEMO_MODE === "true";
const demoPath = () => path.join(process.cwd(), ".mindverse-local", "demo-workflows.json");
async function readDemoWorkflows() {
  try { return JSON.parse(await readFile(demoPath(), "utf8")) as StoredWorkflow[]; }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []; throw error; }
}
async function writeDemoWorkflows(workflows: StoredWorkflow[]) {
  await mkdir(path.dirname(demoPath()), { recursive: true });
  await writeFile(demoPath(), JSON.stringify(workflows, null, 2), "utf8");
}
const executableNodeTypes = new Set(["script", "storyboard", "storyboardImage", "image", "video", "videoEdit", "motion", "audio", "musicGeneration", "hkgaiTTS", "voiceClone", "voiceTTS", "output"]);

const iso = (value: Date | string) => new Date(value).toISOString();
const summaryFromRow = (row: WorkflowRow): WorkflowSummary => ({
  id: row.id,
  name: row.name,
  revision: row.revision,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const mediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const url = value.trim();
  return /^(https?:\/\/|data:image\/)/i.test(url) ? url : "";
};

function imagePreview(snapshot: CanvasSnapshot | null) {
  if (!snapshot) return "";
  for (const node of [...snapshot.nodes].reverse()) {
    if (!["image", "reference", "videoFrame"].includes(node.data.nodeType)) continue;
    const data = node.data as CanvasSnapshot["nodes"][number]["data"] & { activeImageUrl?: unknown; imageUrl?: unknown };
    const output = data.output?.value;
    const outputRecord = output && typeof output === "object" ? output as Record<string, unknown> : null;
    const url = mediaUrl(data.activeImageUrl) || mediaUrl(data.imageUrl) || mediaUrl(outputRecord?.imageUrl) || mediaUrl(outputRecord?.revisedImageUrl) || mediaUrl(data.output?.value);
    if (url) return url;
  }
  return "";
}

async function writeSnapshot(storageKey: string, value: StoredWorkflow) {
  if (!useLocal()) return uploadJsonToBunny(storageKey, value).then(() => undefined);
  const target = localPath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value, null, 2), "utf8");
}

async function readSnapshot(storageKey: string) {
  if (!useLocal()) return getJsonFromBunny<StoredWorkflow>(storageKey);
  try {
    return JSON.parse(await readFile(localPath(storageKey), "utf8")) as StoredWorkflow;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

const isSuccessfulWorkflowSnapshot = (snapshot: CanvasSnapshot) => {
  const executableNodes = snapshot.nodes.filter((node) => executableNodeTypes.has(node.data.nodeType));
  return executableNodes.length > 0 && executableNodes.every((node) => node.data.status === "success" && Boolean(node.data.output));
};

async function indexWorkflowKnowledge(owner: WorkflowOwner, workflowId: string, workflow: StoredWorkflow) {
  try {
    const memory = agentMemorySummary(workflow.agentMemory);
    if (memory) {
      await indexProjectMemory({
        tenantId: owner.workspaceId,
        projectId: workflowId,
        title: `${workflow.name} project memory`,
        content: `# ${workflow.name}\n\n${memory}`,
        metadata: { workflowId, memoryUpdatedAt: workflow.agentMemory?.updatedAt },
      });
    }
    if (isSuccessfulWorkflowSnapshot(workflow)) {
      await indexSuccessfulWorkflow({ workflowId, snapshot: workflow, tenantId: owner.workspaceId, projectId: workflowId });
    }
  } catch (error) {
    console.warn("Workflow saved, but RAG indexing failed.", error instanceof Error ? error.message : error);
  }
}

async function workflowRow(workspaceId: string, workflowId: string) {
  const result = await queryPostgres<WorkflowRow>(
    `SELECT id, name, snapshot_storage_key, revision, created_at, updated_at
       FROM mindverse_workflows
      WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [workflowId, workspaceId],
  );
  return result.rows[0];
}

export async function listWorkflows(workspaceId: string) {
  if (demoMode()) return { workflows: (await readDemoWorkflows()).filter((workflow) => (workflow as StoredWorkflow & { workspaceId?: string; deletedAt?: string }).workspaceId === workspaceId && !(workflow as StoredWorkflow & { deletedAt?: string }).deletedAt).map((workflow) => ({ id: workflow.id, name: workflow.name, revision: workflow.revision, createdAt: workflow.createdAt, updatedAt: workflow.updatedAt, previewUrl: imagePreview(workflow) || undefined })) };
  const result = await queryPostgres<WorkflowRow>(
    `SELECT id, name, snapshot_storage_key, revision, created_at, updated_at
       FROM mindverse_workflows
      WHERE workspace_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC`,
    [workspaceId],
  );
  const workflows = await Promise.all(result.rows.map(async (row) => {
    const summary = summaryFromRow(row);
    const snapshot = await readSnapshot(row.snapshot_storage_key);
    return { ...summary, previewUrl: imagePreview(snapshot) || undefined };
  }));
  return { workflows };
}

export async function createWorkflow(owner: WorkflowOwner, nameValue: unknown) {
  const now = new Date();
  const id = `workflow-${crypto.randomUUID()}`;
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim().slice(0, 160) : "Untitled workflow";
  const revision = 1;
  const storageKey = snapshotPath(owner.workspaceId, id, revision);
  const summary: WorkflowSummary = { id, name, revision, createdAt: now.toISOString(), updatedAt: now.toISOString(), previewUrl: undefined };
  const workflow: StoredWorkflow = { ...summary, ...emptySnapshot(name) };
  if (demoMode()) { await writeDemoWorkflows([...(await readDemoWorkflows()), { ...workflow, workspaceId: owner.workspaceId, createdBy: owner.userId } as StoredWorkflow & { workspaceId: string; createdBy: string }]); return workflow; }
  await writeSnapshot(storageKey, workflow);
  await queryPostgres(
    `INSERT INTO mindverse_workflows (id, workspace_id, created_by, name, snapshot_storage_key, revision, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [id, owner.workspaceId, owner.userId, name, storageKey, revision, now],
  );
  return workflow;
}

export async function getWorkflow(workspaceId: string, workflowId: string) {
  if (demoMode()) return (await readDemoWorkflows()).find((workflow) => workflow.id === workflowId && (workflow as StoredWorkflow & { workspaceId?: string }).workspaceId === workspaceId && !(workflow as StoredWorkflow & { deletedAt?: string }).deletedAt) || null;
  const row = await workflowRow(workspaceId, workflowId);
  if (!row) return null;
  const snapshot = await readSnapshot(row.snapshot_storage_key);
  if (!snapshot) throw new WorkflowStorageError("Workflow snapshot is missing.", 502, "SNAPSHOT_MISSING");
  return { ...snapshot, ...summaryFromRow(row), projectName: snapshot.projectName || row.name } satisfies StoredWorkflow;
}

export async function saveWorkflow(owner: WorkflowOwner, workflowId: string, snapshot: CanvasSnapshot, nameValue?: unknown, expectedRevision?: unknown) {
  if (demoMode()) {
    const workflows = await readDemoWorkflows();
    const existing = workflows.find((workflow) => workflow.id === workflowId && (workflow as StoredWorkflow & { workspaceId?: string }).workspaceId === owner.workspaceId);
    if (!existing) throw new WorkflowStorageError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    const revision = existing.revision + 1;
    const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim().slice(0, 160) : snapshot.projectName || existing.name;
    const workflow = { ...snapshot, id: workflowId, name, projectName: name, revision, createdAt: existing.createdAt, updatedAt: new Date().toISOString(), workspaceId: owner.workspaceId, createdBy: owner.userId } as StoredWorkflow;
    await writeDemoWorkflows(workflows.map((item) => item.id === workflowId ? workflow : item));
    return workflow;
  }
  const existing = await workflowRow(owner.workspaceId, workflowId);
  if (!existing) throw new WorkflowStorageError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
  const clientRevision = Number(expectedRevision);
  if (Number.isInteger(clientRevision) && clientRevision > 0 && clientRevision !== existing.revision) {
    throw new WorkflowStorageError("项目已在另一个页面更新，请刷新后重试。", 409, "REVISION_CONFLICT");
  }
  const revision = existing.revision + 1;
  const now = new Date();
  const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim().slice(0, 160) : snapshot.projectName || existing.name;
  // A unique object key prevents two concurrent writers for the same revision
  // from overwriting each other's Bunny snapshot before the Postgres CAS wins.
  const storageKey = snapshotPath(owner.workspaceId, workflowId, revision, crypto.randomUUID());
  const workflow: StoredWorkflow = {
    ...snapshot,
    id: workflowId,
    name,
    projectName: name,
    revision,
    createdAt: iso(existing.created_at),
    updatedAt: now.toISOString(),
  };
  await writeSnapshot(storageKey, workflow);
  const update = await queryPostgres(
    `UPDATE mindverse_workflows
        SET name = $1, snapshot_storage_key = $2, revision = $3, updated_at = $4
      WHERE id = $5 AND workspace_id = $6 AND revision = $7 AND deleted_at IS NULL`,
    [name, storageKey, revision, now, workflowId, owner.workspaceId, existing.revision],
  );
  if (!update.rowCount) throw new WorkflowStorageError("项目已在另一个页面更新，请刷新后重试。", 409, "REVISION_CONFLICT");
  await indexWorkflowKnowledge(owner, workflowId, workflow);
  return workflow;
}

export async function renameWorkflow(owner: WorkflowOwner, workflowId: string, nameValue: unknown) {
  const existing = await getWorkflow(owner.workspaceId, workflowId);
  if (!existing) throw new WorkflowStorageError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
  return saveWorkflow(owner, workflowId, existing, nameValue, existing.revision);
}

export async function deleteWorkflow(owner: WorkflowOwner, workflowId: string) {
  if (demoMode()) {
    const workflows = await readDemoWorkflows();
    if (!workflows.some((workflow) => workflow.id === workflowId && (workflow as StoredWorkflow & { workspaceId?: string }).workspaceId === owner.workspaceId)) throw new WorkflowStorageError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
    await writeDemoWorkflows(workflows.map((workflow) => workflow.id === workflowId ? { ...workflow, deletedAt: new Date().toISOString() } : workflow));
    return;
  }
  const result = await queryPostgres(
    `UPDATE mindverse_workflows SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [workflowId, owner.workspaceId],
  );
  if (!result.rowCount) throw new WorkflowStorageError("Workflow not found.", 404, "WORKFLOW_NOT_FOUND");
  try {
    await Promise.all([
      deactivateRagDocument("successful_workflow", workflowId, owner.workspaceId, workflowId),
      deactivateRagDocument("project_memory", workflowId, owner.workspaceId, workflowId),
    ]);
  } catch (error) {
    console.warn("Workflow deleted, but its RAG documents could not be deactivated.", error instanceof Error ? error.message : error);
  }
}
