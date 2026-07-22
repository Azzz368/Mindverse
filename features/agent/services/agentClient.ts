import { getJson, patchJson, postJson } from "@/shared/api/client";
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
  AgentRunApiResponse,
  AgentRunUpdateRequest,
} from "@/shared/api/aiContracts";

export const requestAgentRouter = (request: AgentRouterRequest) =>
  postJson<AgentRouterResponse>("/api/ai/agent-router", request, "Agent request failed.");

export const requestAgentPlan = (request: AgentPlanRequest) =>
  postJson<AgentPlanResponse>("/api/ai/agent-plan", request, "Agent workflow planning failed.");

export const requestAgentEdit = (request: AgentEditRequest) =>
  postJson<AgentEditResponse>("/api/ai/agent-edit", request, "Agent canvas edit planning failed.");

export const requestAgentOrganize = (request: AgentOrganizeRequest) =>
  postJson<AgentOrganizeResponse>("/api/ai/agent-organize", request, "Agent canvas organization failed.");

export const requestAgentDialogue = (request: AgentDialogueRequest) =>
  postJson<AgentDialogueApiResponse>("/api/ai/agent-dialogue", request, "Agent dialogue failed.");

export const requestAgentObserve = (request: AgentObserveRequest) =>
  postJson<AgentObserveApiResponse>("/api/ai/agent-observe", request, "Agent verification failed.");

const runWriteQueues = new Map<string, Promise<unknown>>();

const enqueueAgentRunWrite = <T>(runId: string, operation: () => Promise<T>) => {
  const previous = runWriteQueues.get(runId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  runWriteQueues.set(runId, current);
  const cleanup = () => {
    if (runWriteQueues.get(runId) === current) runWriteQueues.delete(runId);
  };
  void current.then(cleanup, cleanup);
  return current;
};

export const getAgentRun = (runId: string) =>
  getJson<AgentRunApiResponse>(`/api/ai/agent-runs/${encodeURIComponent(runId)}`, "Unable to load the Agent run.");

export const updateAgentRun = (runId: string, update: AgentRunUpdateRequest) =>
  enqueueAgentRunWrite(runId, () => patchJson<AgentRunApiResponse>(
    `/api/ai/agent-runs/${encodeURIComponent(runId)}`,
    update,
    "Unable to update the Agent run.",
  ));

export const cancelAgentRun = (runId: string) => updateAgentRun(runId, { action: "cancel" });

export const resumeAgentRun = (runId: string) => updateAgentRun(runId, { action: "resume" });
