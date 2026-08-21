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
  image: "Image",
  video: "Video",
  audio: "Audio",
  story: "Story",
  agent: "Agent",
  motion: "Motion",
};

export const skillRoleLabels: Record<SkillRole, string> = {
  workflow_recipe: "Workflow recipe",
  base_prompt_policy: "Base prompt policy",
  style_profile: "Style profile",
  repair_playbook: "Repair and troubleshooting guide",
};

export const defaultSkillMarkdown = `---
name: new-skill
description: Use this skill to turn a creative brief into a reusable Mindverse workflow.
---

# Purpose

Describe the creative task this Skill completes in one sentence.

# Required input

List the minimum information the user must provide and any optional media or style references.

# Process

Define the key steps, constraints, and decision criteria. Include only instructions the Agent needs to follow.

# Output

Describe the final deliverable, such as a canvas workflow, image, video, audio, or storyboard.

# When to ask the user

List the cases that require confirmation. The Agent may handle all other cases autonomously.
`;
