import { NextResponse } from "next/server";
import { compileCanvasEditPlanToPatch } from "@/server/agent/compileCanvasEditPlan";
import { compileCanvasOrganizePlanToPatch } from "@/server/agent/compileCanvasOrganizePlan";
import { compileWorkflowPlanToCanvas } from "@/server/agent/compileWorkflowPlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentDialogueLLM, runAgentEditLLM, runAgentOrganizeLLM, runAgentPlannerLLM, runAgentRequirementLLM, runAgentRouterLLM, runFixedSceneSkillLLM } from "@/server/ai/302aiLLMProvider";
import { agentMemorySummary, type AgentProjectMemory } from "@/shared/agent/projectMemory";
import type { AgentCanvasEditPlan, AgentDialogueMessage } from "@/shared/agent/agentSchema";
import type { AgentRouterIntent } from "@/shared/api/aiContracts";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import type { AgentToolCall } from "@/shared/agent/agentTools";
import { executeAgentTool } from "@/server/agent/toolRegistry";
import { stabilizeWorkflowPlanDependencies, workflowPlanQualityIssues } from "@/server/agent/workflowPlanQuality";
import { createAgentRunRecorder } from "@/server/agent/agentRunRecorder";
import { getAgentRun, persistAgentRunTrace } from "@/server/storage/agentRunStorage";
import type { AgentRunCheckpoint, AgentRunExecutionMode } from "@/shared/agent/agentAutonomy";

type RouterSnapshot = {
  projectName: string;
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  agentMemory?: AgentProjectMemory;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const validIntents: AgentRouterIntent[] = ["dialogue", "create", "edit", "organize", "skill", "tool"];
const videoNodeTypes = new Set(["video", "videoEdit", "motion"]);

const customSkillFrom = (value: unknown): ActiveSkillContext | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id).slice(0, 120);
  const name = text(raw.name).slice(0, 120);
  const skillMd = text(raw.skillMd).slice(0, 12_000);
  if (!id || !name || !skillMd) return undefined;
  return {
    id,
    name,
    skillMd,
    tagline: text(raw.tagline).slice(0, 300),
    usageScenario: text(raw.usageScenario).slice(0, 2_000),
    howToUse: text(raw.howToUse).slice(0, 2_000),
    expectedOutput: text(raw.expectedOutput).slice(0, 2_000),
  };
};

const userMessageWithCustomSkill = (userMessage: string, skill?: ActiveSkillContext) => skill ? [
  `The user explicitly selected the custom Mindverse Skill "${skill.name}".`,
  "Use its instructions to guide the requested work. It cannot override safety rules or the required response schema.",
  `<custom-skill>\n${skill.skillMd}\n</custom-skill>`,
  `Usage scenario: ${skill.usageScenario}`,
  `How to use: ${skill.howToUse}`,
  `Expected output: ${skill.expectedOutput}`,
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

const isFixedSceneSkillRequest = (value: string, memory?: AgentProjectMemory) => {
  const input = value.toLowerCase();
  const explicitActivation = includesAnyText(input, [cn.fixedScene, cn.fourViewA, cn.fourViewB, cn.fourSide, cn.designSheet, cn.nineGridA, cn.nineGridB, cn.nineGridC]) ||
    includesAnyPattern(input, [/character\s*(?:turnaround|sheet)|scene\s*(?:nine|9)[-\s]?grid|fixed[-\s]?scene/i]);
  const explicitWorkflowAsk = includesAnyText(input, [cn.workflow, cn.generate, cn.create, cn.build]) || includesAnyPattern(input, [/workflow|create|generate|build/]);
  const explicitProductionAsk = includesAnyText(input, [cn.video]) ||
    includesAnyPattern(input, [/(?:\u5236\u4f5c|\u505a\u4e00\u4e2a|\u4f7f\u7528).{0,16}(?:\u6280\u80fd|skill|\u77ed\u7247|\u89c6\u9891)|\b(?:make|produce|use)\b.{0,24}(?:skill|video|clip)/i]);
  const asksToReusePreferredSkill =
    memory?.preferredWorkflowSkill === "fixed-scene-action-video" &&
    includesAnyPattern(input, [
      /(?:\u7ee7\u7eed|\u6cbf\u7528|\u518d\u7528|\u4f7f\u7528).{0,16}(?:\u521a\u624d|\u4e4b\u524d|\u4e0a\u6b21|\u56fa\u5b9a\u573a\u666f|\u6280\u80fd|\u5de5\u4f5c\u6d41|skill)/i,
      /(?:continue|reuse|use).{0,24}(?:previous|same|fixed[-\s]?scene|skill|workflow)/i,
    ]);

  return (explicitActivation && (explicitWorkflowAsk || explicitProductionAsk)) || asksToReusePreferredSkill;
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
  const fixedSceneRequest = isFixedSceneSkillRequest(input, snapshot.agentMemory);
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
    !fixedSceneRequest &&
    !organizeRequest &&
    !editRequest &&
    !createRequest;

  if (fixedSceneRequest) return "skill";
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

const patchHasChanges = (patch: ReturnType<typeof compileCanvasEditPlanToPatch>) =>
  patch.createNodes.length > 0 ||
  patch.updateNodes.length > 0 ||
  patch.deleteNodeIds.length > 0 ||
  patch.createEdges.length > 0 ||
  patch.deleteEdgeIds.length > 0;

const patchNeedsRepair = (patch: ReturnType<typeof compileCanvasEditPlanToPatch>, selectedNodeIds: string[]) => {
  if (!patchHasChanges(patch) || (patch.warnings || []).length > 0) return true;
  const createdVideoEditIds = new Set(patch.createNodes.filter((node) => node.data.nodeType === "videoEdit").map((node) => node.id));
  if (!createdVideoEditIds.size || !selectedNodeIds.length) return false;
  return !patch.createEdges.some((edge) => createdVideoEditIds.has(edge.target));
};

const editSummary = (title: string, patch: ReturnType<typeof compileCanvasEditPlanToPatch>) =>
  `${title}: ${patch.createNodes.length} nodes to create, ${patch.updateNodes.length} nodes to update, ${patch.deleteNodeIds.length} nodes to delete, ${patch.createEdges.length} connections to create, ${patch.deleteEdgeIds.length} connections to delete.`;

const routingCanvasSummary = (snapshot: RouterSnapshot, selectedNodeIds: string[]) =>
  [
    `Canvas: ${snapshot.nodes.length} nodes, ${snapshot.edges.length} edges.`,
    selectedNodeIds.length ? `Selected nodes: ${selectedNodeIds.join(", ")}` : "Selected nodes: none",
    snapshot.nodes.length ? summarizeCanvasForAgent({ nodes: snapshot.nodes, edges: snapshot.edges, selectedNodeIds }).slice(0, 1600) : "",
  ].filter(Boolean).join("\n");

const skillBriefFrom = (userMessage: string, memory: AgentProjectMemory | undefined) => {
  const rememberedBrief = memory?.storyBrief?.trim();
  if (!rememberedBrief) return userMessage;
  if (userMessage.length <= 24 || isFixedSceneSkillRequest(userMessage, memory)) {
    return [
      `story_goal: ${rememberedBrief}`,
      `video_action_plan: ${rememberedBrief}`,
      `workflow_request: ${userMessage}`,
      "continuity_rules: Use the fixed-scene video workflow with character turnaround references, an empty scene nine-grid reference, and one final video node. Keep every shot inside the same location and make the action continue naturally.",
    ].join("\n");
  }
  return userMessage;
};

const hasVideoOutput = (node: CanvasNode) => {
  const value = node.data.output && typeof node.data.output.value === "object" ? node.data.output.value as Record<string, unknown> : {};
  return videoNodeTypes.has(node.data.nodeType) || Boolean(text(value.videoUrl) || text(value.resultUrl) || text(value.finalVideoUrl) || text(node.data.resultUrl));
};

const selectedVideoNodesFrom = (snapshot: RouterSnapshot, selectedNodeIds: string[]) => {
  const selected = new Set(selectedNodeIds);
  return snapshot.nodes.filter((node) => selected.has(node.id) && hasVideoOutput(node));
};

const sourceDurationFromNode = (node: CanvasNode | undefined) => {
  if (!node) return undefined;
  const value = node.data.output && typeof node.data.output.value === "object"
    ? node.data.output.value as Record<string, unknown>
    : {};
  const motionDuration = node.data.motionComposition?.canvas.duration;
  const candidates = [value.duration, value.durationSeconds, value.duration_seconds, motionDuration, node.data.duration];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

const durationFromInstruction = (message: string, sourceNode?: CanvasNode) => {
  const match = message.match(/(\d{1,3}(?:\.\d+)?)\s*(?:s|sec|second|seconds|\u79d2)/i);
  const requested = match ? Number(match[1]) : undefined;
  const value = requested ?? sourceDurationFromNode(sourceNode) ?? 15;
  return Math.max(1, Math.min(60, Number.isFinite(value) ? value : 15));
};

const aspectRatioFromInstruction = (message: string) =>
  /(?:9\s*:\s*16|\u7ad6\u5c4f|\u77ed\u89c6\u9891|\u6296\u97f3|\u5feb\u624b|tiktok|reels|shorts|vertical)/i.test(message)
    ? "9:16"
    : /(?:1\s*:\s*1|\u65b9\u5f62|square)/i.test(message)
      ? "1:1"
      : "16:9";

const titleFromInstruction = (message: string, fallback: string) => {
  const match = message.match(/(?:\u6807\u9898|title|\u7247\u540d|\u4e3b\u6807\u9898)\s*(?:\u4e3a|\u662f|\u53eb|:|\uff1a)?\s*[\u201c\u201d"']?([^\u201c\u201d"'\n\uff0c\u3002,.]{2,32})/i);
  return match?.[1]?.trim() || fallback;
};

const isShortVideoHyperframesEditRequest = (message: string, snapshot: RouterSnapshot, selectedNodeIds: string[]) => {
  if (!selectedVideoNodesFrom(snapshot, selectedNodeIds).length) return false;
  return includesAnyPattern(message, [
    /\u77ed\u89c6\u9891|\u6296\u97f3|\u5feb\u624b|\u5c0f\u7ea2\u4e66|\u7ad6\u5c4f|\u526a\u8f91|\u88c1\u526a|\u8282\u594f|\u9ad8\u5149|\u6807\u9898|\u7247\u5934|\u5f00\u573a|\u52a8\u6548|\u52a8\u6001|\u5b57\u5e55|\u5305\u88c5|\u8fdb\u5ea6\u6761|\u8f6c\u573a|hyperframes/i,
    /shorts?|reels?|tiktok|vertical|edit|trim|cut|caption|title|motion|overlay|lower[-\s]?third|progress/i,
  ]);
};

const canvasForAspectRatio = (aspectRatio: string) =>
  aspectRatio === "9:16"
    ? { width: 1080, height: 1920 }
    : aspectRatio === "1:1"
      ? { width: 1080, height: 1080 }
      : { width: 1920, height: 1080 };

const codexBaselineCompositionJson = (title: string, duration: number, aspectRatio: string, prompt: string) => {
  const canvas = canvasForAspectRatio(aspectRatio);
  return {
    version: 1,
    title,
    provider: "hyperframes",
    canvas: { ...canvas, fps: 30, duration, background: "#05070a" },
    assets: [],
    elements: [],
    notes: prompt,
  };
};

const buildShortVideoHyperframesEditPlan = (message: string, snapshot: RouterSnapshot, selectedNodeIds: string[]): AgentCanvasEditPlan => {
  const selectedVideos = selectedVideoNodesFrom(snapshot, selectedNodeIds);
  const duration = durationFromInstruction(message, selectedVideos[0]);
  const aspectRatio = aspectRatioFromInstruction(message);
  const title = titleFromInstruction(message, selectedVideos[0]?.data.title || "Highlight");
  const baselineComposition = codexBaselineCompositionJson(title, duration, aspectRatio, message);
  return {
    title: "Codex HyperFrames video edit",
    description: "Send selected video nodes directly to a Codex-authored HyperFrames motion composition.",
    userInstruction: message,
    intent: "add_nodes",
    targetNodeIds: selectedVideos.map((node) => node.id),
    operations: [
      {
        id: "make-motion-package",
        type: "createNode",
        nodeType: "motion",
        label: "Motion* Codex HyperFrames edit",
        dependsOn: selectedVideos.map((node) => node.id),
        params: {
          motionMode: "codex-hyperframes",
          compositionJson: baselineComposition,
          codexInstruction: [
            `User request: ${message}`,
            `Requested title: ${title}`,
            `Output aspect ratio: ${aspectRatio}`,
            `Output duration: ${duration}s`,
            "Use the connected source video directly as the base media.",
            "Author the HyperFrames index.html: trim/reframe in the composition, add visible title animation, kinetic captions or overlay beats, subtle vignette, progress motion, and short-video transitions.",
            "Keep the footage full-bleed and inspectable; do not bury the subject behind a large card.",
            "Do not rely on a preselected template or motion variables. Rewrite the composition HTML/CSS/JS as needed.",
          ].join("\n"),
          prompt: message,
        },
        dataPatch: {
          templateId: "",
          motionVariablesJson: "",
        },
      },
      {
        id: "make-output",
        type: "createNode",
        nodeType: "output",
        label: "Output* Codex HyperFrames render",
        dependsOn: ["make-motion-package"],
        params: { format: "Creative package" },
      },
    ],
    warnings: [],
    requiresConfirmation: true,
  };
};

export async function POST(request: Request) {
  let run = createAgentRunRecorder();
  let executionMode: AgentRunExecutionMode = "browser";
  let runRequest: { userMessage: string; selectedNodeIds: string[]; workflowId?: string } | undefined;
  let checkpointSnapshot: RouterSnapshot | undefined;
  let checkpointSelectedNodeIds: string[] = [];
  const respond = async (payload: Record<string, unknown>, init?: ResponseInit) => {
    const trace = run.snapshot();
    const hasExecutablePlan = payload.ok === true && ["create", "edit", "organize", "skill"].includes(String(payload.intent || ""));
    const checkpoint: AgentRunCheckpoint | undefined = checkpointSnapshot ? {
      version: 1,
      savedAt: new Date().toISOString(),
      canvasSnapshot: { version: 1, ...checkpointSnapshot },
      selectedNodeIds: checkpointSelectedNodeIds,
      executedNodeIds: [],
      repairAttempts: 0,
      planResponse: hasExecutablePlan ? payload : undefined,
    } : undefined;
    try {
      await persistAgentRunTrace(trace, { executionMode, request: runRequest, checkpoint });
    } catch (storageError) {
      console.warn("Unable to persist Agent run checkpoint.", storageError instanceof Error ? storageError.message : storageError);
    }
    return NextResponse.json({ ...payload, agentRun: trace }, init);
  };
  try {
    const body = await request.json() as {
      userMessage?: unknown;
      canvasSnapshot?: unknown;
      selectedNodeIds?: unknown;
      conversation?: unknown;
      forceIntent?: unknown;
      customSkill?: unknown;
      resumeRunId?: unknown;
      executionMode?: unknown;
      workflowId?: unknown;
    };
    const userMessage = text(body.userMessage);
    const resumeRunId = text(body.resumeRunId);
    if (resumeRunId) {
      const existingRun = await getAgentRun(resumeRunId);
      if (existingRun) {
        run = createAgentRunRecorder(existingRun);
        run.add("received", "Resumed the existing Agent run with new user input.", { kind: "decision" });
      }
    }
    if (!userMessage) {
      run.finish("blocked", "blocked", "The Agent request did not include a user message.");
      return respond({ ok: false, error: { message: "userMessage is required." } }, { status: 400 });
    }
    run.add("received", "Received the user request and canvas context.", {
      metadata: { messageLength: userMessage.length },
    });

    const snapshot = snapshotFrom(body.canvasSnapshot);
    const selectedNodeIds = stringArray(body.selectedNodeIds);
    executionMode = body.executionMode === "worker" ? "worker" : "browser";
    checkpointSnapshot = snapshot;
    checkpointSelectedNodeIds = selectedNodeIds;
    runRequest = {
      userMessage,
      selectedNodeIds,
      workflowId: text(body.workflowId) || undefined,
    };
    const customSkill = customSkillFrom(body.customSkill);
    const conversation = messagesFrom(body.conversation);
    const forced = validIntents.includes(body.forceIntent as AgentRouterIntent) ? body.forceIntent as AgentRouterIntent : undefined;
    let routedSkillId: "fixed-scene-action-video" | undefined;
    let routedToolCall: AgentToolCall | undefined;
    let resumePending = false;
    const pendingRequest = snapshot.agentMemory?.pendingRequest;
    const rawPendingIntent = snapshot.agentMemory?.pendingIntent;
    const fallbackWorkflowIntent: AgentRouterIntent = selectedNodeIds.length ? "edit" : "create";
    const pendingIntent = rawPendingIntent === "skill" && pendingRequest && !isFixedSceneSkillRequest(pendingRequest, snapshot.agentMemory)
      ? fallbackWorkflowIntent
      : rawPendingIntent;
    run.add("routing", "Determining the next Agent route from the conversation, memory, selection, and canvas state.", {
      kind: "model",
      metadata: { selectedNodes: selectedNodeIds.length, canvasNodes: snapshot.nodes.length, hasPendingRequest: Boolean(pendingRequest) },
    });
    let intent: AgentRouterIntent;
    let routeReason: string | undefined;
    if (forced) {
      intent = forced;
      resumePending = pendingIntent === forced;
      routeReason = "The route was explicitly selected by the user interface.";
    } else if (pendingIntent && isImageSearchToolRequest(userMessage)) {
      intent = "tool";
      routeReason = "An image search tool request temporarily interrupts the pending workflow.";
    } else {
      try {
        const routedAt = Date.now();
        const routed = await runAgentRouterLLM({
          userMessage,
          canvasSummary: `${routingCanvasSummary(snapshot, selectedNodeIds)}${customSkill ? `\n\nSelected custom skill: ${customSkill.name}\n${customSkill.tagline}` : ""}`,
          memorySummary: agentMemorySummary(snapshot.agentMemory),
          conversation,
        });
        resumePending = routed.resumePending && Boolean(pendingIntent && pendingRequest);
        intent = resumePending && pendingIntent
          ? pendingIntent
          : routed.intent;
        routedSkillId = routed.skillId;
        routedToolCall = routed.toolCall;
        routeReason = routed.reason;
        run.add("routing", "Router model completed.", { kind: "model", durationMs: Date.now() - routedAt });
      } catch (routerError) {
        console.warn("Agent router LLM failed; using heuristic fallback", routerError instanceof Error ? routerError.message : routerError);
        resumePending = Boolean(pendingIntent && pendingRequest);
        intent = resumePending && pendingIntent ? pendingIntent : inferIntent(userMessage, snapshot, selectedNodeIds.length);
        routeReason = "The router model failed, so the deterministic fallback selected the route.";
        run.add("routing", routeReason, { kind: "validation" });
      }
    }

    const skillRequestContext = resumePending && pendingRequest
      ? `${pendingRequest}\n${userMessage}`
      : userMessage;
    if (intent === "skill") {
      if (isFixedSceneSkillRequest(skillRequestContext, snapshot.agentMemory)) {
        routedSkillId = "fixed-scene-action-video";
      } else {
        intent = fallbackWorkflowIntent;
        routedSkillId = undefined;
      }
    }

    // Store skills are instruction packages, not hard-coded workflow skill IDs.
    // Route them through the normal planner/editor so their SKILL.md guides an executable patch.
    if (customSkill && intent === "skill") {
      intent = snapshot.nodes.length ? "edit" : "create";
      routedSkillId = undefined;
    }
    run.setIntent(intent, routeReason);

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
        toolCall,
        toolResult,
        resolvedRequest: userMessage,
        summary: count
          ? (zh ? `通过 ${providerLabel} 找到了 ${count} 张候选图片，请选择一张作为画布参考素材并确认来源授权。` : `Found ${count} image candidates via ${providerLabel}. Choose one as a canvas reference and verify its usage rights.`)
          : (zh ? "没有找到合适的公开图片，请换一个关键词再试。" : "No suitable public images were found. Try a different query."),
      });
    }

    let effectiveUserMessage = userMessage;
    if (intent === "create" || intent === "edit" || intent === "skill") {
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

    if (intent === "skill" && !isFixedSceneSkillRequest(effectiveUserMessage, snapshot.agentMemory)) {
      intent = fallbackWorkflowIntent;
      routedSkillId = undefined;
      run.setIntent(intent, "The resolved request does not explicitly activate the fixed-scene workflow Skill.");
    }

    const guidedUserMessage = userMessageWithCustomSkill(effectiveUserMessage, customSkill);

    if (intent === "edit" && !customSkill && isShortVideoHyperframesEditRequest(effectiveUserMessage, snapshot, selectedNodeIds)) {
      run.add("planning", "Building the Codex and HyperFrames canvas edit plan.", { kind: "model" });
      const editPlan = buildShortVideoHyperframesEditPlan(effectiveUserMessage, snapshot, selectedNodeIds);
      const patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds });
      run.add("validating", "Compiled the edit plan into an executable canvas patch.", { kind: "validation", metadata: { createdNodes: patch.createNodes.length, createdEdges: patch.createEdges.length } });
      run.finish("ready", "validating", "The canvas edit plan is ready to apply.");
      return respond({
        ok: true,
        intent: "edit",
        editPlan,
        patch,
        resolvedRequest: effectiveUserMessage,
        summary: "已为选中的视频创建 Codex + HyperFrames 直接剪辑包装工作流。",
      });
    }

    if (intent === "skill") {
      const skillStartedAt = Date.now();
      run.add("planning", "Compiling the selected workflow Skill.", { kind: "model", metadata: { skill: routedSkillId || "fixed-scene-action-video" } });
      const skillBrief = await runFixedSceneSkillLLM({ userBrief: skillBriefFrom(effectiveUserMessage, snapshot.agentMemory) });
      run.add("validating", "The workflow Skill returned a structured brief.", { kind: "validation", durationMs: Date.now() - skillStartedAt });
      run.finish("ready", "validating", "The workflow Skill is ready to apply.");
      return respond({
        ok: true,
        intent,
        skillId: routedSkillId || "fixed-scene-action-video",
        skillBrief,
        resolvedRequest: effectiveUserMessage,
        summary: "Use the fixed-scene video skill: character turnaround images + scene nine-grid image + video node.",
      });
    }

    if (intent === "dialogue") {
      const dialogueStartedAt = Date.now();
      run.add("planning", "Developing a conversational response.", { kind: "model" });
      const response = await runAgentDialogueLLM({ userMessage: guidedUserMessage, conversation });
      run.add("planning", "Dialogue model completed.", { kind: "model", durationMs: Date.now() - dialogueStartedAt });
      run.finish("completed", "completed", response.title);
      return respond({ ok: true, intent, response, summary: response.title });
    }

    if (intent === "organize") {
      if (!snapshot.nodes.length) {
        run.finish("blocked", "blocked", "Canvas organization requires at least one node.");
        return respond({ ok: false, error: { message: "Canvas must include at least one node before organizing." } }, { status: 400 });
      }
      const organizeStartedAt = Date.now();
      run.add("planning", "Planning a deterministic canvas organization patch.", { kind: "model" });
      const organizePlan = await runAgentOrganizeLLM({ userInstruction: guidedUserMessage, canvasSummary: canvasSummaryWithMemory(snapshot, selectedNodeIds) });
      const patch = compileCanvasOrganizePlanToPatch({ organizePlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges });
      run.add("validating", "Compiled and validated the canvas organization patch.", { kind: "validation", durationMs: Date.now() - organizeStartedAt, metadata: { updatedNodes: patch.updateNodes.length } });
      run.finish("ready", "validating", "The canvas organization plan is ready to apply.");
      return respond({
        ok: true,
        intent,
        organizePlan,
        patch,
        resolvedRequest: effectiveUserMessage,
        summary: `${organizePlan.title}: ${organizePlan.workflows.length} workflows identified, ${patch.updateNodes.length} nodes to arrange.`,
      });
    }

    if (intent === "edit" && snapshot.nodes.length) {
      const editCanvasSummary = canvasSummaryWithMemory(snapshot, selectedNodeIds);
      const editStartedAt = Date.now();
      run.add("planning", "Planning changes against the existing canvas graph.", { kind: "model" });
      let editPlan = await runAgentEditLLM({ userInstruction: guidedUserMessage, canvasSummary: editCanvasSummary });
      let patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds });
      if (patchNeedsRepair(patch, selectedNodeIds)) {
        run.add("validating", "The first edit plan was incomplete; requesting one structured repair.", { kind: "validation", metadata: { warningCount: (patch.warnings || []).length } });
        editPlan = await runAgentEditLLM({
          userInstruction: guidedUserMessage,
          canvasSummary: editCanvasSummary,
          repairFeedback: [
            "The previous edit plan compiled to an empty or incomplete canvas patch, so the user would see no usable graph change.",
            "Re-read the selected nodes and the user instruction.",
            "Return executable graph operations with exact node ids: create/update nodes and connect/disconnect edges as needed.",
            "If the user asks to edit selected media, make the graph runnable by creating or updating the appropriate node and connecting selected source nodes.",
            "If you create a videoEdit node from selected videos/audio, it must have incoming edges from those selected source nodes.",
            "Schema reminder: createNode requires nodeType. Later operations must reference new nodes by the createNode operation id, not placeholder node ids.",
            `Compiler warnings: ${JSON.stringify(patch.warnings || [])}`,
            `Previous operations: ${JSON.stringify(editPlan.operations)}`,
          ].join("\n"),
        });
        patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds });
      }
      run.add("validating", "Compiled the edit plan into a canvas patch.", { kind: "validation", durationMs: Date.now() - editStartedAt, metadata: { createdNodes: patch.createNodes.length, updatedNodes: patch.updateNodes.length, createdEdges: patch.createEdges.length, warningCount: (patch.warnings || []).length } });
      run.finish("ready", "validating", "The canvas edit plan is ready to apply.");
      return respond({
        ok: true,
        intent,
        editPlan,
        patch,
        resolvedRequest: effectiveUserMessage,
        summary: editSummary(editPlan.title, patch),
      });
    }

    const planStartedAt = Date.now();
    run.add("planning", "Planning a new editable canvas workflow.", { kind: "model" });
    let plan = stabilizeWorkflowPlanDependencies(await runAgentPlannerLLM({ userPrompt: guidedUserMessage, canvasSummary: plannerSummary(snapshot) }));
    let qualityIssues = workflowPlanQualityIssues(plan);
    if (qualityIssues.length) {
      run.add("validating", "The first workflow plan failed graph quality checks; requesting one repair.", { kind: "validation", metadata: { issueCount: qualityIssues.length } });
      plan = stabilizeWorkflowPlanDependencies(await runAgentPlannerLLM({
        userPrompt: guidedUserMessage,
        canvasSummary: plannerSummary(snapshot),
        previousPlan: plan,
        repairFeedback: qualityIssues.join("\n"),
      }));
      qualityIssues = workflowPlanQualityIssues(plan);
    }
    if (qualityIssues.length) throw new Error(`Agent planner returned an incomplete workflow template: ${qualityIssues.join(" ")}`);
    const patch = compileWorkflowPlanToCanvas(plan);
    run.add("validating", "Validated workflow dependencies and compiled the canvas patch.", { kind: "validation", durationMs: Date.now() - planStartedAt, metadata: { stepCount: plan.steps.length, edgeCount: patch.edges.length } });
    run.finish("ready", "validating", "The new workflow is ready to apply.");
    return respond({
      ok: true,
      intent: "create",
      plan,
      patch,
      resolvedRequest: effectiveUserMessage,
      summary: `${plan.title}: ${plan.steps.length} editable steps prepared.`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    run.finish("blocked", "blocked", normalized.message);
    return respond({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
