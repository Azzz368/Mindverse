import "server-only";

import {
  agentToolDefinitions,
  validateAgentToolCall,
  type AgentToolCall,
  type AgentToolDefinition,
  type AgentToolName,
  type AgentToolResult,
} from "@/shared/agent/agentTools";
import { searchImages } from "./tools/imageSearchTool";

type RegisteredTool = {
  definition: AgentToolDefinition;
  execute(call: AgentToolCall): Promise<AgentToolResult>;
};

export type AgentToolExecutionContext = {
  approved?: boolean;
};

const registry: Record<AgentToolName, RegisteredTool> = {
  image_search: {
    definition: agentToolDefinitions.image_search,
    execute: async (call) => {
      if (call.name !== "image_search") throw new Error("Invalid call for image_search.");
      return searchImages({ query: call.arguments.query, limit: call.arguments.limit });
    },
  },
};

export const listAgentTools = () => Object.values(registry).map((entry) => entry.definition);

export const getAgentToolDefinition = (name: AgentToolName) => registry[name]?.definition;

export async function executeAgentTool(value: AgentToolCall, context: AgentToolExecutionContext = {}): Promise<AgentToolResult> {
  const call = validateAgentToolCall(value);
  if (!call) throw new Error("Agent tool call failed schema validation.");
  const tool = registry[call.name];
  if (!tool) throw new Error(`Unsupported Agent tool: ${call.name}.`);
  if (tool.definition.requiresApproval && !context.approved) {
    throw new Error(`Agent tool ${call.name} requires user approval before execution.`);
  }
  return tool.execute(call);
}
