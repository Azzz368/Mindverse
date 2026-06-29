import "server-only";
import { validateAgentPlan, type AgentWorkflowPlan } from "@/lib/agent/agentSchema";
import { buildAgentPlannerMessages } from "@/lib/agent/agentPrompt";
import { request302OpenAI } from "@/lib/ai/302aiClient";

type ChatResponse = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
};

const cleanJson = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

export async function runAgentPlannerLLM({ userPrompt, canvasSummary }: { userPrompt: string; canvasSummary?: string }): Promise<AgentWorkflowPlan> {
  const raw = await request302OpenAI<ChatResponse>("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: process.env.AGENT_LLM_MODEL || "gpt-4o",
      messages: buildAgentPlannerMessages(userPrompt, canvasSummary),
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  const content = raw.choices?.[0]?.message?.content || raw.choices?.[0]?.delta?.content;
  if (!content) throw new Error("Agent planner did not return JSON content.");
  return validateAgentPlan(JSON.parse(cleanJson(content)));
}
