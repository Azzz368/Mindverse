import { NextResponse } from "next/server";
import { compileCanvasEditPlanToPatch } from "@/server/agent/compileCanvasEditPlan";
import { compileCanvasOrganizePlanToPatch } from "@/server/agent/compileCanvasOrganizePlan";
import { compileWorkflowPlanToCanvas } from "@/server/agent/compileWorkflowPlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentDialogueLLM, runAgentEditLLM, runAgentOrganizeLLM, runAgentPlannerLLM, runAgentRouterLLM, runFixedSceneSkillLLM } from "@/server/ai/302aiLLMProvider";
import { agentMemorySummary, type AgentProjectMemory } from "@/shared/agent/projectMemory";
import type { AgentCanvasEditPlan, AgentDialogueMessage } from "@/shared/agent/agentSchema";
import type { AgentRouterIntent } from "@/shared/api/aiContracts";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";

type RouterSnapshot = {
  projectName: string;
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  agentMemory?: AgentProjectMemory;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const validIntents: AgentRouterIntent[] = ["dialogue", "create", "edit", "organize", "skill"];
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
  const asksToReusePreferredSkill =
    memory?.preferredWorkflowSkill === "fixed-scene-action-video" &&
    (explicitWorkflowAsk || includesAnyText(input, [cn.video, cn.continue])) &&
    !includesAnyText(input, [cn.storyboard]);

  return (explicitActivation && explicitWorkflowAsk) || asksToReusePreferredSkill;
};

const inferIntent = (message: string, snapshot: RouterSnapshot, selectedCount: number): AgentRouterIntent => {
  const input = message.toLowerCase();
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
  try {
    const body = await request.json() as {
      userMessage?: unknown;
      canvasSnapshot?: unknown;
      selectedNodeIds?: unknown;
      conversation?: unknown;
      forceIntent?: unknown;
      customSkill?: unknown;
    };
    const userMessage = text(body.userMessage);
    if (!userMessage) return NextResponse.json({ ok: false, error: { message: "userMessage is required." } }, { status: 400 });

    const snapshot = snapshotFrom(body.canvasSnapshot);
    const selectedNodeIds = stringArray(body.selectedNodeIds);
    const customSkill = customSkillFrom(body.customSkill);
    const guidedUserMessage = userMessageWithCustomSkill(userMessage, customSkill);
    const forced = validIntents.includes(body.forceIntent as AgentRouterIntent) ? body.forceIntent as AgentRouterIntent : undefined;
    if (!customSkill && (!forced || forced === "edit") && isShortVideoHyperframesEditRequest(userMessage, snapshot, selectedNodeIds)) {
      const editPlan = buildShortVideoHyperframesEditPlan(userMessage, snapshot, selectedNodeIds);
      const patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds });
      return NextResponse.json({
        ok: true,
        intent: "edit",
        editPlan,
        patch,
        summary: "已为选中的视频创建 Codex + HyperFrames 直接剪辑包装工作流。",
      });
    }
    let routedSkillId: "fixed-scene-action-video" | undefined;
    let intent: AgentRouterIntent;
    if (forced) {
      intent = forced;
    } else {
      try {
        const routed = await runAgentRouterLLM({
          userMessage,
          canvasSummary: `${routingCanvasSummary(snapshot, selectedNodeIds)}${customSkill ? `\n\nSelected custom skill: ${customSkill.name}\n${customSkill.tagline}` : ""}`,
          memorySummary: agentMemorySummary(snapshot.agentMemory),
          conversation: messagesFrom(body.conversation),
        });
        intent = routed.intent;
        routedSkillId = routed.skillId;
      } catch (routerError) {
        console.warn("Agent router LLM failed; using heuristic fallback", routerError instanceof Error ? routerError.message : routerError);
        intent = inferIntent(userMessage, snapshot, selectedNodeIds.length);
      }
    }

    // Store skills are instruction packages, not hard-coded workflow skill IDs.
    // Route them through the normal planner/editor so their SKILL.md guides an executable patch.
    if (customSkill && intent === "skill") {
      intent = snapshot.nodes.length ? "edit" : "create";
      routedSkillId = undefined;
    }

    if (intent === "skill") {
      const skillBrief = await runFixedSceneSkillLLM({ userBrief: skillBriefFrom(userMessage, snapshot.agentMemory) });
      return NextResponse.json({
        ok: true,
        intent,
        skillId: routedSkillId || "fixed-scene-action-video",
        skillBrief,
        summary: "Use the fixed-scene video skill: character turnaround images + scene nine-grid image + video node.",
      });
    }

    if (intent === "dialogue") {
      const response = await runAgentDialogueLLM({ userMessage: guidedUserMessage, conversation: messagesFrom(body.conversation) });
      return NextResponse.json({ ok: true, intent, response, summary: response.title });
    }

    if (intent === "organize") {
      if (!snapshot.nodes.length) return NextResponse.json({ ok: false, error: { message: "Canvas must include at least one node before organizing." } }, { status: 400 });
      const organizePlan = await runAgentOrganizeLLM({ userInstruction: guidedUserMessage, canvasSummary: canvasSummaryWithMemory(snapshot, selectedNodeIds) });
      const patch = compileCanvasOrganizePlanToPatch({ organizePlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges });
      return NextResponse.json({
        ok: true,
        intent,
        organizePlan,
        patch,
        summary: `${organizePlan.title}: ${organizePlan.workflows.length} workflows identified, ${patch.updateNodes.length} nodes to arrange.`,
      });
    }

    if (intent === "edit" && snapshot.nodes.length) {
      const editCanvasSummary = canvasSummaryWithMemory(snapshot, selectedNodeIds);
      let editPlan = await runAgentEditLLM({ userInstruction: guidedUserMessage, canvasSummary: editCanvasSummary });
      let patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: snapshot.nodes, currentEdges: snapshot.edges, selectedNodeIds });
      if (patchNeedsRepair(patch, selectedNodeIds)) {
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
      return NextResponse.json({
        ok: true,
        intent,
        editPlan,
        patch,
        summary: editSummary(editPlan.title, patch),
      });
    }

    const plan = await runAgentPlannerLLM({ userPrompt: guidedUserMessage, canvasSummary: plannerSummary(snapshot) });
    const patch = compileWorkflowPlanToCanvas(plan);
    return NextResponse.json({
      ok: true,
      intent: "create",
      plan,
      patch,
      summary: `${plan.title}: ${plan.steps.length} editable steps prepared.`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
