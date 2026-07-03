import type { CanvasNode, NodeType, WorkflowEdge } from "@/types/canvas";

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
  goal: AgentWorkflowGoal;
  userPrompt: string;
  style?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  sceneCount?: number;
  includeAudio?: boolean;
  videoProvider?: "tokenstar" | "kling" | "302ai" | "302-sora2";
  steps: AgentWorkflowStep[];
  warnings?: string[];
};

export type AgentWorkflowStep = {
  id: string;
  kind: AgentStepKind;
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
const kinds: AgentStepKind[] = ["prompt", "text", "script", "storyboard", "storyboardImage", "image", "video", "audio", "reference", "output"];
const aspectRatios = ["16:9", "9:16", "1:1"] as const;
const videoProviders = ["tokenstar", "kling", "302ai", "302-sora2"] as const;
const editOperationTypes: AgentEditOperationType[] = ["createNode", "updateNodeData", "deleteNode", "connectNodes", "disconnectNodes", "replaceNodeType", "moveNode", "duplicateNode", "createBranch", "updateEdge", "noop"];
const editIntents: AgentCanvasEditIntent[] = ["add_nodes", "modify_nodes", "delete_nodes", "reconnect", "change_style", "change_provider", "expand_workflow", "cleanup", "custom"];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : undefined;
const params = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const safeId = (value: string, fallback: string) => {
  const id = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return id || fallback;
};
const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);
const fallbackLabel = (kind: AgentStepKind, index: number, zh: boolean) => {
  if (!zh) return `${kind[0].toUpperCase()}${kind.slice(1)} ${index + 1}`;
  const labels: Record<AgentStepKind, string> = {
    prompt: "创意输入",
    text: "文本生成",
    script: "完整剧本",
    storyboard: "分镜设计",
    storyboardImage: "关键帧提示词",
    image: "关键帧图像",
    video: "视频生成",
    audio: "音频生成",
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
    const kind = kinds.includes(step.kind as AgentStepKind) ? step.kind as AgentStepKind : undefined;
    if (!kind) return;
    let id = safeId(text(step.id), `${kind}-${index + 1}`);
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    steps.push({
      id,
      kind,
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
  const normalizedSteps = steps.map((step, index) => ({
    ...step,
    dependsOn: step.dependsOn?.filter((id) => ids.has(id) && id !== step.id) || (index > 0 ? [steps[index - 1].id] : undefined),
  }));
  return {
    title,
    description: text(raw.description) || undefined,
    goal,
    userPrompt,
    style: text(raw.style) || undefined,
    aspectRatio,
    sceneCount,
    includeAudio: typeof raw.includeAudio === "boolean" ? raw.includeAudio : false,
    videoProvider,
    steps: normalizedSteps,
    warnings: stringArray(raw.warnings) || [],
  };
}

export function validateAgentCanvasEditPlan(value: unknown): AgentCanvasEditPlan {
  const raw = object(value);
  const userInstruction = text(raw.userInstruction);
  const intent = editIntents.includes(raw.intent as AgentCanvasEditIntent) ? raw.intent as AgentCanvasEditIntent : "custom";
  const operations: AgentEditOperation[] = [];
  if (Array.isArray(raw.operations)) raw.operations.forEach((item, index) => {
    const op = object(item);
    const type = editOperationTypes.includes(op.type as AgentEditOperationType) ? op.type as AgentEditOperationType : "noop";
    const nodeType = kinds.includes(op.nodeType as AgentStepKind) ? op.nodeType as AgentStepKind : undefined;
    operations.push({
      id: safeId(text(op.id), `op-${index + 1}`),
      type,
      reason: text(op.reason) || undefined,
      targetNodeId: text(op.targetNodeId) || undefined,
      targetEdgeId: text(op.targetEdgeId) || undefined,
      nodeType,
      label: text(op.label) || undefined,
      dataPatch: params(op.dataPatch),
      sourceNodeId: text(op.sourceNodeId) || undefined,
      targetNodeIdForConnection: text(op.targetNodeIdForConnection) || undefined,
      dependsOn: stringArray(op.dependsOn),
      positionHint: op.positionHint && typeof op.positionHint === "object" ? {
        afterNodeId: text(object(op.positionHint).afterNodeId) || undefined,
        column: Number.isFinite(Number(object(op.positionHint).column)) ? Number(object(op.positionHint).column) : undefined,
        row: Number.isFinite(Number(object(op.positionHint).row)) ? Number(object(op.positionHint).row) : undefined,
      } : undefined,
      params: params(op.params),
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
