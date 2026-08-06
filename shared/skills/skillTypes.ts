import type { CanvasSnapshot } from "@/shared/canvas";

export const skillCategories = ["image", "video", "audio", "story", "agent", "motion"] as const;

export type SkillCategory = (typeof skillCategories)[number];
export type SkillVisibility = "private" | "public" | "unlisted";
export const skillRoles = ["workflow_recipe", "base_prompt_policy", "style_profile", "repair_playbook"] as const;
export type SkillRole = (typeof skillRoles)[number];
export const promptTargets = ["image", "video"] as const;
export type PromptTarget = (typeof promptTargets)[number];

export type SkillSummary = {
  id: string;
  name: string;
  tagline: string;
  category: SkillCategory;
  visibility: SkillVisibility;
  hasCanvasTemplate: boolean;
  nodeCount: number;
  role: SkillRole;
  appliesTo: PromptTarget[];
  triggerPhrases: string[];
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export type SkillDraft = {
  name: string;
  tagline: string;
  skillMd: string;
  usageScenario: string;
  howToUse: string;
  expectedOutput: string;
  category: SkillCategory;
  visibility?: SkillVisibility;
  role?: SkillRole;
  appliesTo?: PromptTarget[];
  triggerPhrases?: string[];
  priority?: number;
  canvasTemplate?: CanvasSnapshot;
};

export type StoredSkill = SkillSummary & {
  version: number;
  skillMd: string;
  usageScenario: string;
  howToUse: string;
  expectedOutput: string;
  canvasTemplate?: CanvasSnapshot;
};

export type ActiveSkillContext = Pick<StoredSkill, "id" | "name" | "tagline" | "skillMd" | "usageScenario" | "howToUse" | "expectedOutput" | "role" | "appliesTo" | "triggerPhrases" | "priority">;

export const skillCategoryLabels: Record<SkillCategory, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  story: "故事",
  agent: "Agent",
  motion: "动效",
};

export const skillRoleLabels: Record<SkillRole, string> = {
  workflow_recipe: "工作流配方",
  base_prompt_policy: "基础提示词规范",
  style_profile: "风格 Profile",
  repair_playbook: "修复/排错规范",
};

export const defaultSkillMarkdown = `---
name: new-skill
description: Use this skill to turn a creative brief into a reusable Mindverse workflow.
---

# 做什么

用一句话说明这个 Skill 要完成的创作任务。

# 需要什么输入

列出用户最少需要提供的内容，以及可以选择提供的素材或风格。

# 怎么做

写清关键步骤、约束和判断标准。只保留 Agent 真正需要遵循的内容。

# 产出什么

说明最终交付物，例如画布工作流、图片、视频、音频或分镜。

# 什么时候询问用户

列出必须暂停并确认的情况，其余情况由 Agent 自主完成。
`;
