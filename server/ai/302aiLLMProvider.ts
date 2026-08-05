import "server-only";
import { validateAgentCanvasEditPlan, validateAgentCanvasOrganizePlan, validateAgentDialogueResponse, validateAgentPlan, validateAgentSemanticRoute, type AgentCanvasEditPlan, type AgentCanvasOrganizePlan, type AgentDialogueMessage, type AgentDialogueResponse, type AgentWorkflowPlan } from "@/shared/agent/agentSchema";
import { buildAgentDialogueMessages, buildAgentEditMessages, buildAgentOrganizeMessages, buildAgentPlannerMessages, buildAgentPromptComposerMessages, buildAgentRequirementMessages, buildAgentRouterMessages, buildAgentVerifierMessages } from "@/server/agent/agentPrompt";
import { agentModel, agentProvider, requestChatCompletion } from "@/server/ai/textLLMClient";
import type { AgentSemanticRoute, CapabilityEvidenceBundle } from "@/shared/agent/capabilityTypes";
import { validateAgentVerificationDecision, type AgentObservationReport, type AgentVerificationDecision } from "@/shared/agent/agentAutonomy";
import { validateAgentRequirementDecision, type AgentRequirementDecision } from "@/shared/agent/agentRequirements";
import { validateComposedPromptDrafts } from "@/server/agent/composeWorkflowPrompts";
import type { PromptProfile } from "@/shared/agent/promptProfiles";
import type { AgentExecutionModelId } from "@/shared/agent/executionModels";

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
  executionModel,
}: {
  userPrompt: string;
  canvasSummary?: string;
  semanticRoute?: AgentSemanticRoute;
  evidenceBundle?: CapabilityEvidenceBundle;
  previousPlan?: AgentWorkflowPlan;
  repairFeedback?: string;
  executionModel?: AgentExecutionModelId;
}): Promise<AgentWorkflowPlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
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

export async function runAgentPromptComposerLLM({
  userPrompt,
  plan,
  profiles,
  executionModel,
}: {
  userPrompt: string;
  plan: AgentWorkflowPlan;
  profiles: PromptProfile[];
  executionModel?: AgentExecutionModelId;
}) {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
      messages: buildAgentPromptComposerMessages({ userPrompt, plan, profiles }),
      temperature: 0.25,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Prompt composer did not return JSON content.");
  return validateComposedPromptDrafts(JSON.parse(cleanJson(content)), plan);
}

export async function runAgentRequirementLLM({
  userMessage,
  pendingRequest,
  intendedIntent,
  canvasSummary,
  conversation,
  skillGuidance,
  executionModel,
}: {
  userMessage: string;
  pendingRequest?: string;
  intendedIntent: "create" | "edit" | "skill";
  canvasSummary: string;
  conversation: AgentDialogueMessage[];
  skillGuidance?: string;
  executionModel?: AgentExecutionModelId;
}): Promise<AgentRequirementDecision> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
      messages: buildAgentRequirementMessages({ userMessage, pendingRequest, intendedIntent, canvasSummary, conversation, skillGuidance }),
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
  executionModel,
}: {
  userMessage: string;
  conversation: AgentDialogueMessage[];
  executionModel?: AgentExecutionModelId;
}): Promise<AgentDialogueResponse> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
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
  executionModel,
}: {
  userInstruction: string;
  canvasSummary: string;
  repairFeedback?: string;
  executionModel?: AgentExecutionModelId;
}): Promise<AgentCanvasEditPlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
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
  executionModel,
}: {
  userInstruction: string;
  canvasSummary: string;
  executionModel?: AgentExecutionModelId;
}): Promise<AgentCanvasOrganizePlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
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
  executionModel,
}: {
  userMessage: string;
  canvasSummary: string;
  memorySummary?: string;
  conversation: AgentDialogueMessage[];
  selectedNodeIds?: string[];
  executionModel?: AgentExecutionModelId;
}): Promise<AgentSemanticRoute> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
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
  executionModel,
}: {
  userMessage: string;
  observation: AgentObservationReport;
  attempt: number;
  maxRepairAttempts: number;
  executionModel?: AgentExecutionModelId;
}): Promise<AgentVerificationDecision> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(executionModel),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o", executionModel),
      messages: buildAgentVerifierMessages({ userMessage, observation, attempt, maxRepairAttempts }),
      temperature: 0,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent verifier did not return JSON content.");
  return validateAgentVerificationDecision(JSON.parse(cleanJson(content)));
}
