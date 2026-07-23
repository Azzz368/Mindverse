import "server-only";
import { validateAgentCanvasEditPlan, validateAgentCanvasOrganizePlan, validateAgentDialogueResponse, validateAgentPlan, validateAgentSemanticRoute, type AgentCanvasEditPlan, type AgentCanvasOrganizePlan, type AgentDialogueMessage, type AgentDialogueResponse, type AgentWorkflowPlan } from "@/shared/agent/agentSchema";
import { buildAgentDialogueMessages, buildAgentEditMessages, buildAgentOrganizeMessages, buildAgentPlannerMessages, buildAgentRequirementMessages, buildAgentRouterMessages, buildAgentVerifierMessages } from "@/server/agent/agentPrompt";
import { agentModel, agentProvider, requestChatCompletion } from "@/server/ai/textLLMClient";
import type { AgentSemanticRoute, CapabilityEvidenceBundle } from "@/shared/agent/capabilityTypes";
import { validateAgentVerificationDecision, type AgentObservationReport, type AgentVerificationDecision } from "@/shared/agent/agentAutonomy";
import { validateAgentRequirementDecision, type AgentRequirementDecision } from "@/shared/agent/agentRequirements";

type ChatResponse = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
};

const cleanJson = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
export async function runAgentPlannerLLM({
  userPrompt,
  canvasSummary,
  semanticRoute,
  evidenceBundle,
  previousPlan,
  repairFeedback,
}: {
  userPrompt: string;
  canvasSummary?: string;
  semanticRoute?: AgentSemanticRoute;
  evidenceBundle?: CapabilityEvidenceBundle;
  previousPlan?: AgentWorkflowPlan;
  repairFeedback?: string;
}): Promise<AgentWorkflowPlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentPlannerMessages(
        userPrompt,
        canvasSummary,
        semanticRoute,
        evidenceBundle,
        previousPlan && repairFeedback ? { previousPlan, feedback: repairFeedback } : undefined,
      ),
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent planner did not return JSON content.");
  return validateAgentPlan(JSON.parse(cleanJson(content)));
}

export async function runAgentRequirementLLM({
  userMessage,
  pendingRequest,
  intendedIntent,
  canvasSummary,
  conversation,
}: {
  userMessage: string;
  pendingRequest?: string;
  intendedIntent: "create" | "edit" | "skill";
  canvasSummary: string;
  conversation: AgentDialogueMessage[];
}): Promise<AgentRequirementDecision> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentRequirementMessages({ userMessage, pendingRequest, intendedIntent, canvasSummary, conversation }),
      temperature: 0,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent requirement check did not return JSON content.");
  return validateAgentRequirementDecision(JSON.parse(cleanJson(content)), pendingRequest || userMessage);
}

export async function runAgentDialogueLLM({
  userMessage,
  conversation,
}: {
  userMessage: string;
  conversation: AgentDialogueMessage[];
}): Promise<AgentDialogueResponse> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentDialogueMessages({ userMessage, conversation }),
      temperature: 0.55,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent dialogue did not return JSON content.");
  return validateAgentDialogueResponse(JSON.parse(cleanJson(content)));
}

export async function runAgentEditLLM({
  userInstruction,
  canvasSummary,
  repairFeedback,
}: {
  userInstruction: string;
  canvasSummary: string;
  repairFeedback?: string;
}): Promise<AgentCanvasEditPlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentEditMessages({ userInstruction, canvasSummary, repairFeedback }),
      temperature: 0.15,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent editor did not return JSON content.");
  return validateAgentCanvasEditPlan(JSON.parse(cleanJson(content)));
}

export async function runAgentOrganizeLLM({
  userInstruction,
  canvasSummary,
}: {
  userInstruction: string;
  canvasSummary: string;
}): Promise<AgentCanvasOrganizePlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentOrganizeMessages({ userInstruction, canvasSummary }),
      temperature: 0.1,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent organizer did not return JSON content.");
  return validateAgentCanvasOrganizePlan(JSON.parse(cleanJson(content)));
}

export async function runAgentRouterLLM({
  userMessage,
  canvasSummary,
  memorySummary,
  conversation,
  selectedNodeIds,
}: {
  userMessage: string;
  canvasSummary: string;
  memorySummary?: string;
  conversation: AgentDialogueMessage[];
  selectedNodeIds?: string[];
}): Promise<AgentSemanticRoute> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentRouterMessages({ userMessage, canvasSummary, memorySummary, conversation }),
      temperature: 0,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent router did not return JSON content.");
  return validateAgentSemanticRoute(JSON.parse(cleanJson(content)), userMessage, selectedNodeIds);
}

export async function runAgentVerifierLLM({
  userMessage,
  observation,
  attempt,
  maxRepairAttempts,
}: {
  userMessage: string;
  observation: AgentObservationReport;
  attempt: number;
  maxRepairAttempts: number;
}): Promise<AgentVerificationDecision> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentVerifierMessages({ userMessage, observation, attempt, maxRepairAttempts }),
      temperature: 0,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent verifier did not return JSON content.");
  return validateAgentVerificationDecision(JSON.parse(cleanJson(content)));
}
