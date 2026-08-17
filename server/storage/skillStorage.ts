import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteBunnyFile, getJsonFromBunny, uploadJsonToBunny } from "./bunnyClient";
import { queryPostgres } from "@/server/db/postgres";
import { deactivateSkillDocument, indexSkillDocument } from "@/server/rag/sources/skillSource";
import type { CanvasNode, CanvasSnapshot } from "@/shared/canvas";
import {
  skillCategories,
  skillRoles,
  type SkillCategory,
  type SkillDraft,
  type PromptTarget,
  type SkillRole,
  type SkillSummary,
  type SkillVisibility,
  type StoredSkill,
} from "@/shared/skills/skillTypes";

type SkillOwner = { workspaceId: string; userId: string };
const accountPath = (workspaceId: string) => `workspaces/${workspaceId}/skills`;
const indexPath = (workspaceId: string) => `${accountPath(workspaceId)}/index.json`;
const skillPath = (workspaceId: string, skillId: string) => `${accountPath(workspaceId)}/${skillId}.json`;
const localStorageRoot = () =>
  process.env.MINDVERSE_LOCAL_STORAGE_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || os.homedir(), "Mindverse", "workflow-storage");
const localPath = (remotePath: string) => path.join(localStorageRoot(), ...remotePath.split("/"));
const storageProvider = () => process.env.SKILL_STORAGE_PROVIDER || process.env.WORKFLOW_STORAGE_PROVIDER;
const canUseLocalFallback = () => storageProvider() === "local" || process.env.NODE_ENV !== "production";

const requireWorkspaceId = (value: unknown) => {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Invalid workspace.");
  return value;
};

const asText = (value: unknown, field: string, maxLength: number) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} is too long.`);
  return text;
};

const asCategory = (value: unknown): SkillCategory => {
  if (typeof value === "string" && skillCategories.includes(value as SkillCategory)) return value as SkillCategory;
  throw new Error("A valid skill category is required.");
};

const asVisibility = (value: unknown): SkillVisibility =>
  value === "public" || value === "unlisted" ? value : "private";

const asSkillRole = (value: unknown): SkillRole =>
  typeof value === "string" && skillRoles.includes(value as SkillRole) ? value as SkillRole : "workflow_recipe";

const asPromptTargets = (value: unknown, role: SkillRole): PromptTarget[] => {
  const targets = Array.isArray(value)
    ? value.filter((item): item is PromptTarget => item === "image" || item === "video")
    : [];
  if (targets.length) return [...new Set(targets)];
  return role === "base_prompt_policy" || role === "style_profile" ? ["image", "video"] : [];
};

const asTriggerPhrases = (value: unknown) => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，\n]/) : [];
  return [...new Set(raw.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.slice(0, 80)))].slice(0, 20);
};

const asPriority = (value: unknown, role: SkillRole) => {
  const fallback = role === "style_profile" ? 200 : role === "base_prompt_policy" ? 150 : 100;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(999, Math.floor(parsed))) : fallback;
};

const validateSkillMarkdown = (value: unknown) => {
  const markdown = asText(value, "SKILL.md", 50_000);
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) throw new Error("SKILL.md must start with YAML frontmatter.");
  const metadata = frontmatter[1];
  const name = metadata.match(/^name:\s*([^\r\n]+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  const description = metadata.match(/^description:\s*([^\r\n]+)$/m)?.[1]?.trim();
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error("SKILL.md frontmatter name must use lowercase letters, numbers, and hyphens.");
  }
  if (!description) throw new Error("SKILL.md frontmatter description is required.");
  return markdown;
};

const cleanNode = (node: CanvasNode): CanvasNode => ({
  ...node,
  selected: false,
  data: {
    ...node.data,
    status: "idle",
    output: undefined,
    error: undefined,
    taskId: undefined,
    resultUrl: undefined,
    rawStatus: undefined,
    lastPollAt: undefined,
    generationContext: undefined,
    storyboardBranchSignature: undefined,
  },
});

const cleanCanvasTemplate = (value: unknown): CanvasSnapshot | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as Partial<CanvasSnapshot>;
  if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) throw new Error("Canvas template is invalid.");
  if (snapshot.nodes.length > 200) throw new Error("Canvas template cannot contain more than 200 nodes.");
  return {
    version: 1,
    projectName: typeof snapshot.projectName === "string" && snapshot.projectName.trim() ? snapshot.projectName.trim() : "Skill template",
    nodes: snapshot.nodes.map((node) => cleanNode(node)),
    edges: snapshot.edges,
    agentMemory: snapshot.agentMemory,
  };
};

const normalizeDraft = (value: unknown): SkillDraft => {
  if (!value || typeof value !== "object") throw new Error("Skill payload is required.");
  const draft = value as Partial<SkillDraft>;
  const role = asSkillRole(draft.role);
  return {
    name: asText(draft.name, "Skill name", 80),
    tagline: asText(draft.tagline, "Tagline", 160),
    skillMd: validateSkillMarkdown(draft.skillMd),
    usageScenario: asText(draft.usageScenario, "Usage scenario", 2_000),
    howToUse: asText(draft.howToUse, "How to use", 2_000),
    expectedOutput: asText(draft.expectedOutput, "Expected output", 2_000),
    category: asCategory(draft.category),
    visibility: asVisibility(draft.visibility),
    role,
    appliesTo: asPromptTargets(draft.appliesTo, role),
    triggerPhrases: asTriggerPhrases(draft.triggerPhrases),
    priority: asPriority(draft.priority, role),
    canvasTemplate: cleanCanvasTemplate(draft.canvasTemplate),
  };
};

const summaryFrom = (skill: StoredSkill): SkillSummary => ({
  id: skill.id,
  name: skill.name,
  tagline: skill.tagline,
  category: skill.category,
  visibility: skill.visibility,
  hasCanvasTemplate: Boolean(skill.canvasTemplate?.nodes.length),
  nodeCount: skill.canvasTemplate?.nodes.length || 0,
  role: skill.role || "workflow_recipe",
  appliesTo: skill.appliesTo || [],
  triggerPhrases: skill.triggerPhrases || [],
  priority: Number.isFinite(skill.priority) ? skill.priority : 100,
  createdAt: skill.createdAt,
  updatedAt: skill.updatedAt,
});

async function getLocalJson<T>(remotePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(localPath(remotePath), "utf8")) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
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

const readRemoteIndex = async (workspaceId: string) => {
  const index = await getJsonFromBunny<{ skills: SkillSummary[] }>(indexPath(workspaceId));
  return { skills: Array.isArray(index?.skills) ? index.skills : [] };
};

const readLocalIndex = async (workspaceId: string) => {
  const index = await getLocalJson<{ skills: SkillSummary[] }>(indexPath(workspaceId));
  return { skills: Array.isArray(index?.skills) ? index.skills : [] };
};

async function withLocalFallback<T>(operation: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (storageProvider() === "local") return fallback();
  try {
    return await operation();
  } catch (error) {
    if (!canUseLocalFallback()) throw error;
    console.warn("Bunny skill storage unavailable; using local skill storage.", error instanceof Error ? error.message : error);
    return fallback();
  }
}

export async function listSkills(workspaceIdValue: unknown) {
  const workspaceId = requireWorkspaceId(workspaceIdValue);
  return withLocalFallback(() => readRemoteIndex(workspaceId), () => readLocalIndex(workspaceId));
}

export async function createSkill(owner: SkillOwner, draftValue: unknown) {
  const workspaceId = requireWorkspaceId(owner.workspaceId);
  const draft = normalizeDraft(draftValue);
  const now = new Date().toISOString();
  const skill: StoredSkill = {
    ...draft,
    id: `skill-${crypto.randomUUID()}`,
    version: 1,
    visibility: draft.visibility || "private",
    role: draft.role || "workflow_recipe",
    appliesTo: draft.appliesTo || [],
    triggerPhrases: draft.triggerPhrases || [],
    priority: draft.priority || 100,
    hasCanvasTemplate: Boolean(draft.canvasTemplate?.nodes.length),
    nodeCount: draft.canvasTemplate?.nodes.length || 0,
    createdAt: now,
    updatedAt: now,
  };
  const summary = summaryFrom(skill);
  const stored = await withLocalFallback(
    async () => {
      const index = await readRemoteIndex(workspaceId);
      await uploadJsonToBunny(skillPath(workspaceId, skill.id), skill);
      await uploadJsonToBunny(indexPath(workspaceId), { skills: [summary, ...index.skills] });
      return skill;
    },
    async () => {
      const index = await readLocalIndex(workspaceId);
      await uploadLocalJson(skillPath(workspaceId, skill.id), skill);
      await uploadLocalJson(indexPath(workspaceId), { skills: [summary, ...index.skills] });
      return skill;
    },
  );
  await queryPostgres(
    `INSERT INTO mindverse_skills (id, workspace_id, created_by, name, storage_key, version, visibility, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [stored.id, workspaceId, owner.userId, stored.name, skillPath(workspaceId, stored.id), stored.version, stored.visibility, stored.createdAt],
  );
  try {
    await indexSkillDocument(stored, workspaceId);
  } catch (error) {
    console.warn("Skill was saved but RAG indexing failed.", error instanceof Error ? error.message : error);
  }
  return stored;
}

export async function getSkill(workspaceIdValue: unknown, skillId: string) {
  const workspaceId = requireWorkspaceId(workspaceIdValue);
  const owned = await queryPostgres(`SELECT 1 FROM mindverse_skills WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL LIMIT 1`, [skillId, workspaceId]);
  if (!owned.rowCount) return null;
  if (storageProvider() === "local") return getLocalJson<StoredSkill>(skillPath(workspaceId, skillId));
  try {
    const remote = await getJsonFromBunny<StoredSkill>(skillPath(workspaceId, skillId));
    if (remote || !canUseLocalFallback()) return remote;
    return getLocalJson<StoredSkill>(skillPath(workspaceId, skillId));
  } catch (error) {
    if (!canUseLocalFallback()) throw error;
    console.warn("Bunny skill storage unavailable; using local skill storage.", error instanceof Error ? error.message : error);
    return getLocalJson<StoredSkill>(skillPath(workspaceId, skillId));
  }
}

export async function updateSkill(owner: SkillOwner, skillId: string, draftValue: unknown) {
  const workspaceId = requireWorkspaceId(owner.workspaceId);
  const owned = await queryPostgres(`SELECT 1 FROM mindverse_skills WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL LIMIT 1`, [skillId, workspaceId]);
  if (!owned.rowCount) throw new Error("Skill not found.");
  const draft = normalizeDraft(draftValue);
  const stored = await withLocalFallback(
    async () => updateSkillIn("bunny", workspaceId, skillId, draft),
    async () => updateSkillIn("local", workspaceId, skillId, draft),
  );
  await queryPostgres(
    `UPDATE mindverse_skills SET name = $1, version = $2, visibility = $3, updated_at = now()
      WHERE id = $4 AND workspace_id = $5 AND deleted_at IS NULL`,
    [stored.name, stored.version, stored.visibility, skillId, workspaceId],
  );
  try {
    await indexSkillDocument(stored, workspaceId);
  } catch (error) {
    console.warn("Skill was updated but RAG indexing failed.", error instanceof Error ? error.message : error);
  }
  return stored;
}

async function updateSkillIn(storage: "bunny" | "local", workspaceId: string, skillId: string, draft: SkillDraft) {
  const storedPath = skillPath(workspaceId, skillId);
  const existing = storage === "bunny" ? await getJsonFromBunny<StoredSkill>(storedPath) : await getLocalJson<StoredSkill>(storedPath);
  if (!existing) throw new Error("Skill not found.");
  const skill: StoredSkill = {
    ...existing,
    ...draft,
    id: skillId,
    version: Math.max(1, Number(existing.version) || 1) + 1,
    visibility: draft.visibility || existing.visibility,
    role: draft.role || existing.role || "workflow_recipe",
    appliesTo: draft.appliesTo || existing.appliesTo || [],
    triggerPhrases: draft.triggerPhrases || existing.triggerPhrases || [],
    priority: draft.priority || existing.priority || 100,
    hasCanvasTemplate: Boolean(draft.canvasTemplate?.nodes.length),
    nodeCount: draft.canvasTemplate?.nodes.length || 0,
    updatedAt: new Date().toISOString(),
  };
  const index = storage === "bunny" ? await readRemoteIndex(workspaceId) : await readLocalIndex(workspaceId);
  const nextIndex = index.skills.map((item) => item.id === skillId ? summaryFrom(skill) : item);
  if (storage === "bunny") {
    await uploadJsonToBunny(storedPath, skill);
    await uploadJsonToBunny(indexPath(workspaceId), { skills: nextIndex });
  } else {
    await uploadLocalJson(storedPath, skill);
    await uploadLocalJson(indexPath(workspaceId), { skills: nextIndex });
  }
  return skill;
}

export async function deleteSkill(owner: SkillOwner, skillId: string) {
  const workspaceId = requireWorkspaceId(owner.workspaceId);
  const owned = await queryPostgres(`SELECT 1 FROM mindverse_skills WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL LIMIT 1`, [skillId, workspaceId]);
  if (!owned.rowCount) throw new Error("Skill not found.");
  await withLocalFallback(
    async () => {
      const index = await readRemoteIndex(workspaceId);
      await deleteBunnyFile(skillPath(workspaceId, skillId));
      await uploadJsonToBunny(indexPath(workspaceId), { skills: index.skills.filter((item) => item.id !== skillId) });
    },
    async () => {
      const index = await readLocalIndex(workspaceId);
      await deleteLocalJson(skillPath(workspaceId, skillId));
      await uploadLocalJson(indexPath(workspaceId), { skills: index.skills.filter((item) => item.id !== skillId) });
    },
  );
  await queryPostgres(`UPDATE mindverse_skills SET deleted_at = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2`, [skillId, workspaceId]);
  try {
    await deactivateSkillDocument(skillId, workspaceId);
  } catch (error) {
    console.warn("Skill was deleted but its RAG document could not be deactivated.", error instanceof Error ? error.message : error);
  }
}

export async function backfillSkillRagDocuments(workspaceIdValue: unknown) {
  const workspaceId = requireWorkspaceId(workspaceIdValue);
  const { skills } = await listSkills(workspaceId);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, skills.length) }, async () => {
    while (cursor < skills.length) {
      const summary = skills[cursor++];
      const skill = await getSkill(workspaceId, summary.id);
      if (skill) await indexSkillDocument(skill, workspaceId);
    }
  });
  await Promise.all(workers);
  return skills.length;
}
