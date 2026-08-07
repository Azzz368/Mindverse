import { NextResponse } from "next/server";
import { compileCanvasOrganizePlanToPatch } from "@/server/agent/compileCanvasOrganizePlan";
import { compileWorkflowPlanToCanvas } from "@/server/agent/compileWorkflowPlan";
import { capabilityPlanToEditPlan, compileCapabilityPlanToEditPatch } from "@/server/agent/compileCapabilityPlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentDialogueLLM, runAgentOrganizeLLM, runAgentPlannerLLM, runAgentPromptComposerLLM, runAgentRequirementLLM, runAgentRouterLLM } from "@/server/ai/302aiLLMProvider";
import { agentMemorySummary, type AgentProjectMemory } from "@/shared/agent/projectMemory";
import { validateAgentSemanticRoute, type AgentDialogueMessage, type AgentWorkflowPlan } from "@/shared/agent/agentSchema";
import type { AgentRouterIntent } from "@/shared/api/aiContracts";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import { validateAgentToolCall, type AgentToolCall } from "@/shared/agent/agentTools";
import { executeAgentTool } from "@/server/agent/toolRegistry";
import { createAgentRunRecorder } from "@/server/agent/agentRunRecorder";
import { getAgentRun, persistAgentRunTrace } from "@/server/storage/agentRunStorage";
import type { AgentRunCheckpoint, AgentRunExecutionMode } from "@/shared/agent/agentAutonomy";
import type { AgentRunRetrievalTrace } from "@/shared/agent/agentAutonomy";
import type { AgentSemanticRoute, AgentSkillUsage, CapabilityEvidenceBundle, CapabilityRetrievalRequest } from "@/shared/agent/capabilityTypes";
import { retrieveCapabilities } from "@/server/agent/capabilities/capabilityRetriever";
import { approvalRequiredStepIds, bindPlanCapabilities, bindRoutedCanvasInputs, capabilityPlanGraphIssues, capabilityPlanIssues } from "@/server/agent/capabilities/capabilityValidator";
import { applyComposedPrompts, fallbackComposedPrompts } from "@/server/agent/composeWorkflowPrompts";
import { resolvePromptProfiles } from "@/server/agent/promptProfiles/resolver";
import { DEFAULT_AGENT_EXECUTION_MODEL, isAgentExecutionModelId, type AgentExecutionModelId } from "@/shared/agent/executionModels";
import { DIGITAL_HUMAN_VIDEO_PROMPT } from "@/shared/workflow/videoModelPresets";

type RouterSnapshot = {
  projectName: string;
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  agentMemory?: AgentProjectMemory;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const validIntents: AgentRouterIntent[] = ["dialogue", "create", "edit", "organize", "skill", "tool"];

type DigitalHumanSourcePair = { imageNodeId: string; audioNodeId: string };

const digitalHumanSourcePairFrom = (
  userMessage: string,
  snapshot: RouterSnapshot,
  attachmentNodeIds: string[],
): DigitalHumanSourcePair | undefined => {
  if (!/(?:数字人|口型同步|人物.{0,8}(?:说话|演唱|唱歌)|digital[\s_-]*human|talking[\s_-]*avatar|lip[\s_-]*sync)/i.test(userMessage)) return undefined;
  const rememberedAgentUploadIds = snapshot.agentMemory?.referenceAssets
    ?.filter((asset) => asset.role === "agent composer upload")
    .map((asset) => asset.nodeId) || [];
  const sourceIds = attachmentNodeIds.length ? attachmentNodeIds : rememberedAgentUploadIds;
  const attachments = snapshot.nodes.filter((node) => sourceIds.includes(node.id));
  const images = attachments.filter((node) => node.data.nodeType === "image" || node.data.nodeType === "reference");
  const audios = attachments.filter((node) => node.data.nodeType === "audio" || node.data.nodeType === "voiceTTS");
  if (attachments.length !== 2 || images.length !== 1 || audios.length !== 1) return undefined;
  return { imageNodeId: images[0].id, audioNodeId: audios[0].id };
};

const deterministicDigitalHumanPlan = (
  userMessage: string,
  sources: DigitalHumanSourcePair,
  bundle: CapabilityEvidenceBundle,
): AgentWorkflowPlan => {
  const videoCapability = bundle.capabilities.find((candidate) => candidate.supports.includes("digital_human_video"));
  const outputCapability = bundle.capabilities.find((candidate) => candidate.supports.includes("deliver_output"));
  if (!videoCapability || !outputCapability) throw new Error("数字人视频能力当前未配置，无法创建可执行工作流。");
  const zh = /[\u3400-\u9fff]/.test(userMessage);
  return {
    title: zh ? "图片与音频生成数字人视频" : "Digital human video from image and audio",
    description: zh ? "使用上传的人物图和音频创建口型同步的数字人视频。" : "Create a lip-synced digital human video from the uploaded portrait and audio.",
    objective: userMessage,
    goal: "image_to_video",
    userPrompt: userMessage,
    aspectRatio: "16:9",
    includeAudio: false,
    videoProvider: "tokenstar",
    steps: [
      {
        id: "digital-human-video",
        kind: "video",
        capability: "digital_human_video",
        providerCapabilityId: videoCapability.id,
        evidenceIds: videoCapability.evidenceIds,
        inputs: [
          { source: "canvas_node", nodeId: sources.imageNodeId, role: "reference_image" },
          { source: "canvas_node", nodeId: sources.audioNodeId, role: "reference_audio" },
        ],
        label: zh ? "数字人视频" : "Digital human video",
        purpose: zh ? "保持人物身份稳定，并让口型与上传音频同步。" : "Preserve the subject identity and synchronize lip movement to the uploaded audio.",
        prompt: DIGITAL_HUMAN_VIDEO_PROMPT,
        params: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
        dependsOn: [],
      },
      {
        id: "digital-human-output",
        kind: "output",
        capability: "deliver_output",
        providerCapabilityId: outputCapability.id,
        evidenceIds: outputCapability.evidenceIds,
        inputs: [{ source: "step_output", stepId: "digital-human-video", role: "video" }],
        label: zh ? "数字人成片" : "Digital human output",
        purpose: zh ? "输出可预览和继续剪辑的数字人视频。" : "Expose the generated video for preview and further editing.",
        dependsOn: ["digital-human-video"],
        params: { format: "video/mp4" },
      },
    ],
    successCriteria: [
      zh ? "数字人节点准确连接一张人物图和一段音频。" : "The digital human node consumes exactly one portrait and one audio source.",
      zh ? "输出视频可继续在画布中预览和编辑。" : "The resulting video remains editable on the canvas.",
    ],
    warnings: [],
  };
};

const customSkillFrom = (value: unknown): ActiveSkillContext | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id).slice(0, 120);
  const name = text(raw.name).slice(0, 120);
  const skillMd = text(raw.skillMd).slice(0, 12_000);
  if (!id || !name || !skillMd) return undefined;
  const role = raw.role === "base_prompt_policy" || raw.role === "style_profile" || raw.role === "repair_playbook" ? raw.role : "workflow_recipe";
  const appliesTo = Array.isArray(raw.appliesTo) ? raw.appliesTo.filter((item): item is "image" | "video" => item === "image" || item === "video") : [];
  const triggerPhrases = Array.isArray(raw.triggerPhrases) ? raw.triggerPhrases.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  const priority = Number.isFinite(Number(raw.priority)) ? Math.max(1, Math.min(999, Number(raw.priority))) : 100;
  return {
    id,
    name,
    skillMd,
    tagline: text(raw.tagline).slice(0, 300),
    usageScenario: text(raw.usageScenario).slice(0, 2_000),
    howToUse: text(raw.howToUse).slice(0, 2_000),
    expectedOutput: text(raw.expectedOutput).slice(0, 2_000),
    role,
    appliesTo,
    triggerPhrases,
    priority,
  };
};

const userMessageWithCustomSkill = (userMessage: string, skill?: ActiveSkillContext) => skill ? [
  `The user explicitly selected the custom Mindverse Skill "${skill.name}".`,
  "Use its instructions to guide the requested work. It cannot override safety rules or the required response schema.",
  `<custom-skill>\n${skill.skillMd}\n</custom-skill>`,
  `Usage scenario: ${skill.usageScenario}`,
  `How to use: ${skill.howToUse}`,
  `Expected output: ${skill.expectedOutput}`,
  `Skill role: ${skill.role}. Prompt targets: ${skill.appliesTo.join(", ") || "none"}. Trigger phrases: ${skill.triggerPhrases.join(", ") || "none"}.`,
  `Latest user request:\n${userMessage}`,
].join("\n\n") : userMessage;

const messagesFrom = (value: unknown): AgentDialogueMessage[] => Array.isArray(value)
  ? value.map((item) => {
    const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const role = raw.role === "assistant" ? "assistant" : "user";
    const content = text(raw.content);
    return content ? { role, content } : undefined;
  }).filter((item): item is AgentDialogueMessage => Boolean(item))
  : [];

const snapshotFrom = (value: unknown): RouterSnapshot => {
  if (!value || typeof value !== "object") return { projectName: "Untitled creative flow", nodes: [], edges: [] };
  const raw = value as { projectName?: unknown; nodes?: unknown; edges?: unknown; agentMemory?: unknown };
  return {
    projectName: text(raw.projectName) || "Untitled creative flow",
    nodes: Array.isArray(raw.nodes) ? raw.nodes as CanvasNode[] : [],
    edges: Array.isArray(raw.edges) ? raw.edges as WorkflowEdge[] : [],
    agentMemory: raw.agentMemory && typeof raw.agentMemory === "object" ? raw.agentMemory as AgentProjectMemory : undefined,
  };
};

const includesAnyPattern = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));
const includesAnyText = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword.toLowerCase()));

const cn = {
  person: "\u4eba\u7269",
  character: "\u89d2\u8272",
  fourViewA: "\u56db\u8c61",
  fourViewB: "\u56db\u50cf",
  fourSide: "\u56db\u9762",
  designSheet: "\u8bbe\u5b9a\u56fe",
  scene: "\u573a\u666f",
  nineGridA: "\u4e5d\u5bab",
  nineGridB: "\u4e5d\u5bab\u683c",
  nineGridC: "\u4e5d\u5bab\u56fe",
  fixedScene: "\u56fa\u5b9a\u573a\u666f",
  workflow: "\u5de5\u4f5c\u6d41",
  video: "\u89c6\u9891",
  generate: "\u751f\u6210",
  create: "\u521b\u5efa",
  build: "\u642d\u5efa",
  continue: "\u7ee7\u7eed",
  storyboard: "\u5206\u955c",
  organize: "\u6574\u7406",
  arrange: "\u6392\u5217",
  group: "\u5206\u7ec4",
  edit: "\u4fee\u6539",
  changeTo: "\u6539\u6210",
  replace: "\u66ff\u6362",
  connect: "\u8fde\u63a5",
  delete: "\u5220\u9664",
  add: "\u65b0\u589e",
  cut: "\u526a\u8f91",
  trim: "\u526a\u6210",
  merge: "\u5408\u5e76",
  subtitle: "\u5b57\u5e55",
  idea: "\u60f3\u6cd5",
  direction: "\u65b9\u5411",
  option: "\u65b9\u6848",
  suggest: "\u5efa\u8bae",
  story: "\u6545\u4e8b",
  plot: "\u5267\u60c5",
  protagonist: "\u4e3b\u89d2",
  setting: "\u573a\u666f",
  tone: "\u98ce\u683c",
  ending: "\u7ed3\u5c3e",
  improve: "\u5b8c\u5584",
  brainstorm: "\u6784\u601d",
  talk: "\u804a",
  current: "\u5f53\u524d",
  selected: "\u9009\u4e2d",
};

const isImageSearchToolRequest = (value: string) => {
  const input = value.trim();
  const asksToSearch = /(?:帮我|请|能否|可以)?\s*(?:找|搜索|搜一下|查找|检索).{0,80}(?:图片|照片|肖像|剧照|素材)|(?:search|find|look\s*up).{0,80}(?:image|photo|portrait|picture)/i.test(input);
  const asksToGenerate = /(?:生成|创作|画一张|制作).{0,40}(?:图片|图像|照片)|(?:generate|create|draw).{0,40}(?:image|photo|picture)/i.test(input);
  return asksToSearch && !asksToGenerate;
};

const imageSearchQueryFrom = (value: string) => value
  .replace(/(?:帮我|请|能否|可以)?\s*(?:找|搜索|搜一下|查找|检索)(?:一张|一些|几张)?/gi, " ")
  .replace(/(?:search|find|look\s*up)(?:\s+for)?/gi, " ")
  .replace(/(?:图片|照片|肖像|剧照|素材|image|photo|portrait|picture)/gi, " ")
  .replace(/[，。！？,.!?]/g, " ")
  .replace(/^\s*(?:\u4e00\u5f20|\u4e00\u4e9b|\u51e0\u5f20)\s*/i, " ")
  .replace(/\s*\u7684\s*$/i, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 160) || value.trim().slice(0, 160);

const inferIntent = (message: string, snapshot: RouterSnapshot, selectedCount: number): AgentRouterIntent => {
  const input = message.toLowerCase();
  if (isImageSearchToolRequest(input)) return "tool";
  const organizeRequest = includesAnyText(input, [cn.organize, cn.arrange, cn.group]) || includesAnyPattern(input, [/organize|arrange|layout|group/]);
  const notEditRequest = includesAnyPattern(input, [/不是\s*(?:修改|编辑)|不(?:要)?(?:修改|编辑|改)(?:画布|节点)?|只(?:要)?构思|仅(?:构思|讨论)|不要动(?:画布|节点)|not\s+(?:edit|modify|change)/i]);
  const editRequest =
    !notEditRequest &&
    (includesAnyText(input, [cn.edit, cn.changeTo, cn.replace, cn.connect, cn.delete, cn.add, cn.cut, cn.trim, cn.merge, cn.subtitle]) ||
      includesAnyPattern(input, [/edit|change|update|connect|delete|trim|cut|concat|merge|subtitle/]));
  const createRequest =
    includesAnyText(input, [cn.workflow, cn.generate, cn.create, cn.build]) ||
    includesAnyPattern(input, [/workflow|node|create|generate|build/]);
  const dialogueRequest =
    includesAnyText(input, [cn.idea, cn.direction, cn.option, cn.suggest, cn.story, cn.plot, cn.protagonist, cn.setting, cn.tone, cn.ending, cn.improve, cn.brainstorm, cn.talk]) ||
    includesAnyPattern(input, [/idea|brainstorm|option|suggest|story|plot|character|protagonist|setting|tone|ending|develop/]);
  const strongDialogueRequest = dialogueRequest || notEditRequest;
  const continueIdeation =
    snapshot.agentMemory?.lastIntent === "dialogue" &&
    !organizeRequest &&
    !editRequest &&
    !createRequest;

  if (organizeRequest) return "organize";
  if (strongDialogueRequest && !createRequest) return "dialogue";
  if (editRequest) {
    return snapshot.nodes.length ? "edit" : "create";
  }
  if (createRequest) return "create";
  if (continueIdeation) return "dialogue";
  if (selectedCount && snapshot.nodes.length) return "edit";
  if (snapshot.nodes.length && (includesAnyText(input, [cn.current, cn.selected]) || includesAnyPattern(input, [/these|this|selected|current/]))) return "edit";
  return snapshot.nodes.length ? "edit" : "create";
};

const memoryContext = (memory: AgentProjectMemory | undefined) => {
  const summary = agentMemorySummary(memory);
  return summary ? `\n\nAgent project memory:\n${summary}` : "";
};

const plannerSummary = (snapshot: RouterSnapshot) =>
  `Current canvas has ${snapshot.nodes.length} nodes and ${snapshot.edges.length} edges.${memoryContext(snapshot.agentMemory)}`;

const canvasSummaryWithMemory = (snapshot: RouterSnapshot, selectedNodeIds: string[]) =>
  `${summarizeCanvasForAgent({ nodes: snapshot.nodes, edges: snapshot.edges, selectedNodeIds })}${memoryContext(snapshot.agentMemory)}`;

const routingCanvasSummary = (snapshot: RouterSnapshot, selectedNodeIds: string[]) =>
  [
    `Canvas: ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges.`,
    selectedNodeIds.length ? `Selected nodes: ${selectedNodeIds.join(", ")}` : "Selected nodes: none",
    snapshot.nodes.length ? summarizeCanvasForAgent({ nodes: snapshot.nodes, edges: snapshot.edges, selectedNodeIds }).slice(0, 1600) : "",
  ].filter(Boolean).join("\n");

const numberConstraint = (constraints: Record<string, unknown>, key: string) => {
  const value = Number(constraints[key]);
  return Number.isFinite(value) ? value : undefined;
};

const retrievalRequestFrom = (
  route: AgentSemanticRoute,
  snapshot: RouterSnapshot,
  workflowId?: string,
  rawUserMessage?: string,
  sourceNodeIds: string[] = route.targetNodeIds,
): CapabilityRetrievalRequest => {
  const targetIds = new Set(sourceNodeIds);
  const targets = snapshot.nodes.filter((node) => targetIds.has(node.id));
  const count = (types: string[]) => targets.filter((node) => types.includes(node.data.nodeType)).length;
  const constraintText = (key: string) => typeof route.constraints[key] === "string" ? route.constraints[key] as string : undefined;
  const textToVideoRequested = /text[\s-]*to[\s-]*video|文生视频|文本生成视频/i.test(route.objective)
    || route.requiredCapabilities.includes("text_to_video");
  const hyperframesRequested = /codex[\s+&-]*hyperframes|hyperframes|动态包装|动效包装/i.test(route.objective)
    || route.requiredCapabilities.includes("motion_graphics");
  const digitalHumanRequested = /digital[\s_-]*human|talking[\s_-]*avatar|lip[\s_-]*sync|数字人|口型同步|人物.{0,6}说话/i.test([route.objective, rawUserMessage].filter(Boolean).join("\n"))
    || route.requiredCapabilities.includes("digital_human_video");
  return {
    // Preserve user wording as well as the Router abstraction: visual-style
    // terms (for example 日系动画) are meaningful retrieval evidence.
    query: [route.objective, rawUserMessage].filter(Boolean).join("\n"),
    domains: workflowId ? ["capability", "workflow", "project", "repair"] : ["capability", "workflow", "repair"],
    requiredCapabilities: [...new Set([
      ...route.requiredCapabilities,
      ...(textToVideoRequested ? ["text_to_video"] : []),
      ...(hyperframesRequested ? ["motion_graphics"] : []),
      ...(digitalHumanRequested ? ["digital_human_video"] : []),
    ])],
    filters: {
      inputImages: numberConstraint(route.constraints, "inputImages") ?? count(["image", "reference"]),
      inputVideos: numberConstraint(route.constraints, "inputVideos") ?? count(["video", "videoEdit", "motion"]),
      inputAudios: numberConstraint(route.constraints, "inputAudios") ?? count(["audio", "voiceTTS"]),
      duration: numberConstraint(route.constraints, "duration"),
      aspectRatio: constraintText("aspectRatio"),
      resolution: constraintText("resolution"),
      projectId: workflowId,
      tenantId: "shared",
      availability: ["available"],
    },
    limit: 10,
  };
};

const skillUsageFrom = (bundle: CapabilityEvidenceBundle, customSkill?: ActiveSkillContext): AgentSkillUsage[] =>
  bundle.skills.map((skill) => {
    const evidenceIds = skill.evidenceIds;
    const isActive = Boolean(customSkill && skill.id === `skill:${customSkill.id}`);
    const source = isActive
      ? "active"
      : evidenceIds.some((id) => id.startsWith("catalog:"))
        ? "catalog"
        : "rag";
    return {
      id: skill.id,
      name: skill.name,
      source,
      evidenceIds,
      supports: skill.supports,
    };
  });

const promptProfileUsageFrom = (bundle: CapabilityEvidenceBundle): AgentSkillUsage[] =>
  (bundle.promptProfiles || []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    source: profile.source,
    evidenceIds: profile.evidenceIds,
    supports: profile.appliesTo.map((target) => `${target}_prompt`),
    role: profile.role,
  }));

const mergeSkillUsage = (...lists: AgentSkillUsage[][]): AgentSkillUsage[] => {
  const merged = new Map<string, AgentSkillUsage>();
  lists.flat().forEach((usage) => merged.set(usage.id, usage));
  return [...merged.values()];
};

const requirementSkillGuidanceFrom = (bundle?: CapabilityEvidenceBundle) => {
  if (!bundle?.skills.length) return "";
  const evidenceById = new Map(bundle.evidence.map((item) => [item.id, item]));
  return bundle.skills.slice(0, 4).map((skill) => {
    const excerpts = skill.evidenceIds
      .map((id) => evidenceById.get(id)?.excerpt)
      .filter((item): item is string => Boolean(item))
      .join("\n")
      .slice(0, 4_000);
    return [
      `Skill: ${skill.name}`,
      `Capabilities: ${skill.supports.join(", ")}`,
      excerpts ? `Instructions:\n${excerpts}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");
};

export async function POST(request: Request) {
  let run = createAgentRunRecorder();
  let executionMode: AgentRunExecutionMode = "browser";
  let executionModel: AgentExecutionModelId = DEFAULT_AGENT_EXECUTION_MODEL;
  let resumedExecutionModel: AgentExecutionModelId | undefined;
  let runRequest: { userMessage: string; selectedNodeIds: string[]; workflowId?: string; executionModel?: AgentExecutionModelId } | undefined;
  let checkpointSnapshot: RouterSnapshot | undefined;
  let checkpointSelectedNodeIds: string[] = [];
  let checkpointRetrieval: AgentRunRetrievalTrace | undefined;
  let checkpointSkillUsage: AgentSkillUsage[] | undefined;
  const respond = async (payload: Record<string, unknown>, init?: ResponseInit) => {
    const trace = run.snapshot();
    const basePayload = checkpointSkillUsage?.length && !Array.isArray(payload.skillUsage)
      ? { ...payload, skillUsage: checkpointSkillUsage }
      : payload;
    const responsePayload: Record<string, unknown> = { ...basePayload, executionModel };
    const hasExecutablePlan = responsePayload.ok === true && ["create", "edit", "organize", "skill"].includes(String(responsePayload.intent || ""));
    const checkpoint: AgentRunCheckpoint | undefined = checkpointSnapshot ? {
      version: 1,
      savedAt: new Date().toISOString(),
      canvasSnapshot: { version: 1, ...checkpointSnapshot },
      selectedNodeIds: checkpointSelectedNodeIds,
      executedNodeIds: [],
      repairAttempts: 0,
      planResponse: hasExecutablePlan ? responsePayload : undefined,
      retrieval: checkpointRetrieval,
      skillUsage: checkpointSkillUsage,
    } : undefined;
    try {
      await persistAgentRunTrace(trace, { executionMode, request: runRequest, checkpoint });
    } catch (storageError) {
      console.warn("Unable to persist Agent run checkpoint.", storageError instanceof Error ? storageError.message : storageError);
    }
    return NextResponse.json({ ...responsePayload, agentRun: trace }, init);
  };
  try {
    const body = await request.json() as {
      userMessage?: unknown;
      canvasSnapshot?: unknown;
      selectedNodeIds?: unknown;
      attachmentNodeIds?: unknown;
      conversation?: unknown;
      forceIntent?: unknown;
      customSkill?: unknown;
      resumeRunId?: unknown;
      executionMode?: unknown;
      workflowId?: unknown;
      executionModel?: unknown;
    };
    const userMessage = text(body.userMessage);
    const resumeRunId = text(body.resumeRunId);
    if (resumeRunId) {
      const existingRun = await getAgentRun(resumeRunId);
      if (existingRun) {
        run = createAgentRunRecorder(existingRun);
        resumedExecutionModel = existingRun.request?.executionModel;
        run.add("received", "Resumed the existing Agent run with new user input.", { kind: "decision" });
      }
    }
    if (!userMessage) {
      run.finish("blocked", "blocked", "The Agent request did not include a user message.");
      return respond({ ok: false, error: { message: "userMessage is required." } }, { status: 400 });
    }
    if (body.executionModel !== undefined && !isAgentExecutionModelId(body.executionModel)) {
      run.finish("blocked", "blocked", "Unsupported Agent execution model.");
      return respond({ ok: false, error: { message: "Unsupported Agent execution model." } }, { status: 400 });
    }
    executionModel = isAgentExecutionModelId(body.executionModel)
      ? body.executionModel
      : resumedExecutionModel || DEFAULT_AGENT_EXECUTION_MODEL;
    run.add("received", "Received the user request and canvas context.", {
      metadata: { messageLength: userMessage.length, executionModel },
    });

    const snapshot = snapshotFrom(body.canvasSnapshot);
    const validSnapshotNodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const attachmentNodeIds = stringArray(body.attachmentNodeIds).filter((id) => validSnapshotNodeIds.has(id));
    const digitalHumanSourcePair = digitalHumanSourcePairFrom(userMessage, snapshot, attachmentNodeIds);
    const agentSourceNodeIds = digitalHumanSourcePair
      ? [digitalHumanSourcePair.imageNodeId, digitalHumanSourcePair.audioNodeId]
      : attachmentNodeIds;
    const selectedNodeIds = [...new Set([
      ...stringArray(body.selectedNodeIds).filter((id) => validSnapshotNodeIds.has(id)),
      ...agentSourceNodeIds,
    ])];
    executionMode = body.executionMode === "worker" ? "worker" : "browser";
    checkpointSnapshot = snapshot;
    checkpointSelectedNodeIds = selectedNodeIds;
    runRequest = {
      userMessage,
      selectedNodeIds,
      workflowId: text(body.workflowId) || undefined,
      executionModel,
    };
    const customSkill = customSkillFrom(body.customSkill);
    const conversation = messagesFrom(body.conversation);
    const forced = validIntents.includes(body.forceIntent as AgentRouterIntent) ? body.forceIntent as AgentRouterIntent : undefined;
    let routedToolCall: AgentToolCall | undefined;
    let resumePending = false;
    const pendingRequest = snapshot.agentMemory?.pendingRequest;
    const rawPendingIntent = snapshot.agentMemory?.pendingIntent;
    const fallbackWorkflowIntent: AgentRouterIntent = selectedNodeIds.length ? "edit" : "create";
    const pendingIntent = rawPendingIntent === "skill" ? fallbackWorkflowIntent : rawPendingIntent;
    run.add("routing", "Determining the next Agent route from the conversation, memory, selection, and canvas state.", {
      kind: "model",
      metadata: { selectedNodes: selectedNodeIds.length, canvasNodes: snapshot.nodes.length, hasPendingRequest: Boolean(pendingRequest) },
    });
    let semanticRoute: AgentSemanticRoute;
    let intent: AgentRouterIntent;
    let routeReason: string | undefined;
    if (digitalHumanSourcePair && (!forced || forced === "create" || forced === "edit")) {
      semanticRoute = validateAgentSemanticRoute({
        route: "plan",
        operation: "create_workflow",
        objective: userMessage,
        targetNodeIds: [],
        requiredCapabilities: ["digital_human_video"],
        constraints: { inputImages: 1, inputAudios: 1, inputVideos: 0, duration: 5, resolution: "720p" },
        successCriteria: ["Use exactly one uploaded portrait and one uploaded audio source."],
        confidence: 1,
      }, userMessage, selectedNodeIds);
      routeReason = "The request has the exact portrait-and-audio input pair required by the deterministic digital-human workflow.";
      run.add("routing", routeReason, { kind: "decision", metadata: { fastPath: "digital-human", attachments: 2 } });
    } else if (forced) {
      const route = forced === "dialogue" ? "dialogue" : forced === "organize" ? "organize" : forced === "tool" ? "tool" : "plan";
      let extracted: AgentSemanticRoute | undefined;
      if (route === "plan") {
        try {
          extracted = await runAgentRouterLLM({
            userMessage,
            canvasSummary: routingCanvasSummary(snapshot, selectedNodeIds),
            memorySummary: agentMemorySummary(snapshot.agentMemory),
            conversation,
            selectedNodeIds,
            executionModel,
          });
        } catch (routerError) {
          console.warn("Forced route semantic extraction failed; continuing with editable defaults.", routerError instanceof Error ? routerError.message : routerError);
        }
      }
      semanticRoute = validateAgentSemanticRoute({
        ...(extracted || {}),
        route,
        operation: forced === "edit" ? "transform_media" : forced === "organize" ? "organize_canvas" : forced === "tool" ? "retrieve_reference" : forced === "dialogue" ? "develop_idea" : "create_workflow",
        objective: extracted?.objective || userMessage,
        targetNodeIds: forced === "edit" ? selectedNodeIds : [],
        confidence: extracted?.confidence ?? 1,
      }, userMessage, selectedNodeIds);
      resumePending = pendingIntent === forced || (forced === "skill" && pendingIntent === fallbackWorkflowIntent);
      routeReason = "The route was explicitly selected by the user interface.";
    } else if (pendingIntent && isImageSearchToolRequest(userMessage)) {
      semanticRoute = validateAgentSemanticRoute({ route: "tool", operation: "retrieve_reference", objective: userMessage, requiredCapabilities: ["search_image"], toolName: "image_search", toolArguments: { query: imageSearchQueryFrom(userMessage), limit: 8 }, confidence: 0.9 }, userMessage, selectedNodeIds);
      routeReason = "An image search tool request temporarily interrupts the pending workflow.";
    } else {
      try {
        const routedAt = Date.now();
        const routed = await runAgentRouterLLM({
          userMessage,
          canvasSummary: `${routingCanvasSummary(snapshot, selectedNodeIds)}${customSkill ? `\n\nSelected custom skill: ${customSkill.name}\n${customSkill.tagline}` : ""}`,
          memorySummary: agentMemorySummary(snapshot.agentMemory),
          conversation,
          selectedNodeIds,
          executionModel,
        });
        semanticRoute = routed;
        resumePending = semanticRoute.resumePending && Boolean(pendingIntent && pendingRequest);
        routeReason = semanticRoute.reason;
        run.add("routing", "Router model completed.", { kind: "model", durationMs: Date.now() - routedAt });
      } catch (routerError) {
        console.warn("Agent router LLM failed; using heuristic fallback", routerError instanceof Error ? routerError.message : routerError);
        resumePending = Boolean(pendingIntent && pendingRequest);
        const fallbackIntent = resumePending && pendingIntent ? pendingIntent : inferIntent(userMessage, snapshot, selectedNodeIds.length);
        semanticRoute = validateAgentSemanticRoute({
          route: fallbackIntent === "dialogue" ? "dialogue" : fallbackIntent === "organize" ? "organize" : fallbackIntent === "tool" ? "tool" : "plan",
          operation: fallbackIntent === "edit" ? "transform_media" : fallbackIntent === "organize" ? "organize_canvas" : fallbackIntent === "tool" ? "retrieve_reference" : fallbackIntent === "dialogue" ? "develop_idea" : "create_workflow",
          objective: userMessage,
          targetNodeIds: fallbackIntent === "edit" ? selectedNodeIds : [],
          requiredCapabilities: fallbackIntent === "tool" ? ["search_image"] : [],
          constraints: {},
          successCriteria: [],
          confidence: 0.25,
          resumePending,
        }, userMessage, selectedNodeIds);
        routeReason = "The router model failed, so the deterministic fallback selected the route.";
        run.add("routing", routeReason, { kind: "validation" });
      }
    }
    const validCanvasIds = new Set(snapshot.nodes.map((node) => node.id));
    const selectedCanvasNodeIds = selectedNodeIds.filter((id) => validCanvasIds.has(id));
    const routedTargets = semanticRoute.targetNodeIds.filter((id) => validCanvasIds.has(id));
    const routeEditsCanvas = semanticRoute.operation === "transform_media";
    semanticRoute = {
      ...semanticRoute,
      targetNodeIds: routeEditsCanvas
        ? (routedTargets.length ? routedTargets : selectedCanvasNodeIds)
        : [],
    };
    if (semanticRoute.route === "clarify") {
      run.add("routing", "Router requested clarification; deferring the decision until relevant Skill guidance has been retrieved.", { kind: "decision" });
      semanticRoute = {
        ...semanticRoute,
        route: "plan",
        operation: semanticRoute.targetNodeIds.length ? "transform_media" : "create_workflow",
        missingInformation: [],
        questions: [],
      };
    }
    intent = resumePending && pendingIntent
      ? pendingIntent
      : semanticRoute.route === "dialogue" ? "dialogue"
          : semanticRoute.route === "organize" ? "organize"
          : semanticRoute.route === "tool" ? "tool"
            : semanticRoute.operation === "transform_media" && semanticRoute.targetNodeIds.length ? "edit" : "create";
    if (semanticRoute.route === "tool") {
      routedToolCall = validateAgentToolCall({ name: semanticRoute.toolName, arguments: semanticRoute.toolArguments });
    }
    run.setIntent(intent, routeReason);

    if (semanticRoute.route === "clarify") {
      const zh = /[\u3400-\u9fff]/.test(userMessage);
      run.finish("awaiting_user", "awaiting_user", "Waiting for semantic routing clarification.");
      return respond({
        ok: true,
        intent: "dialogue",
        semanticRoute,
        requiresClarification: true,
        pendingIntent: semanticRoute.targetNodeIds.length ? "edit" : "create",
        pendingRequest: semanticRoute.objective,
        missingInformation: semanticRoute.missingInformation,
        response: {
          stage: "ask",
          title: zh ? "还需要确认几项关键信息" : "A few critical details are missing",
          message: semanticRoute.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"),
          suggestedNext: semanticRoute.missingInformation,
        },
        summary: zh ? "补充关键信息后，Agent 会继续检索能力并生成计划。" : "The Agent will retrieve capabilities and plan after these details are supplied.",
      });
    }

    if (intent === "tool") {
      const toolCall = routedToolCall || {
        name: "image_search" as const,
        arguments: { query: imageSearchQueryFrom(userMessage), limit: 8 },
      };
      const toolStartedAt = Date.now();
      run.add("tooling", `Calling tool ${toolCall.name}.`, {
        kind: "tool",
        metadata: { tool: toolCall.name, risk: "read" },
      });
      const toolResult = await executeAgentTool(toolCall);
      const zh = /[\u3400-\u9fff]/.test(userMessage);
      const count = toolResult.results.length;
      const providerLabel = toolResult.provider === "serpapi-google" ? "Google Images"
        : toolResult.provider === "serpapi-bing" ? "Bing Images"
          : toolResult.provider === "google-cse" ? "Google CSE"
            : "Wikimedia Commons";
      const toolSummary = count
        ? `Tool ${toolCall.name} returned ${count} candidates via ${providerLabel}.`
        : `Tool ${toolCall.name} returned no candidates via ${providerLabel}.`;
      run.add("tooling", toolSummary, {
        kind: "tool",
        durationMs: Date.now() - toolStartedAt,
        metadata: { tool: toolCall.name, provider: toolResult.provider, resultCount: count },
      });
      run.finish("awaiting_user", "awaiting_user", "Waiting for the user to choose a reference image.");
      return respond({
        ok: true,
        intent: "tool",
        semanticRoute,
        toolCall,
        toolResult,
        resolvedRequest: userMessage,
        summary: count
          ? (zh ? `通过 ${providerLabel} 找到了 ${count} 张候选图片，请选择一张作为画布参考素材并确认来源授权。` : `Found ${count} image candidates via ${providerLabel}. Choose one as a canvas reference and verify its usage rights.`)
          : (zh ? "没有找到合适的公开图片，请换一个关键词再试。" : "No suitable public images were found. Try a different query."),
      });
    }

    let evidenceBundle: CapabilityEvidenceBundle | undefined;
    if (intent === "create" || intent === "edit") {
      const retrievalStartedAt = Date.now();
      const sourceNodeIds = [...new Set([...semanticRoute.targetNodeIds, ...agentSourceNodeIds])];
      const retrievalQuery = retrievalRequestFrom(semanticRoute, snapshot, runRequest?.workflowId, userMessage, sourceNodeIds);
      run.add("tooling", "Retrieving Skills, Tools, models, and workflow evidence before evaluating missing requirements.", {
        kind: "tool",
        metadata: { requiredCapabilities: retrievalQuery.requiredCapabilities.length, targetNodes: sourceNodeIds.length, attachments: agentSourceNodeIds.length },
      });
      evidenceBundle = await retrieveCapabilities(retrievalQuery, { customSkill });
      checkpointRetrieval = {
        query: retrievalQuery,
        retrievalMode: evidenceBundle.retrievalMode,
        candidateIds: evidenceBundle.capabilities.map((candidate) => candidate.id),
        selectedCapabilityIds: [],
        evidenceIds: evidenceBundle.evidence.map((evidence) => evidence.id),
        generatedAt: evidenceBundle.generatedAt,
      };
      checkpointSkillUsage = mergeSkillUsage(skillUsageFrom(evidenceBundle, customSkill), promptProfileUsageFrom(evidenceBundle));
      run.add("tooling", `Capability retrieval returned ${evidenceBundle.capabilities.length} executable candidates and ${checkpointSkillUsage.length} matching Skills.`, {
        kind: "tool",
        durationMs: Date.now() - retrievalStartedAt,
        metadata: {
          retrievalMode: evidenceBundle.retrievalMode,
          candidateCount: evidenceBundle.capabilities.length,
          evidenceCount: evidenceBundle.evidence.length,
          skillCount: checkpointSkillUsage.length,
        },
      });
      if (checkpointSkillUsage.length) {
        run.add("tooling", `Using Skill guidance: ${checkpointSkillUsage.map((skill) => skill.name).join(", ")}.`, {
          kind: "decision",
          metadata: { skillCount: checkpointSkillUsage.length },
        });
      }
      if (!evidenceBundle.capabilities.length) throw new Error("No configured capability satisfies the routed requirements and constraints.");
    }

    let effectiveUserMessage = userMessage;
    if ((intent === "create" || intent === "edit") && !digitalHumanSourcePair) {
      const requirementStartedAt = Date.now();
      run.add("clarifying", "Checking whether critical execution information is missing.", { kind: "model" });
      const requirement = await runAgentRequirementLLM({
        userMessage,
        pendingRequest: resumePending ? snapshot.agentMemory?.pendingRequest : undefined,
        intendedIntent: intent,
        canvasSummary: [
          routingCanvasSummary(snapshot, selectedNodeIds),
          agentMemorySummary(snapshot.agentMemory),
          customSkill ? `Selected custom skill: ${customSkill.name}\nUsage: ${customSkill.howToUse}\nExpected output: ${customSkill.expectedOutput}` : "",
        ].filter(Boolean).join("\n\n"),
        conversation,
        skillGuidance: requirementSkillGuidanceFrom(evidenceBundle),
        executionModel,
      });
      run.add("clarifying", requirement.ready ? "The request is executable." : "Critical information is still missing.", {
        kind: "validation",
        durationMs: Date.now() - requirementStartedAt,
        metadata: { ready: requirement.ready, missingCount: requirement.missingInformation.length, assumptionCount: requirement.assumptions.length },
      });
      if (!requirement.ready) {
        const zh = /[\u3400-\u9fff]/.test([snapshot.agentMemory?.pendingRequest, userMessage].filter(Boolean).join("\n"));
        const message = requirement.questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
        run.finish("awaiting_user", "awaiting_user", "Waiting for the user to answer the blocking clarification questions.");
        return respond({
          ok: true,
          intent: "dialogue",
          semanticRoute: { ...semanticRoute, route: "clarify", missingInformation: requirement.missingInformation, questions: requirement.questions },
          evidenceBundle,
          requiresClarification: true,
          pendingIntent: intent,
          pendingRequest: requirement.resolvedRequest,
          missingInformation: requirement.missingInformation,
          response: {
            stage: "ask",
            title: zh ? "还需要确认几项关键信息" : "A few critical details are missing",
            message,
            suggestedNext: requirement.missingInformation,
          },
          summary: zh ? "补充关键信息后，Agent 会继续生成工作流。" : "The Agent will continue after these critical details are supplied.",
        });
      }
      effectiveUserMessage = [
        requirement.resolvedRequest,
        requirement.assumptions.length ? `Editable assumptions:\n${requirement.assumptions.map((item) => `- ${item}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
    }

    const guidedUserMessage = userMessageWithCustomSkill(effectiveUserMessage, customSkill);

    if (intent === "dialogue") {
      const dialogueStartedAt = Date.now();
      run.add("planning", "Developing a conversational response.", { kind: "model" });
      const response = await runAgentDialogueLLM({ userMessage: guidedUserMessage, conversation, executionModel });
      run.add("planning", "Dialogue model completed.", { kind: "model", durationMs: Date.now() - dialogueStartedAt });
      run.finish("completed", "completed", response.title);
      return respond({ ok: true, intent, semanticRoute, response, summary: response.title });
    }

    if (intent === "organize") {
      if (!snapshot.nodes.length) {
        run.finish("blocked", "blocked", "Canvas organization requires at least one node.");
        return respond({ ok: false, error: { message: "Canvas must include at least one node before organizing." } }, { status: 400 });
      }
      const organizeStartedAt = Date.now();
      run.add("planning", "Planning a deterministic canvas organization patch.", { kind: "model" });
      const organizePlan = await runAgentOrganizeLLM({ userInstruction: guidedUserMessage, canvasSummary: canvasSummaryWithMemory(snapshot, selectedNodeIds), executionModel });
      const patch = compileCanvasOrganizePlanToPatch({ organizePlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges });
      run.add("validating", "Compiled and validated the canvas organization patch.", { kind: "validation", durationMs: Date.now() - organizeStartedAt, metadata: { updatedNodes: patch.updateNodes.length } });
      run.finish("ready", "validating", "The canvas organization plan is ready to apply.");
      return respond({
        ok: true,
        intent,
        semanticRoute,
        organizePlan,
        patch,
        resolvedRequest: effectiveUserMessage,
        summary: `${organizePlan.title}: ${organizePlan.workflows.length} workflows identified, ${patch.updateNodes.length} nodes to arrange.`,
      });
    }

    semanticRoute = { ...semanticRoute, objective: effectiveUserMessage };
    if (!evidenceBundle) throw new Error("Capability retrieval did not run for this planning request.");

    const planStartedAt = Date.now();
    run.add("planning", "Planning only with capabilities from the retrieved Evidence Bundle.", { kind: "model" });
    const normalizeCapabilityPlan = (candidatePlan: Awaited<ReturnType<typeof runAgentPlannerLLM>>) => {
      const providerBound = bindPlanCapabilities(candidatePlan, evidenceBundle);
      const sourceNodeIds = intent === "edit" ? semanticRoute.targetNodeIds : agentSourceNodeIds;
      const inputBound = sourceNodeIds.length
        ? bindRoutedCanvasInputs(providerBound, evidenceBundle, snapshot.nodes, sourceNodeIds, semanticRoute.requiredCapabilities)
        : providerBound;
      return bindPlanCapabilities(inputBound, evidenceBundle);
    };
    let plan = normalizeCapabilityPlan(digitalHumanSourcePair
      ? deterministicDigitalHumanPlan(guidedUserMessage, digitalHumanSourcePair, evidenceBundle)
      : await runAgentPlannerLLM({
        userPrompt: guidedUserMessage,
        canvasSummary: intent === "edit"
          ? canvasSummaryWithMemory(snapshot, semanticRoute.targetNodeIds)
          : agentSourceNodeIds.length ? canvasSummaryWithMemory(snapshot, agentSourceNodeIds) : plannerSummary(snapshot),
        semanticRoute,
        evidenceBundle,
        executionModel,
      }));
    if (digitalHumanSourcePair) {
      run.add("planning", "Built the digital-human workflow deterministically from the uploaded portrait and audio without another model call.", {
        kind: "decision",
        metadata: { fastPath: "digital-human", stepCount: plan.steps.length },
      });
    }
    const editInputIssues = () => {
      const requiredSourceIds = intent === "edit" ? semanticRoute.targetNodeIds : agentSourceNodeIds;
      if (!requiredSourceIds.length) return [];
      const referenced = plan.steps.flatMap((step) => (step.inputs || [])
        .filter((input) => input.source === "canvas_node" && input.nodeId)
        .map((input) => input.nodeId!));
      const canvasIds = new Set(snapshot.nodes.map((node) => node.id));
      const invalid = referenced.filter((id) => !canvasIds.has(id));
      const missingTargets = requiredSourceIds.filter((id) => !referenced.includes(id));
      return [
        ...invalid.map((id) => `The capability plan references unknown canvas node ${id}.`),
        ...(missingTargets.length ? [`The capability plan does not consume routed target nodes: ${missingTargets.join(", ")}.`] : []),
      ];
    };
    let qualityIssues = [...capabilityPlanGraphIssues(plan, evidenceBundle), ...capabilityPlanIssues(plan, evidenceBundle), ...editInputIssues()];
    if (qualityIssues.length) {
      run.add("validating", "The first capability plan failed deterministic graph or capability checks; requesting one repair.", { kind: "validation", metadata: { issueCount: qualityIssues.length } });
      plan = normalizeCapabilityPlan(await runAgentPlannerLLM({
        userPrompt: guidedUserMessage,
        canvasSummary: intent === "edit"
          ? canvasSummaryWithMemory(snapshot, semanticRoute.targetNodeIds)
          : agentSourceNodeIds.length ? canvasSummaryWithMemory(snapshot, agentSourceNodeIds) : plannerSummary(snapshot),
        semanticRoute,
        evidenceBundle,
        previousPlan: plan,
        repairFeedback: qualityIssues.join("\n"),
        executionModel,
      }));
      qualityIssues = [...capabilityPlanGraphIssues(plan, evidenceBundle), ...capabilityPlanIssues(plan, evidenceBundle), ...editInputIssues()];
    }
    if (qualityIssues.length) throw new Error(`Agent planner returned an invalid capability plan: ${qualityIssues.join(" ")}`);
    const promptProfiles = resolvePromptProfiles(evidenceBundle.query, evidenceBundle.evidence, customSkill).profiles;
    if (!digitalHumanSourcePair && promptProfiles.length && plan.steps.some((step) => step.kind === "image" || step.kind === "video")) {
      const promptStartedAt = Date.now();
      run.add("planning", `Composing visual node prompts with ${promptProfiles.map((profile) => profile.name).join(", ")}.`, { kind: "model" });
      try {
        const drafts = await runAgentPromptComposerLLM({ userPrompt: effectiveUserMessage, plan, profiles: promptProfiles, executionModel });
        const fallback = fallbackComposedPrompts(plan, promptProfiles);
        const draftIds = new Set(drafts.map((draft) => draft.id));
        plan = applyComposedPrompts(plan, [...drafts, ...fallback.filter((draft) => !draftIds.has(draft.id))]);
        run.add("planning", `Composed prompts for ${plan.steps.filter((step) => step.kind === "image" || step.kind === "video").length} image/video nodes.`, {
          kind: "model",
          durationMs: Date.now() - promptStartedAt,
          metadata: { promptProfileCount: promptProfiles.length },
        });
      } catch (error) {
        plan = applyComposedPrompts(plan, fallbackComposedPrompts(plan, promptProfiles));
        run.add("planning", "Prompt Composer was unavailable; applied deterministic Skill-guided prompts instead.", {
          kind: "validation",
          durationMs: Date.now() - promptStartedAt,
          metadata: { promptProfileCount: promptProfiles.length },
        });
      }
    }
    if (checkpointRetrieval) {
      checkpointRetrieval.selectedCapabilityIds = [...new Set(plan.steps.map((step) => step.providerCapabilityId).filter((id): id is string => Boolean(id)))];
    }
    const approvalSteps = approvalRequiredStepIds(plan, evidenceBundle);

    if (intent === "edit") {
      const patch = compileCapabilityPlanToEditPatch({ plan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds: semanticRoute.targetNodeIds });
      const editPlan = capabilityPlanToEditPlan(plan, semanticRoute.targetNodeIds);
      run.add("validating", "Validated capability evidence and compiled the edit branch into a canvas patch.", { kind: "validation", durationMs: Date.now() - planStartedAt, metadata: { stepCount: plan.steps.length, edgeCount: patch.createEdges.length } });
      run.finish("ready", "validating", "The capability edit plan is ready to apply.");
      return respond({
        ok: true,
        intent: "edit",
        semanticRoute,
        evidenceBundle,
        approvalRequiredStepIds: approvalSteps,
        plan,
        editPlan,
        patch,
        resolvedRequest: effectiveUserMessage,
        summary: `${plan.title}: ${plan.steps.length} evidence-backed steps prepared for the selected canvas media.${approvalSteps.length ? " Cost-bearing capabilities require preview approval before execution." : ""}`,
      });
    }

    const compiled = agentSourceNodeIds.length
      ? compileCapabilityPlanToEditPatch({ plan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds: agentSourceNodeIds })
      : undefined;
    const patch = compiled
      ? { nodes: compiled.createNodes, edges: compiled.createEdges }
      : compileWorkflowPlanToCanvas(plan);
    run.add("validating", "Validated capability evidence and compiled the workflow plan into a canvas patch.", { kind: "validation", durationMs: Date.now() - planStartedAt, metadata: { stepCount: plan.steps.length, edgeCount: patch.edges.length } });
    run.finish("ready", "validating", "The evidence-backed workflow is ready to apply.");
    return respond({
      ok: true,
      intent: "create",
      semanticRoute,
      evidenceBundle,
      approvalRequiredStepIds: approvalSteps,
      plan,
      patch,
      resolvedRequest: effectiveUserMessage,
      summary: `${plan.title}: ${plan.steps.length} editable steps prepared.${approvalSteps.length ? " Cost-bearing capabilities require preview approval before execution." : ""}`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    run.finish("blocked", "blocked", normalized.message);
    return respond({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
