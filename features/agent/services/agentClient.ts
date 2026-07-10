import { postJson } from "@/shared/api/client";
import type {
  AgentDialogueApiResponse,
  AgentDialogueRequest,
  AgentEditRequest,
  AgentEditResponse,
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
  postJson<AgentPlanResponse>("/api/ai/agent-plan", request, "Agent 计划生成失败。");

export const requestAgentEdit = (request: AgentEditRequest) =>
  postJson<AgentEditResponse>("/api/ai/agent-edit", request, "Agent 修改计划生成失败。");

export const requestAgentOrganize = (request: AgentOrganizeRequest) =>
  postJson<AgentOrganizeResponse>("/api/ai/agent-organize", request, "Agent 整理计划生成失败。");

export const requestAgentDialogue = (request: AgentDialogueRequest) =>
  postJson<AgentDialogueApiResponse>("/api/ai/agent-dialogue", request, "构思对话生成失败。");
