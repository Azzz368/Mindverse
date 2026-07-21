import { listAgentSkills, readAgentSkill } from "./skillLoader";
import { agentWorkflowSkills } from "@/shared/agent/workflowSkills";
import type { AgentProjectMemory } from "@/shared/agent/projectMemory";
import type { AgentObservationReport } from "@/shared/agent/agentAutonomy";

const languageInstructionFor = (text: string) =>
  /[\u3400-\u9fff]/.test(text)
    ? "The user writes Chinese. All human-readable values must be Simplified Chinese. JSON keys and enum values stay English."
    : "Preserve the user's language for all human-readable values. JSON keys and enum values stay English.";

export function buildAgentPlannerMessages(
  userPrompt: string,
  canvasSummary?: string,
  repair?: { previousPlan: unknown; feedback: string },
) {
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
        repair ? `Previous workflow plan:\n${JSON.stringify(repair.previousPlan, null, 2)}` : "",
        repair ? `Plan quality feedback:\n${repair.feedback}` : "",
        "Create the best initial editable workflow plan.",
      ].filter(Boolean).join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

export function buildAgentRequirementMessages({
  userMessage,
  pendingRequest,
  intendedIntent,
  canvasSummary,
  conversation,
}: {
  userMessage: string;
  pendingRequest?: string;
  intendedIntent: "create" | "edit" | "skill";
  canvasSummary: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const languageSource = [pendingRequest, userMessage, ...conversation.map((item) => item.content)].filter(Boolean).join("\n");
  return [
    {
      role: "system",
      content: [
        "You are the Mindverse execution requirement analyst.",
        languageInstructionFor(languageSource),
        "Decide whether the request contains enough information to create an editable, executable canvas plan for the intended route.",
        "Reason semantically from the full conversation, pending request, selected nodes, canvas state, and chosen Skill. Do not use keyword matching.",
        "Ask only for blocking or critical information whose absence changes the operation target, graph topology, number of deliverables, required source assets, or an explicitly important output constraint.",
        "Do not ask about optional aesthetics or settings that can use sensible editable defaults. Record those defaults in assumptions instead.",
        "A selected canvas node is a valid source/target when the canvas summary says it is selected. Do not ask the user to provide it again.",
        "Reference assets listed in Agent memory with canvas node ids are valid existing source assets. Resolve phrases such as this person, this image, or the selected photo to those exact nodes instead of asking the user to upload them again.",
        "When this is a follow-up to a pending request, combine the pending request and latest answer into one standalone resolvedRequest.",
        "Return at most three concise questions. If ready is true, questions must be empty.",
        "Return JSON only: {\"ready\":true|false,\"resolvedRequest\":\"standalone instruction\",\"missingInformation\":[\"...\"],\"questions\":[\"...\"],\"assumptions\":[\"...\"]}.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Intended route: ${intendedIntent}`,
        pendingRequest ? `Pending request awaiting details:\n${pendingRequest}` : "Pending request: none",
        "Conversation so far:",
        JSON.stringify(conversation.slice(-12), null, 2),
        canvasSummary,
        `Latest user message:\n${userMessage}`,
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
  repairFeedback,
}: {
  userInstruction: string;
  canvasSummary: string;
  repairFeedback?: string;
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
        repairFeedback ? `Previous plan feedback:\n${repairFeedback}` : "",
        "Create a safe canvas edit plan. Return noop only when the request is impossible or unsafe; otherwise produce operations that visibly change the canvas graph.",
      ].filter(Boolean).join("\n\n"),
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
        "If Agent memory contains pendingIntent and pendingRequest, decide whether the latest message answers that pending clarification. When it does, set resumePending to true and use the pending intent. When it does not, route the latest request normally.",
        "The canvas summary may include a Selected Nodes section. Treat those nodes as the user's explicit operation targets.",
        "Routes:",
        "- dialogue: brainstorm, ideate, clarify, develop a story, or continue an unfinished ideation conversation.",
        "- create: create a general editable workflow from a sufficiently clear request.",
        "- edit: modify existing canvas nodes/edges. Choose edit when selected nodes exist and the user asks to operate on selected/current/these nodes. Do not choose edit if the user says not to modify or only wants ideation.",
        "- organize: arrange/group/clean up the current canvas.",
        "- skill: call a specialized workflow skill. Use only when the user explicitly asks to generate/build/place that specialized workflow.",
        "- tool: call a bounded external tool and return its results for user choice. Use image_search when the user asks to search/find/look up existing online photos or image references. Do not use it when the user asks an image model to generate a new image.",
        "For image_search, provide a concise searchable query. Translate a person's Chinese name to its widely used international name when helpful, while preserving distinctive qualifiers from the request.",
        "Important: If the user says '构思', '不是修改', '只构思', or is adding story details while the last memory intent is dialogue, choose dialogue unless they explicitly request workflow generation.",
        "Return JSON only: {\"intent\":\"dialogue|create|edit|organize|skill|tool\",\"skillId\":\"fixed-scene-action-video optional\",\"toolName\":\"image_search optional\",\"toolArguments\":{\"query\":\"search query\",\"limit\":8},\"resumePending\":false,\"reason\":\"short reason\"}.",
        "",
        "Available core skills:",
        coreSkills,
        "",
        "Available workflow skills:",
        workflowSkills,
        "",
        "Available tools:",
        "- image_search: search the configured full-web image provider (Google Images or Bing Images, with Wikimedia fallback) and return source-linked candidates for the user to choose from.",
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

export function buildAgentVerifierMessages({
  userMessage,
  observation,
  attempt,
  maxRepairAttempts,
}: {
  userMessage: string;
  observation: AgentObservationReport;
  attempt: number;
  maxRepairAttempts: number;
}) {
  return [
    {
      role: "system",
      content: [
        "You are Mindverse Run Verifier.",
        languageInstructionFor(userMessage),
        "Judge only from the supplied structured observation. Do not claim to have watched or listened to media.",
        "Return completed only when executed nodes are terminal, successful, and no reported issue contradicts the request.",
        "Return repair when a node parameter, graph connection, provider choice, duration, aspect ratio, or retry can plausibly fix the run.",
        "Return blocked when user input, missing source media, credentials, provider availability, or exhausted repair attempts prevent an automatic fix.",
        "Never propose deleting or overwriting the user's original source media.",
        "Return JSON only: {\"status\":\"completed|repair|blocked\",\"summary\":\"...\",\"repairInstruction\":\"required only for repair\"}.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Original user request:\n${userMessage}`,
        `Repair attempt: ${attempt} of ${maxRepairAttempts}`,
        "Structured observation:",
        JSON.stringify(observation, null, 2),
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}
