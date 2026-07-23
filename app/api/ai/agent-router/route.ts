import { NextResponse } from "next/server";
import { compileCanvasOrganizePlanToPatch } from "@/server/agent/compileCanvasOrganizePlan";
import { compileWorkflowPlanToCanvas } from "@/server/agent/compileWorkflowPlan";
import { capabilityPlanToEditPlan, compileCapabilityPlanToEditPatch } from "@/server/agent/compileCapabilityPlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentDialogueLLM, runAgentOrganizeLLM, runAgentPlannerLLM, runAgentRequirementLLM, runAgentRouterLLM } from "@/server/ai/302aiLLMProvider";
import { agentMemorySummary, type AgentProjectMemory } from "@/shared/agent/projectMemory";
import { validateAgentSemanticRoute, type AgentDialogueMessage } from "@/shared/agent/agentSchema";
import type { AgentRouterIntent } from "@/shared/api/aiContracts";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import { validateAgentToolCall, type AgentToolCall } from "@/shared/agent/agentTools";
import { executeAgentTool } from "@/server/agent/toolRegistry";
import { createAgentRunRecorder } from "@/server/agent/agentRunRecorder";
import { getAgentRun, persistAgentRunTrace } from "@/server/storage/agentRunStorage";
import type { AgentRunCheckpoint, AgentRunExecutionMode } from "@/shared/agent/agentAutonomy";
import type { AgentRunRetrievalTrace } from "@/shared/agent/agentAutonomy";
import type { AgentSemanticRoute, CapabilityEvidenceBundle, CapabilityRetrievalRequest } from "@/shared/agent/capabilityTypes";
import { retrieveCapabilities } from "@/server/agent/capabilities/capabilityRetriever";
import { approvalRequiredStepIds, bindPlanCapabilities, bindRoutedCanvasInputs, capabilityPlanGraphIssues, capabilityPlanIssues } from "@/server/agent/capabilities/capabilityValidator";

type RouterSnapshot = {
  projectName: string;
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  agentMemory?: AgentProjectMemory;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
const validIntents: AgentRouterIntent[] = ["dialogue", "create", "edit", "organize", "skill", "tool"];

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
): CapabilityRetrievalRequest => {
  const targetIds = new Set(route.targetNodeIds);
  const targets = snapshot.nodes.filter((node) => targetIds.has(node.id));
  const count = (types: string[]) => targets.filter((node) => types.includes(node.data.nodeType)).length;
  const constraintText = (key: string) => typeof route.constraints[key] === "string" ? route.constraints[key] as string : undefined;
  return {
    query: route.objective,
    domains: workflowId ? ["capability", "workflow", "project", "repair"] : ["capability", "workflow", "repair"],
    requiredCapabilities: route.requiredCapabilities,
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

export async function POST(request: Request) {
  let run = createAgentRunRecorder();
  let executionMode: AgentRunExecutionMode = "browser";
  let runRequest: { userMessage: string; selectedNodeIds: string[]; workflowId?: string } | undefined;
  let checkpointSnapshot: RouterSnapshot | undefined;
  let checkpointSelectedNodeIds: string[] = [];
  let checkpointRetrieval: AgentRunRetrievalTrace | undefined;
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
      retrieval: checkpointRetrieval,
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
    if (forced) {
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
    const routedTargets = semanticRoute.targetNodeIds.filter((id) => validCanvasIds.has(id));
    semanticRoute = { ...semanticRoute, targetNodeIds: routedTargets.length ? routedTargets : semanticRoute.route === "plan" ? selectedNodeIds : [] };
    intent = resumePending && pendingIntent
      ? pendingIntent
      : semanticRoute.route === "dialogue" || semanticRoute.route === "clarify" ? "dialogue"
        : semanticRoute.route === "organize" ? "organize"
          : semanticRoute.route === "tool" ? "tool"
            : semanticRoute.targetNodeIds.length ? "edit" : "create";
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

    let effectiveUserMessage = userMessage;
    if (intent === "create" || intent === "edit") {
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
          semanticRoute: { ...semanticRoute, route: "clarify", missingInformation: requirement.missingInformation, questions: requirement.questions },
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
      const response = await runAgentDialogueLLM({ userMessage: guidedUserMessage, conversation });
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
      const organizePlan = await runAgentOrganizeLLM({ userInstruction: guidedUserMessage, canvasSummary: canvasSummaryWithMemory(snapshot, selectedNodeIds) });
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

    const retrievalStartedAt = Date.now();
    semanticRoute = { ...semanticRoute, objective: effectiveUserMessage };
    const retrievalQuery = retrievalRequestFrom(semanticRoute, snapshot, runRequest?.workflowId);
    run.add("tooling", "Retrieving executable Skills, Tools, models, and workflow evidence.", {
      kind: "tool",
      metadata: { requiredCapabilities: retrievalQuery.requiredCapabilities.length, targetNodes: semanticRoute.targetNodeIds.length },
    });
    const evidenceBundle: CapabilityEvidenceBundle = await retrieveCapabilities(retrievalQuery, { customSkill });
    checkpointRetrieval = {
      query: retrievalQuery,
      retrievalMode: evidenceBundle.retrievalMode,
      candidateIds: evidenceBundle.capabilities.map((candidate) => candidate.id),
      selectedCapabilityIds: [],
      evidenceIds: evidenceBundle.evidence.map((evidence) => evidence.id),
      generatedAt: evidenceBundle.generatedAt,
    };
    run.add("tooling", `Capability retrieval returned ${evidenceBundle.capabilities.length} executable candidates.`, {
      kind: "tool",
      durationMs: Date.now() - retrievalStartedAt,
      metadata: { retrievalMode: evidenceBundle.retrievalMode, candidateCount: evidenceBundle.capabilities.length, evidenceCount: evidenceBundle.evidence.length },
    });
    if (!evidenceBundle.capabilities.length) throw new Error("No configured capability satisfies the routed requirements and constraints.");

    const planStartedAt = Date.now();
    run.add("planning", "Planning only with capabilities from the retrieved Evidence Bundle.", { kind: "model" });
    const normalizeCapabilityPlan = (candidatePlan: Awaited<ReturnType<typeof runAgentPlannerLLM>>) => {
      const providerBound = bindPlanCapabilities(candidatePlan, evidenceBundle);
      const inputBound = intent === "edit"
        ? bindRoutedCanvasInputs(providerBound, evidenceBundle, snapshot.nodes, semanticRoute.targetNodeIds, semanticRoute.requiredCapabilities)
        : providerBound;
      return bindPlanCapabilities(inputBound, evidenceBundle);
    };
    let plan = normalizeCapabilityPlan(await runAgentPlannerLLM({
      userPrompt: guidedUserMessage,
      canvasSummary: intent === "edit" ? canvasSummaryWithMemory(snapshot, semanticRoute.targetNodeIds) : plannerSummary(snapshot),
      semanticRoute,
      evidenceBundle,
    }));
    const editInputIssues = () => {
      if (intent !== "edit" || !semanticRoute.targetNodeIds.length) return [];
      const referenced = plan.steps.flatMap((step) => (step.inputs || [])
        .filter((input) => input.source === "canvas_node" && input.nodeId)
        .map((input) => input.nodeId!));
      const canvasIds = new Set(snapshot.nodes.map((node) => node.id));
      const invalid = referenced.filter((id) => !canvasIds.has(id));
      const missingTargets = semanticRoute.targetNodeIds.filter((id) => !referenced.includes(id));
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
        canvasSummary: intent === "edit" ? canvasSummaryWithMemory(snapshot, semanticRoute.targetNodeIds) : plannerSummary(snapshot),
        semanticRoute,
        evidenceBundle,
        previousPlan: plan,
        repairFeedback: qualityIssues.join("\n"),
      }));
      qualityIssues = [...capabilityPlanGraphIssues(plan, evidenceBundle), ...capabilityPlanIssues(plan, evidenceBundle), ...editInputIssues()];
    }
    if (qualityIssues.length) throw new Error(`Agent planner returned an invalid capability plan: ${qualityIssues.join(" ")}`);
    checkpointRetrieval.selectedCapabilityIds = [...new Set(plan.steps.map((step) => step.providerCapabilityId).filter((id): id is string => Boolean(id)))];
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

    const patch = compileWorkflowPlanToCanvas(plan);
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
