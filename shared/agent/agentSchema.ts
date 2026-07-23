import type { CanvasNode, NodeType, WorkflowEdge } from "@/shared/canvas";
import {
  capabilityForNodeKind,
  mediaRoles,
  nodeKindForCapability,
  type AgentPlanInput,
  type AgentRouteOperation,
  type AgentSemanticRoute,
} from "@/shared/agent/capabilityTypes";

export type AgentWorkflowGoal =
  | "story_to_video"
  | "image_to_video"
  | "storyboard_only"
  | "ad_package"
  | "custom";

export type AgentStepKind = NodeType;

export type AgentWorkflowPlan = {
  title: string;
  description?: string;
  objective?: string;
  goal: AgentWorkflowGoal;
  userPrompt: string;
  style?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  sceneCount?: number;
  includeAudio?: boolean;
  videoProvider?: "tokenstar" | "kling" | "302ai" | "302-sora2";
  steps: AgentWorkflowStep[];
  successCriteria?: string[] | Record<string, unknown>;
  warnings?: string[];
};

export type AgentWorkflowStep = {
  id: string;
  kind: AgentStepKind;
  capability: string;
  providerCapabilityId?: string;
  evidenceIds?: string[];
  inputs?: AgentPlanInput[];
  label: string;
  purpose?: string;
  prompt?: string;
  dependsOn?: string[];
  params?: Record<string, unknown>;
};

export type CanvasPatch = {
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
};

export type AgentEditOperationType =
  | "createNode"
  | "updateNodeData"
  | "deleteNode"
  | "connectNodes"
  | "disconnectNodes"
  | "replaceNodeType"
  | "moveNode"
  | "duplicateNode"
  | "createBranch"
  | "updateEdge"
  | "noop";

export type AgentCanvasEditIntent =
  | "add_nodes"
  | "modify_nodes"
  | "delete_nodes"
  | "reconnect"
  | "change_style"
  | "change_provider"
  | "expand_workflow"
  | "cleanup"
  | "custom";

export type AgentEditOperation = {
  id: string;
  type: AgentEditOperationType;
  capability?: string;
  providerCapabilityId?: string;
  evidenceIds?: string[];
  inputs?: AgentPlanInput[];
  reason?: string;
  targetNodeId?: string;
  targetEdgeId?: string;
  nodeType?: AgentStepKind;
  label?: string;
  dataPatch?: Record<string, unknown>;
  sourceNodeId?: string;
  targetNodeIdForConnection?: string;
  dependsOn?: string[];
  positionHint?: {
    afterNodeId?: string;
    column?: number;
    row?: number;
  };
  params?: Record<string, unknown>;
};

export type AgentCanvasEditPlan = {
  title: string;
  description?: string;
  userInstruction: string;
  intent: AgentCanvasEditIntent;
  targetNodeIds?: string[];
  operations: AgentEditOperation[];
  warnings?: string[];
  requiresConfirmation?: boolean;
};

export type CanvasEditPatch = {
  createNodes: CanvasNode[];
  updateNodes: Array<{
    id: string;
    dataPatch?: Partial<CanvasNode["data"]>;
    position?: { x: number; y: number };
    type?: string;
  }>;
  deleteNodeIds: string[];
  createEdges: WorkflowEdge[];
  deleteEdgeIds: string[];
  selectedNodeIds?: string[];
  warnings?: string[];
};

export type AgentCanvasOrganizeWorkflow = {
  id: string;
  label: string;
  title: string;
  order: number;
  nodeIds: string[];
  reason?: string;
};

export type AgentCanvasOrganizePlan = {
  title: string;
  description?: string;
  userInstruction: string;
  workflows: AgentCanvasOrganizeWorkflow[];
  warnings?: string[];
  requiresConfirmation?: boolean;
};

export type AgentDialogueRole = "user" | "assistant";

export type AgentDialogueMessage = {
  role: AgentDialogueRole;
  content: string;
};

export type AgentDialogueOption = {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
};

export type AgentDialogueAction = "ask" | "offer_options" | "expand_option" | "finalize_brief";

export type AgentDialogueResponse = {
  stage: AgentDialogueAction;
  title: string;
  message: string;
  options?: AgentDialogueOption[];
  brief?: string;
  suggestedNext?: string[];
};

const goals: AgentWorkflowGoal[] = ["story_to_video", "image_to_video", "storyboard_only", "ad_package", "custom"];
const kinds: AgentStepKind[] = ["prompt", "text", "script", "storyboard", "image", "video", "videoEdit", "motion", "audio", "voiceClone", "voiceTTS", "reference", "output"];
const aspectRatios = ["16:9", "9:16", "1:1"] as const;
const videoProviders = ["tokenstar", "kling", "302ai", "302-sora2"] as const;
const editOperationTypes: AgentEditOperationType[] = ["createNode", "updateNodeData", "deleteNode", "connectNodes", "disconnectNodes", "replaceNodeType", "moveNode", "duplicateNode", "createBranch", "updateEdge", "noop"];
const editIntents: AgentCanvasEditIntent[] = ["add_nodes", "modify_nodes", "delete_nodes", "reconnect", "change_style", "change_provider", "expand_workflow", "cleanup", "custom"];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : undefined;
const params = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const planInputs = (value: unknown): AgentPlanInput[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const inputs: AgentPlanInput[] = [];
  value.forEach((item) => {
    const raw = object(item);
    const source = raw.source === "canvas_node" || raw.source === "step_output" || raw.source === "user_input" ? raw.source : undefined;
    const role = mediaRoles.includes(raw.role as AgentPlanInput["role"]) ? raw.role as AgentPlanInput["role"] : undefined;
    if (!source || !role) return;
    const nodeId = text(raw.nodeId) || undefined;
    const stepId = text(raw.stepId) || undefined;
    if (source === "canvas_node" && !nodeId) return;
    if (source === "step_output" && !stepId) return;
    const key = text(raw.key) || undefined;
    inputs.push({ source, role, ...(nodeId ? { nodeId } : {}), ...(stepId ? { stepId } : {}), ...(key ? { key } : {}) });
  });
  return inputs.length ? inputs : undefined;
};

const safeId = (value: string, fallback: string) => {
  const id = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return id || fallback;
};
const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);
const fallbackLabel = (kind: AgentStepKind, index: number, zh: boolean) => {
  if (!zh) return `${kind[0].toUpperCase()}${kind.slice(1)} ${index + 1}`;
  const labels: Partial<Record<AgentStepKind, string>> = {
    prompt: "创意输入",
    text: "文本生成",
    script: "完整剧本",
    storyboard: "分镜设计",
    storyboardImage: "关键帧提示词",
    image: "关键帧图像",
    video: "视频生成",
    audio: "音频生成",
    voiceClone: "人声克隆",
    voiceTTS: "克隆人声生成",
    reference: "参考素材",
    output: "最终输出",
  };
  return `${labels[kind]} ${index + 1}`;
};

export function validateAgentPlan(value: unknown): AgentWorkflowPlan {
  const raw = object(value);
  const title = text(raw.title, "Mindverse Agent Workflow");
  const userPrompt = text(raw.userPrompt);
  const zh = hasChinese(userPrompt);
  const goal = goals.includes(raw.goal as AgentWorkflowGoal) ? raw.goal as AgentWorkflowGoal : "custom";
  const aspectRatio = aspectRatios.includes(raw.aspectRatio as typeof aspectRatios[number]) ? raw.aspectRatio as AgentWorkflowPlan["aspectRatio"] : "16:9";
  const videoProvider = videoProviders.includes(raw.videoProvider as typeof videoProviders[number]) ? raw.videoProvider as AgentWorkflowPlan["videoProvider"] : "tokenstar";
  const sceneCount = Math.max(1, Math.min(12, Number(raw.sceneCount) || 3));
  const seen = new Set<string>();
  const steps: AgentWorkflowStep[] = [];
  if (Array.isArray(raw.steps)) raw.steps.forEach((item, index) => {
    const step = object(item);
    const rawKind = kinds.includes(step.kind as AgentStepKind) ? step.kind as AgentStepKind : undefined;
    const capability = text(step.capability) || (rawKind ? capabilityForNodeKind(rawKind) : "");
    const kind = nodeKindForCapability(capability) || rawKind;
    if (!kind) return;
    let id = safeId(text(step.id), `${kind}-${index + 1}`);
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    steps.push({
      id,
      kind,
      capability: capability || capabilityForNodeKind(kind),
      providerCapabilityId: text(step.providerCapabilityId) || undefined,
      evidenceIds: stringArray(step.evidenceIds),
      inputs: planInputs(step.inputs),
      label: text(step.label, fallbackLabel(kind, index, zh)),
      purpose: text(step.purpose) || undefined,
      prompt: text(step.prompt) || undefined,
      dependsOn: stringArray(step.dependsOn),
      params: params(step.params),
    });
  });
  if (!userPrompt) throw new Error("Agent plan is missing userPrompt.");
  if (!steps.length) throw new Error("Agent plan must include at least one step.");
  const ids = new Set(steps.map((step) => step.id));
  const normalizedSteps = steps.map((step) => ({
    ...step,
    inputs: step.inputs?.filter((input) => input.source !== "step_output" || (Boolean(input.stepId) && ids.has(input.stepId!) && input.stepId !== step.id)),
    dependsOn: [...new Set([
      ...(step.dependsOn || []),
      ...(step.inputs || []).filter((input) => input.source === "step_output").map((input) => input.stepId || ""),
    ].filter((id) => ids.has(id) && id !== step.id))],
  }));
  const successCriteria = Array.isArray(raw.successCriteria)
    ? stringArray(raw.successCriteria)
    : params(raw.successCriteria);
  return {
    title,
    description: text(raw.description) || undefined,
    objective: text(raw.objective) || text(raw.description) || title,
    goal,
    userPrompt,
    style: text(raw.style) || undefined,
    aspectRatio,
    sceneCount,
    includeAudio: typeof raw.includeAudio === "boolean" ? raw.includeAudio : false,
    videoProvider,
    steps: normalizedSteps,
    successCriteria,
    warnings: stringArray(raw.warnings) || [],
  };
}

const routeOperations: AgentRouteOperation[] = ["create_workflow", "transform_media", "generate_media", "organize_canvas", "retrieve_reference", "develop_idea", "custom"];

export function validateAgentSemanticRoute(value: unknown, fallbackObjective: string, selectedNodeIds: string[] = []): AgentSemanticRoute {
  const raw = object(value);
  const route = raw.route === "plan" || raw.route === "clarify" || raw.route === "dialogue" || raw.route === "tool" || raw.route === "organize"
    ? raw.route
    : "dialogue";
  const operation = routeOperations.includes(raw.operation as AgentRouteOperation) ? raw.operation as AgentRouteOperation : "custom";
  const confidenceValue = Number(raw.confidence);
  return {
    route,
    operation,
    objective: text(raw.objective) || fallbackObjective,
    targetNodeIds: stringArray(raw.targetNodeIds) || selectedNodeIds,
    requiredCapabilities: stringArray(raw.requiredCapabilities) || [],
    constraints: params(raw.constraints) || {},
    successCriteria: stringArray(raw.successCriteria) || [],
    missingInformation: stringArray(raw.missingInformation) || [],
    questions: stringArray(raw.questions) || [],
    confidence: Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : 0.5,
    resumePending: raw.resumePending === true,
    reason: text(raw.reason) || undefined,
    toolName: text(raw.toolName) || text(object(raw.toolCall).name) || undefined,
    toolArguments: params(raw.toolArguments) || params(object(raw.toolCall).arguments),
  };
}

export function validateAgentCanvasEditPlan(value: unknown): AgentCanvasEditPlan {
  const raw = object(value);
  const userInstruction = text(raw.userInstruction);
  const intent = editIntents.includes(raw.intent as AgentCanvasEditIntent) ? raw.intent as AgentCanvasEditIntent : "custom";
  const operations: AgentEditOperation[] = [];
  if (Array.isArray(raw.operations)) raw.operations.forEach((item, index) => {
    const op = object(item);
    const opParams = params(op.params);
    const opDataPatch = params(op.dataPatch);
    const type = editOperationTypes.includes(op.type as AgentEditOperationType) ? op.type as AgentEditOperationType : "noop";
    const rawNodeType = op.nodeType || opParams?.nodeType || opDataPatch?.nodeType;
    const nodeType = kinds.includes(rawNodeType as AgentStepKind) ? rawNodeType as AgentStepKind : undefined;
    operations.push({
      id: safeId(text(op.id), `op-${index + 1}`),
      type,
      capability: text(op.capability) || undefined,
      providerCapabilityId: text(op.providerCapabilityId) || undefined,
      evidenceIds: stringArray(op.evidenceIds),
      inputs: planInputs(op.inputs),
      reason: text(op.reason) || undefined,
      targetNodeId: text(op.targetNodeId) || undefined,
      targetEdgeId: text(op.targetEdgeId) || undefined,
      nodeType,
      label: text(op.label) || undefined,
      dataPatch: opDataPatch,
      sourceNodeId: text(op.sourceNodeId) || undefined,
      targetNodeIdForConnection: text(op.targetNodeIdForConnection) || text(op.targetNodeId) || undefined,
      dependsOn: stringArray(op.dependsOn),
      positionHint: op.positionHint && typeof op.positionHint === "object" ? {
        afterNodeId: text(object(op.positionHint).afterNodeId) || undefined,
        column: Number.isFinite(Number(object(op.positionHint).column)) ? Number(object(op.positionHint).column) : undefined,
        row: Number.isFinite(Number(object(op.positionHint).row)) ? Number(object(op.positionHint).row) : undefined,
      } : undefined,
      params: opParams,
    });
  });
  if (!userInstruction) throw new Error("Agent edit plan is missing userInstruction.");
  return {
    title: text(raw.title, "Mindverse Canvas Edit"),
    description: text(raw.description) || undefined,
    userInstruction,
    intent,
    targetNodeIds: stringArray(raw.targetNodeIds),
    operations: operations.length ? operations : [{ id: "op-1", type: "noop", reason: "No safe canvas edit operation was produced." }],
    warnings: stringArray(raw.warnings) || [],
    requiresConfirmation: typeof raw.requiresConfirmation === "boolean" ? raw.requiresConfirmation : true,
  };
}

export function validateAgentCanvasOrganizePlan(value: unknown): AgentCanvasOrganizePlan {
  const raw = object(value);
  const userInstruction = text(raw.userInstruction);
  if (!userInstruction) throw new Error("Agent organize plan is missing userInstruction.");
  const workflows: AgentCanvasOrganizeWorkflow[] = [];
  if (Array.isArray(raw.workflows)) raw.workflows.forEach((item, index) => {
    const workflow = object(item);
    const order = Math.max(1, Math.min(99, Math.floor(Number(workflow.order) || index + 1)));
    const id = safeId(text(workflow.id), `workflow-${order}`);
    const nodeIds = stringArray(workflow.nodeIds) || [];
    if (!nodeIds.length) return;
    workflows.push({
      id,
      label: text(workflow.label, String(order)),
      title: text(workflow.title, `Workflow ${order}`),
      order,
      nodeIds,
      reason: text(workflow.reason) || undefined,
    });
  });
  return {
    title: text(raw.title, "Mindverse Canvas Organize"),
    description: text(raw.description) || undefined,
    userInstruction,
    workflows,
    warnings: stringArray(raw.warnings) || [],
    requiresConfirmation: typeof raw.requiresConfirmation === "boolean" ? raw.requiresConfirmation : true,
  };
}

export function validateAgentDialogueResponse(value: unknown): AgentDialogueResponse {
  const raw = object(value);
  const stages: AgentDialogueAction[] = ["ask", "offer_options", "expand_option", "finalize_brief"];
  const stage = stages.includes(raw.stage as AgentDialogueAction) ? raw.stage as AgentDialogueAction : "ask";
  const options = Array.isArray(raw.options) ? raw.options.map((item, index) => {
    const option = object(item);
    return {
      id: safeId(text(option.id), `option-${index + 1}`),
      title: text(option.title, `Option ${index + 1}`),
      summary: text(option.summary),
      tags: stringArray(option.tags),
    };
  }).filter((option) => option.summary) : undefined;
  const message = text(raw.message);
  if (!message) throw new Error("Agent dialogue response is missing message.");
  return {
    stage,
    title: text(raw.title, "Story Probe"),
    message,
    options,
    brief: text(raw.brief) || undefined,
    suggestedNext: stringArray(raw.suggestedNext),
  };
}
