import { postJson } from "@/shared/api/client";
import type {
  AgentDialogueApiResponse,
  AgentDialogueRequest,
  AgentEditRequest,
  AgentEditResponse,
  AgentObserveApiResponse,
  AgentObserveRequest,
  AgentOrganizeRequest,
  AgentOrganizeResponse,
  AgentPlanRequest,
  AgentPlanResponse,
  AgentRouterRequest,
  AgentRouterResponse,
} from "@/shared/api/aiContracts";

export const requestAgentRouter = (request: AgentRouterRequest) =>
  postJson<AgentRouterResponse>("/api/ai/agent-router", request, "Agent request failed.");

export const requestAgentPlan = (request: AgentPlanRequest) =>
  postJson<AgentPlanResponse>("/api/ai/agent-plan", request, "Agent 工作流计划生成失败。");

export const requestAgentEdit = (request: AgentEditRequest) =>
  postJson<AgentEditResponse>("/api/ai/agent-edit", request, "Agent 画布修改计划生成失败。");

export const requestAgentOrganize = (request: AgentOrganizeRequest) =>
  postJson<AgentOrganizeResponse>("/api/ai/agent-organize", request, "Agent 画布整理计划生成失败。");

export const requestAgentDialogue = (request: AgentDialogueRequest) =>
  postJson<AgentDialogueApiResponse>("/api/ai/agent-dialogue", request, "Agent 构思对话生成失败。");

export const requestAgentObserve = (request: AgentObserveRequest) =>
  postJson<AgentObserveApiResponse>("/api/ai/agent-observe", request, "Agent 无法验证自主执行结果。");
