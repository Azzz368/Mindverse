import { readAgentSkill } from "./skillLoader";
import type { AgentProjectMemory } from "@/shared/agent/projectMemory";
import type { AgentObservationReport } from "@/shared/agent/agentAutonomy";
import type { AgentSemanticRoute, CapabilityEvidenceBundle } from "@/shared/agent/capabilityTypes";
import { evidenceBundlePrompt } from "@/server/rag/retrievalBundle";

const languageInstructionFor = (text: string) =>
  /[\u3400-\u9fff]/.test(text)
    ? "The user writes Chinese. All human-readable values must be Simplified Chinese. JSON keys and enum values stay English."
    : "Preserve the user's language for all human-readable values. JSON keys and enum values stay English.";

export function buildAgentPlannerMessages(
  userPrompt: string,
  canvasSummary?: string,
  semanticRoute?: AgentSemanticRoute,
  evidenceBundle?: CapabilityEvidenceBundle,
  repair?: { previousPlan: unknown; feedback: string },
) {
  return [
    {
      role: "system",
      content: [
        readAgentSkill("workflow-planner"),
        languageInstructionFor(userPrompt),
        "Use the unified capability-plan protocol. Choose semantics and composition, but do not invent node kinds, model ids, tools, or provider limits.",
        "You may reference only providerCapabilityId values present in the Evidence Bundle. Each step must cite a provider whose kind is model or runtime and one or more evidenceIds from that candidate. Skills are planning guidance and Tools run before planning; neither is a canvas step executor.",
        "For script_generation, storyboard_generation, and text_generation use model:text:configured when it is available. For text_to_video use a retrieved text-to-video model such as model:video:seedance-2.0; never select seedance-asset-fast for a pure text-to-video step. Prefer model:video:seedance-asset-fast only for compatible asset/image-reference video steps, unless the user explicitly requested another model.",
        "Storyboard workflows are capped at 3 scenes and 3 storyboard image branches. Use fewer when requested, and reduce larger requests to the 3 essential shots.",
        "Do not add optional audio, narration, music, or extra packaging steps unless the user explicitly requested them or the request requires them to satisfy an explicit deliverable.",
        "Each step must contain: id, capability, providerCapabilityId, evidenceIds, typed inputs, label, params, and dependsOn.",
        "Typed input shape: {source:'canvas_node'|'step_output'|'user_input', nodeId?:string, stepId?:string, role:'prompt|story_brief|source_text|reference_image|source_video|reference_audio|background_music|...' }.",
        "Do not output kind. Mindverse maps capability to a concrete node type deterministically after validation.",
        "For existing selected media, reference its exact id with source=canvas_node. For generated dependencies, use source=step_output and the exact stepId.",
        "If one capability cannot satisfy every constraint, compose multiple retrieved capabilities, for example multi-reference video followed by FFmpeg background-music editing.",
        "Return shape: {title,objective,description,goal,userPrompt,style,aspectRatio,sceneCount,includeAudio,steps:[{id,capability,providerCapabilityId,evidenceIds,inputs,label,purpose,prompt,params,dependsOn}],successCriteria,warnings}.",
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User creative request:\n${userPrompt}`,
        semanticRoute ? `Semantic route and constraints:\n${JSON.stringify(semanticRoute, null, 2)}` : "",
        evidenceBundle ? `Retrieved Evidence Bundle (the complete allowed capability set):\n${evidenceBundlePrompt(evidenceBundle)}` : "",
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
  skillGuidance,
}: {
  userMessage: string;
  pendingRequest?: string;
  intendedIntent: "create" | "edit" | "skill";
  canvasSummary: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  skillGuidance?: string;
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
        "Style, camera movement, transitions, and per-shot staging are non-blocking unless the user explicitly says they must choose them. A request with a source subject/reference, duration, story action, shot count, and final deliverable is already executable.",
        "If the user requests N storyboard images or shots but leaves their exact staging open, infer N distinct editable scene descriptions from the supplied story instead of asking the user to write every shot.",
        "A selected canvas node is a valid source/target when the canvas summary says it is selected. Do not ask the user to provide it again.",
        "Reference assets listed in Agent memory with canvas node ids are valid existing source assets. Resolve phrases such as this person, this image, or the selected photo to those exact nodes instead of asking the user to upload them again.",
        "Retrieved Skills are planning guidance. When a retrieved Skill explicitly permits defaults or tells you to infer a detail, follow it and record the result as an editable assumption instead of asking a question.",
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
        skillGuidance ? `Retrieved Skill guidance:\n${skillGuidance}` : "Retrieved Skill guidance: none",
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
  return [
    {
      role: "system",
      content: [
        "You are Mindverse Semantic Router. Understand what the user wants, but never choose concrete canvas nodes, Skills, models, or workflow templates.",
        languageInstructionFor(userMessage),
        "Extract the objective, exact target canvas node ids, required abstract capabilities, hard constraints, and observable success criteria.",
        "Route by intent and context, not by shallow keyword matching.",
        "If Agent memory contains pendingIntent and pendingRequest, decide whether the latest message answers that pending clarification. When it does, set resumePending to true and use the pending intent. When it does not, route the latest request normally.",
        "The canvas summary may include a Selected Nodes section. Treat those nodes as the user's explicit operation targets.",
        "Routes:",
        "- dialogue: brainstorm, ideate, clarify, develop a story, or continue an unfinished ideation conversation.",
        "- plan: create a new workflow or transform selected/current media. Do not decide the graph here.",
        "- clarify: critical missing information changes the target, required source assets, graph topology, or explicitly required output. Include concise questions.",
        "- organize: arrange/group/clean up the current canvas.",
        "- tool: call a bounded external tool and return its results for user choice. Use image_search when the user asks to search/find/look up existing online photos or image references. Do not use it when the user asks an image model to generate a new image.",
        "Operation values: create_workflow, transform_media, generate_media, organize_canvas, retrieve_reference, develop_idea, custom.",
        "Capabilities are abstract snake_case needs such as image_generation, multi_reference_video, background_music, video_edit, motion_graphics, title_overlay, character_consistency, or search_image. Do not output provider or Skill names as capabilities.",
        "Do not mark optional aesthetics as missing. Use editable constraints/defaults. Ask at most three questions.",
        "Important: If the user says '构思', '不是修改', '只构思', or is adding story details while the last memory intent is dialogue, choose dialogue unless they explicitly request workflow generation.",
        "Return JSON only: {\"route\":\"plan|clarify|dialogue|tool|organize\",\"operation\":\"...\",\"objective\":\"...\",\"targetNodeIds\":[\"exact-id\"],\"requiredCapabilities\":[\"...\"],\"constraints\":{},\"successCriteria\":[\"...\"],\"missingInformation\":[],\"questions\":[],\"confidence\":0.0,\"resumePending\":false,\"reason\":\"...\",\"toolName\":\"image_search optional\",\"toolArguments\":{}}.",
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
