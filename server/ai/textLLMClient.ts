import "server-only";
import { request302OpenAI } from "./302aiClient";
import { requestHKGAIOpenAI } from "./hkgaiClient";
import { AIProviderError } from "./errors";
import type { AgentExecutionModelId } from "@/shared/agent/executionModels";

export type TextLLMProvider = "302ai" | "hkgai";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
};

const bool = (value: unknown, fallback = false) => {
  if (typeof value !== "string") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};
const DEFAULT_HKGAI_MODEL = "t2_hkgai-v3_fp8_1m_e7";
const providerFrom = (value: unknown): TextLLMProvider => typeof value === "string" && value.toLowerCase() === "302ai" ? "302ai" : "hkgai";
const isHKGAIModel = (value: string) => value.startsWith("t2_") || value === process.env.HKGAI_TEXT_MODEL || value === process.env.HKGAI_STORYBOARD_MODEL || value === process.env.HKGAI_AGENT_MODEL;

export const textProvider = () => providerFrom(process.env.AI_TEXT_PROVIDER);
export const agentProvider = (executionModel?: AgentExecutionModelId) => executionModel === "302ai-gpt-5.6-terra"
  ? "302ai"
  : executionModel === "hkgai"
    ? "hkgai"
    : providerFrom(process.env.AGENT_LLM_PROVIDER || process.env.AI_TEXT_PROVIDER);
export const textModel = (fallback302: string) => textProvider() === "hkgai" ? isHKGAIModel(fallback302) ? fallback302 : process.env.HKGAI_TEXT_MODEL || DEFAULT_HKGAI_MODEL : fallback302;
export const storyboardModel = (fallback302: string) => textProvider() === "hkgai" ? process.env.HKGAI_STORYBOARD_MODEL || process.env.HKGAI_TEXT_MODEL || DEFAULT_HKGAI_MODEL : fallback302;
export const agentModel = (fallback302: string, executionModel?: AgentExecutionModelId) => {
  if (executionModel === "302ai-gpt-5.6-terra") return process.env.AGENT_302_TERRA_MODEL || "gpt-5.6-terra";
  return agentProvider(executionModel) === "hkgai"
    ? process.env.HKGAI_AGENT_MODEL || process.env.HKGAI_TEXT_MODEL || DEFAULT_HKGAI_MODEL
    : fallback302;
};

export async function requestChatCompletion<T = ChatCompletionResponse>({
  provider,
  body,
}: {
  provider: TextLLMProvider;
  body: Record<string, unknown>;
}) {
  const requestedModel = typeof body.model === "string" ? body.model : "";
  const isTerra = provider === "302ai" && requestedModel === (process.env.AGENT_302_TERRA_MODEL || "gpt-5.6-terra");
  const providerBody = { ...body };
  if (isTerra) {
    delete providerBody.temperature;
    providerBody.reasoning_effort = process.env.AGENT_302_TERRA_REASONING_EFFORT || "medium";
  }
  const requestBody = provider === "hkgai" && bool(process.env.HKGAI_ENABLE_THINKING)
    ? {
      ...providerBody,
      chat_template_kwargs: {
        thinking: true,
        thinking_budget: Number(process.env.HKGAI_THINKING_BUDGET || 8192),
      },
    }
    : providerBody;
  const maxRetries = Math.max(0, Math.min(3, Number(process.env.TEXT_LLM_MAX_RETRIES || 1)));
  const agentTimeoutMs = Math.max(10_000, Number(process.env.AGENT_LLM_TIMEOUT_MS || 60_000));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return provider === "hkgai"
        ? await requestHKGAIOpenAI<T>("/chat/completions", { method: "POST", body: JSON.stringify(requestBody) })
        : await request302OpenAI<T>("/chat/completions", { method: "POST", body: JSON.stringify(requestBody), timeoutMs: agentTimeoutMs });
    } catch (error) {
      const retryable = error instanceof AIProviderError && error.code !== "AI_PROVIDER_TIMEOUT" && (error.status === 429 || error.status >= 500);
      if (!retryable || attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
    }
  }
}
