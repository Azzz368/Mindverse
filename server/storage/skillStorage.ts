import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteBunnyFile, getJsonFromBunny, uploadJsonToBunny } from "./bunnyClient";
import { isValidAccessCode } from "./workflowStorage";
import type { CanvasNode, CanvasSnapshot } from "@/shared/canvas";
import {
  skillCategories,
  type SkillCategory,
  type SkillDraft,
  type SkillSummary,
  type SkillVisibility,
  type StoredSkill,
} from "@/shared/skills/skillTypes";

const accountPath = (accessCode: string) => `skills/access-${accessCode}`;
const indexPath = (accessCode: string) => `${accountPath(accessCode)}/index.json`;
const skillPath = (accessCode: string, skillId: string) => `${accountPath(accessCode)}/${skillId}.json`;
const localStorageRoot = () =>
  process.env.MINDVERSE_LOCAL_STORAGE_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || os.homedir(), "Mindverse", "workflow-storage");
const localPath = (remotePath: string) => path.join(localStorageRoot(), ...remotePath.split("/"));
const storageProvider = () => process.env.SKILL_STORAGE_PROVIDER || process.env.WORKFLOW_STORAGE_PROVIDER;
const canUseLocalFallback = () => storageProvider() === "local" || process.env.NODE_ENV !== "production";

const requireAccessCode = (value: unknown) => {
  if (!isValidAccessCode(value)) throw new Error("Invalid access code.");
  return String(value).trim();
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
  return {
    name: asText(draft.name, "Skill name", 80),
    tagline: asText(draft.tagline, "Tagline", 160),
    skillMd: validateSkillMarkdown(draft.skillMd),
    usageScenario: asText(draft.usageScenario, "Usage scenario", 2_000),
    howToUse: asText(draft.howToUse, "How to use", 2_000),
    expectedOutput: asText(draft.expectedOutput, "Expected output", 2_000),
    category: asCategory(draft.category),
    visibility: asVisibility(draft.visibility),
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

const readRemoteIndex = async (accessCode: string) => {
  const index = await getJsonFromBunny<{ skills: SkillSummary[] }>(indexPath(accessCode));
  return { skills: Array.isArray(index?.skills) ? index.skills : [] };
};

const readLocalIndex = async (accessCode: string) => {
  const index = await getLocalJson<{ skills: SkillSummary[] }>(indexPath(accessCode));
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

export async function listSkills(accessCodeValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  return withLocalFallback(() => readRemoteIndex(accessCode), () => readLocalIndex(accessCode));
}

export async function createSkill(accessCodeValue: unknown, draftValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  const draft = normalizeDraft(draftValue);
  const now = new Date().toISOString();
  const skill: StoredSkill = {
    ...draft,
    id: `skill-${crypto.randomUUID()}`,
    version: 1,
    visibility: draft.visibility || "private",
    hasCanvasTemplate: Boolean(draft.canvasTemplate?.nodes.length),
    nodeCount: draft.canvasTemplate?.nodes.length || 0,
    createdAt: now,
    updatedAt: now,
  };
  const summary = summaryFrom(skill);
  return withLocalFallback(
    async () => {
      const index = await readRemoteIndex(accessCode);
      await uploadJsonToBunny(skillPath(accessCode, skill.id), skill);
      await uploadJsonToBunny(indexPath(accessCode), { skills: [summary, ...index.skills] });
      return skill;
    },
    async () => {
      const index = await readLocalIndex(accessCode);
      await uploadLocalJson(skillPath(accessCode, skill.id), skill);
      await uploadLocalJson(indexPath(accessCode), { skills: [summary, ...index.skills] });
      return skill;
    },
  );
}

export async function getSkill(accessCodeValue: unknown, skillId: string) {
  const accessCode = requireAccessCode(accessCodeValue);
  if (storageProvider() === "local") return getLocalJson<StoredSkill>(skillPath(accessCode, skillId));
  try {
    const remote = await getJsonFromBunny<StoredSkill>(skillPath(accessCode, skillId));
    if (remote || !canUseLocalFallback()) return remote;
    return getLocalJson<StoredSkill>(skillPath(accessCode, skillId));
  } catch (error) {
    if (!canUseLocalFallback()) throw error;
    console.warn("Bunny skill storage unavailable; using local skill storage.", error instanceof Error ? error.message : error);
    return getLocalJson<StoredSkill>(skillPath(accessCode, skillId));
  }
}

export async function updateSkill(accessCodeValue: unknown, skillId: string, draftValue: unknown) {
  const accessCode = requireAccessCode(accessCodeValue);
  const draft = normalizeDraft(draftValue);
  return withLocalFallback(
    async () => updateSkillIn("bunny", accessCode, skillId, draft),
    async () => updateSkillIn("local", accessCode, skillId, draft),
  );
}

async function updateSkillIn(storage: "bunny" | "local", accessCode: string, skillId: string, draft: SkillDraft) {
  const storedPath = skillPath(accessCode, skillId);
  const existing = storage === "bunny" ? await getJsonFromBunny<StoredSkill>(storedPath) : await getLocalJson<StoredSkill>(storedPath);
  if (!existing) throw new Error("Skill not found.");
  const skill: StoredSkill = {
    ...existing,
    ...draft,
    id: skillId,
    version: 1,
    visibility: draft.visibility || existing.visibility,
    hasCanvasTemplate: Boolean(draft.canvasTemplate?.nodes.length),
    nodeCount: draft.canvasTemplate?.nodes.length || 0,
    updatedAt: new Date().toISOString(),
  };
  const index = storage === "bunny" ? await readRemoteIndex(accessCode) : await readLocalIndex(accessCode);
  const nextIndex = index.skills.map((item) => item.id === skillId ? summaryFrom(skill) : item);
  if (storage === "bunny") {
    await uploadJsonToBunny(storedPath, skill);
    await uploadJsonToBunny(indexPath(accessCode), { skills: nextIndex });
  } else {
    await uploadLocalJson(storedPath, skill);
    await uploadLocalJson(indexPath(accessCode), { skills: nextIndex });
  }
  return skill;
}

export async function deleteSkill(accessCodeValue: unknown, skillId: string) {
  const accessCode = requireAccessCode(accessCodeValue);
  await withLocalFallback(
    async () => {
      const index = await readRemoteIndex(accessCode);
      await deleteBunnyFile(skillPath(accessCode, skillId));
      await uploadJsonToBunny(indexPath(accessCode), { skills: index.skills.filter((item) => item.id !== skillId) });
    },
    async () => {
      const index = await readLocalIndex(accessCode);
      await deleteLocalJson(skillPath(accessCode, skillId));
      await uploadLocalJson(indexPath(accessCode), { skills: index.skills.filter((item) => item.id !== skillId) });
    },
  );
}
