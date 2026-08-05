export const agentExecutionModelIds = ["hkgai", "302ai-gpt-5.6-terra"] as const;

export type AgentExecutionModelId = typeof agentExecutionModelIds[number];

export const DEFAULT_AGENT_EXECUTION_MODEL: AgentExecutionModelId = "hkgai";

export const agentExecutionModelOptions: Array<{
  id: AgentExecutionModelId;
  label: string;
  providerLabel: string;
}> = [
  { id: "hkgai", label: "HKGAI", providerLabel: "MaaS" },
  { id: "302ai-gpt-5.6-terra", label: "GPT-5.6 Terra", providerLabel: "302AI" },
];

export const isAgentExecutionModelId = (value: unknown): value is AgentExecutionModelId =>
  typeof value === "string" && agentExecutionModelIds.includes(value as AgentExecutionModelId);

export const agentExecutionModelFrom = (
  value: unknown,
  fallback: AgentExecutionModelId = DEFAULT_AGENT_EXECUTION_MODEL,
): AgentExecutionModelId => isAgentExecutionModelId(value) ? value : fallback;

export const optionalAgentExecutionModelFrom = (value: unknown): AgentExecutionModelId | undefined =>
  isAgentExecutionModelId(value) ? value : undefined;
