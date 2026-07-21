import "server-only";

import type { AgentToolCall, AgentToolResult } from "@/shared/agent/agentTools";
import { searchImages } from "./tools/imageSearchTool";

export async function executeAgentTool(call: AgentToolCall): Promise<AgentToolResult> {
  if (call.name === "image_search") {
    return searchImages({ query: call.arguments.query, limit: call.arguments.limit });
  }
  throw new Error("Unsupported Agent tool.");
}
