import { listAgentSkills, readAgentSkill } from "./skillLoader";
import { agentWorkflowSkills } from "@/shared/agent/workflowSkills";
import type { AgentProjectMemory } from "@/shared/agent/projectMemory";

const languageInstructionFor = (text: string) =>
  /[\u3400-\u9fff]/.test(text)
    ? "The user writes Chinese. All human-readable values must be Simplified Chinese. JSON keys and enum values stay English."
    : "Preserve the user's language for all human-readable values. JSON keys and enum values stay English.";

export function buildAgentPlannerMessages(userPrompt: string, canvasSummary?: string) {
  return [
    {
      role: "system",
      content: [
        readAgentSkill("workflow-planner"),
        languageInstructionFor(userPrompt),
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User creative request:\n${userPrompt}`,
        canvasSummary ? `Current canvas summary:\n${canvasSummary}` : "Current canvas summary: empty or unavailable.",
        "Create the best initial editable workflow plan.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

export function buildAgentDialogueMessages({
  userMessage,
  conversation,
}: {
  userMessage: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const languageSource = [userMessage, ...conversation.map((item) => item.content)].join("\n");
  return [
    {
      role: "system",
      content: [
        readAgentSkill("ideation-dialogue"),
        languageInstructionFor(languageSource),
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        "Conversation so far:",
        JSON.stringify(conversation.slice(-12), null, 2),
        "Latest user message:",
        userMessage,
        "Continue the ideation dialogue.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

export function buildAgentEditMessages({
  userInstruction,
  canvasSummary,
}: {
  userInstruction: string;
  canvasSummary: string;
}) {
  return [
    {
      role: "system",
      content: [
        readAgentSkill("canvas-edit"),
        languageInstructionFor(userInstruction),
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User edit instruction:\n${userInstruction}`,
        canvasSummary,
        "Create a safe canvas edit plan.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

export function buildAgentOrganizeMessages({
  userInstruction,
  canvasSummary,
}: {
  userInstruction: string;
  canvasSummary: string;
}) {
  return [
    {
      role: "system",
      content: [
        readAgentSkill("canvas-organize"),
        languageInstructionFor(userInstruction),
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User organization instruction:\n${userInstruction}`,
        canvasSummary,
        "Create a safe canvas organization plan.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

const excerpt = (value: string, max = 1800) => value.trim().slice(0, max);

export function buildAgentRouterMessages({
  userMessage,
  canvasSummary,
  memorySummary,
  conversation,
}: {
  userMessage: string;
  canvasSummary: string;
  memorySummary?: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  agentMemory?: AgentProjectMemory;
}) {
  const coreSkills = listAgentSkills()
    .map((skill) => `## ${skill.name}\n${excerpt(skill.content)}`)
    .join("\n\n");
  const workflowSkills = Object.values(agentWorkflowSkills)
    .map((skill) => [
      `## workflow-skill:${skill.id}`,
      `Label: ${skill.label}`,
      `Description: ${skill.description}`,
      "Use this only when the user explicitly asks to generate/build/place this workflow, not during open-ended ideation.",
    ].join("\n"))
    .join("\n\n");

  return [
    {
      role: "system",
      content: [
        "You are Mindverse Agent Router. Choose exactly one route for the latest user message.",
        languageInstructionFor(userMessage),
        "Read the available skill descriptions. Route by intent and context, not by shallow keyword matching.",
        "Routes:",
        "- dialogue: brainstorm, ideate, clarify, develop a story, or continue an unfinished ideation conversation.",
        "- create: create a general editable workflow from a sufficiently clear request.",
        "- edit: modify existing canvas nodes/edges. Do not choose edit if the user says not to modify or only wants ideation.",
        "- organize: arrange/group/clean up the current canvas.",
        "- skill: call a specialized workflow skill. Use only when the user explicitly asks to generate/build/place that specialized workflow.",
        "Important: If the user says '构思', '不是修改', '只构思', or is adding story details while the last memory intent is dialogue, choose dialogue unless they explicitly request workflow generation.",
        "Return JSON only: {\"intent\":\"dialogue|create|edit|organize|skill\",\"skillId\":\"fixed-scene-action-video optional\",\"reason\":\"short reason\"}.",
        "",
        "Available core skills:",
        coreSkills,
        "",
        "Available workflow skills:",
        workflowSkills,
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        "Conversation so far:",
        JSON.stringify(conversation.slice(-10), null, 2),
        memorySummary ? `Agent memory:\n${memorySummary}` : "Agent memory: empty",
        canvasSummary,
        "Latest user message:",
        userMessage,
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

export function buildFixedSceneSkillMessages(userBrief: string) {
  return [
    {
      role: "system",
      content: [
        "You are a fixed-scene video workflow compiler for Mindverse.",
        languageInstructionFor(userBrief),
        "Convert the user request into a structured brief for a workflow that creates character turnaround reference image(s), an empty scene nine-grid reference image, and one final video.",
        "Do not use a generic suspense template unless the user explicitly asks for suspense.",
        "The scene nine-grid must describe an empty environment only. No people, no arrows, no route lines, no labels.",
        "The video action plan must follow the user's actual action and genre. If the user says basketball shooting, write a basketball shooting action chain. If the user says cooking, write a cooking action chain. If the user says searching a room, write a searching/discovery action chain.",
        "Return JSON only with this shape: { title, story_goal, main_character_visual, secondary_character_visual, fixed_location_visual, video_action_plan, style, shot_plan, continuity_rules, aspect_ratio, duration_seconds }.",
        "shot_plan must be an array of 3 to 8 concise shot descriptions. Each shot must include subject action, camera behavior, and how it continues from the previous shot. Do not include timestamps.",
        "Keep prompts concise but specific enough for image/video generation.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        "User fixed-scene workflow request:",
        userBrief,
        "Compile this into the structured fixed-scene brief.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}
