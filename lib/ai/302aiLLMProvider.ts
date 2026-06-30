import "server-only";
import { validateAgentCanvasEditPlan, validateAgentDialogueResponse, validateAgentPlan, type AgentCanvasEditPlan, type AgentDialogueMessage, type AgentDialogueResponse, type AgentWorkflowPlan } from "@/lib/agent/agentSchema";
import { buildAgentDialogueMessages, buildAgentEditMessages, buildAgentPlannerMessages } from "@/lib/agent/agentPrompt";
import { agentModel, agentProvider, requestChatCompletion } from "@/lib/ai/textLLMClient";

type ChatResponse = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
};

const cleanJson = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

export async function runAgentPlannerLLM({ userPrompt, canvasSummary }: { userPrompt: string; canvasSummary?: string }): Promise<AgentWorkflowPlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentPlannerMessages(userPrompt, canvasSummary),
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent planner did not return JSON content.");
  return validateAgentPlan(JSON.parse(cleanJson(content)));
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
}: {
  userInstruction: string;
  canvasSummary: string;
}): Promise<AgentCanvasEditPlan> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildAgentEditMessages({ userInstruction, canvasSummary }),
      temperature: 0.15,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent editor did not return JSON content.");
  return validateAgentCanvasEditPlan(JSON.parse(cleanJson(content)));
}
