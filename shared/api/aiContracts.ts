import type { PollingConfig } from "./response";
import type {
  AgentCanvasEditPlan,
  AgentCanvasOrganizePlan,
  AgentDialogueMessage,
  AgentDialogueResponse,
  AgentWorkflowPlan,
  CanvasEditPatch,
  CanvasPatch,
} from "@/shared/agent/agentSchema";
import type { AgentWorkflowSkillId } from "@/shared/agent/workflowSkills";
import type { AgentProjectMemory } from "@/shared/agent/projectMemory";
import type { CanvasNode, NodeType, WorkflowEdge } from "@/shared/canvas";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import type { AgentObserveResponse, AgentRunExecutionMode, AgentRunRecord, AgentRunTrace, AgentRunUpdate } from "@/shared/agent/agentAutonomy";
import type { AgentToolCall, AgentToolResult } from "@/shared/agent/agentTools";

export type CanvasSnapshotPayload = { version: 1; projectName: string; nodes: CanvasNode[]; edges: WorkflowEdge[]; agentMemory?: AgentProjectMemory };

export type RunNodeRequest = { nodeType: NodeType; input: Record<string, unknown> };
export type RunNodeResponse = { ok: true; output?: unknown; provider?: string; polling?: PollingConfig };

export type PollTaskRequest = { type: NodeType; taskId: string; provider?: string; pollUrl?: string; pollAction?: string; expectedAspectRatio?: string };
export type PollTaskResponse = RunNodeResponse;

export type EditImageRequest = { sourceImageUrl: string; prompt: string; size?: string };
export type EditImageResponse = { ok: true; output?: unknown };

export type AgentPlanRequest = { userPrompt: string; canvasSnapshot: CanvasSnapshotPayload; mode: "create" | "edit" };
export type AgentPlanResponse = { ok: true; plan?: AgentWorkflowPlan; patch?: CanvasPatch; summary?: string };

export type AgentEditRequest = { userInstruction: string; canvasSnapshot: CanvasSnapshotPayload; selectedNodeIds: string[] };
export type AgentEditResponse = { ok: true; editPlan?: AgentCanvasEditPlan; patch?: CanvasEditPatch; summary?: string };

export type AgentOrganizeRequest = AgentEditRequest;
export type AgentOrganizeResponse = { ok: true; organizePlan?: AgentCanvasOrganizePlan; patch?: CanvasEditPatch; summary?: string };

export type AgentDialogueRequest = { userMessage: string; conversation: AgentDialogueMessage[] };
export type AgentDialogueApiResponse = { ok: true; response?: AgentDialogueResponse };

export type AgentRouterIntent = "dialogue" | "create" | "edit" | "organize" | "skill" | "tool";
export type AgentRouterRequest = {
  userMessage: string;
  canvasSnapshot: CanvasSnapshotPayload;
  selectedNodeIds: string[];
  conversation?: AgentDialogueMessage[];
  forceIntent?: AgentRouterIntent;
  customSkill?: ActiveSkillContext;
  resumeRunId?: string;
  executionMode?: AgentRunExecutionMode;
  workflowId?: string;
};
export type AgentRouterResponse = {
  ok: true;
  intent: AgentRouterIntent;
  agentRun?: AgentRunTrace;
  summary?: string;
  response?: AgentDialogueResponse;
  plan?: AgentWorkflowPlan;
  editPlan?: AgentCanvasEditPlan;
  organizePlan?: AgentCanvasOrganizePlan;
  patch?: CanvasPatch | CanvasEditPatch;
  skillId?: AgentWorkflowSkillId;
  skillBrief?: string;
  toolCall?: AgentToolCall;
  toolResult?: AgentToolResult;
  requiresClarification?: boolean;
  pendingIntent?: Exclude<AgentRouterIntent, "dialogue" | "organize" | "tool">;
  pendingRequest?: string;
  missingInformation?: string[];
  resolvedRequest?: string;
};

export type AgentObserveRequest = {
  userMessage: string;
  canvasSnapshot: CanvasSnapshotPayload;
  executedNodeIds: string[];
  attempt: number;
  maxRepairAttempts: number;
};

export type AgentObserveApiResponse = AgentObserveResponse;

export type AgentRunApiResponse = { ok: true; run: AgentRunRecord };
export type AgentRunListApiResponse = { ok: true; runs: Array<Pick<AgentRunRecord, "id" | "status" | "executionMode" | "updatedAt">> };
export type AgentRunUpdateRequest = AgentRunUpdate | { action: "cancel" | "resume" };
