import "server-only";
import { validateAgentCanvasEditPlan, validateAgentCanvasOrganizePlan, validateAgentDialogueResponse, validateAgentPlan, type AgentCanvasEditPlan, type AgentCanvasOrganizePlan, type AgentDialogueMessage, type AgentDialogueResponse, type AgentWorkflowPlan } from "@/shared/agent/agentSchema";
import { buildAgentDialogueMessages, buildAgentEditMessages, buildAgentOrganizeMessages, buildAgentPlannerMessages, buildFixedSceneSkillMessages } from "@/server/agent/agentPrompt";
import { agentModel, agentProvider, requestChatCompletion } from "@/server/ai/textLLMClient";

type ChatResponse = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
};

const cleanJson = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const textArray = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

const compiledFixedSceneBriefFrom = (value: unknown, fallback: string) => {
  const raw = object(value);
  const storyGoal = text(raw.story_goal) || fallback;
  const shotPlan = textArray(raw.shot_plan);
  return [
    text(raw.title) ? `title: ${text(raw.title)}` : "",
    `story_goal: ${storyGoal}`,
    text(raw.main_character_visual) ? `main_character_visual: ${text(raw.main_character_visual)}` : "",
    text(raw.secondary_character_visual) ? `secondary_character_visual: ${text(raw.secondary_character_visual)}` : "",
    text(raw.fixed_location_visual) ? `fixed_location_visual: ${text(raw.fixed_location_visual)}` : "",
    text(raw.video_action_plan) ? `video_action_plan: ${text(raw.video_action_plan)}` : `video_action_plan: ${storyGoal}`,
    text(raw.style) ? `style: ${text(raw.style)}` : "",
    shotPlan.length ? `shot_plan:\n${shotPlan.map((item) => `- ${item}`).join("\n")}` : "",
    text(raw.continuity_rules) ? `continuity_rules: ${text(raw.continuity_rules)}` : "",
    text(raw.aspect_ratio) ? `aspect_ratio: ${text(raw.aspect_ratio)}` : "",
    Number.isFinite(Number(raw.duration_seconds)) ? `duration: ${Number(raw.duration_seconds)}s` : "",
  ].filter(Boolean).join("\n");
};

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

export async function runFixedSceneSkillLLM({ userBrief }: { userBrief: string }): Promise<string> {
  const raw = await requestChatCompletion<ChatResponse>({
    provider: agentProvider(),
    body: {
      model: agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
      messages: buildFixedSceneSkillMessages(userBrief),
      temperature: 0.25,
      response_format: { type: "json_object" },
    },
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Fixed-scene skill compiler did not return JSON content.");
  return compiledFixedSceneBriefFrom(JSON.parse(cleanJson(content)), userBrief);
}
