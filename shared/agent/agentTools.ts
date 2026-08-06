export type AgentToolName = "image_search";

export type AgentToolRisk = "read" | "write" | "costly";

export type AgentToolDefinition = {
  name: AgentToolName;
  title: string;
  description: string;
  risk: AgentToolRisk;
  requiresApproval: boolean;
  inputSchema: {
    type: "object";
    required: string[];
    properties: Record<string, {
      type: "string" | "number" | "boolean";
      description: string;
      minimum?: number;
      maximum?: number;
    }>;
  };
};

export const agentToolDefinitions: Record<AgentToolName, AgentToolDefinition> = {
  image_search: {
    name: "image_search",
    title: "Search images",
    description: "Search Google Images or Bing Images with Wikimedia fallback and return source-linked candidates for user selection.",
    risk: "read",
    requiresApproval: false,
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Concise image search query." },
        limit: { type: "number", description: "Maximum result count.", minimum: 1, maximum: 12 },
      },
    },
  },
};

export type AgentImageSearchResult = {
  id: string;
  title: string;
  thumbnailUrl: string;
  imageUrl: string;
  sourcePageUrl: string;
  sourceName: string;
  creator?: string;
  license?: string;
  licenseUrl?: string;
  width?: number;
  height?: number;
};

export type AgentImageSearchToolCall = {
  name: "image_search";
  arguments: {
    query: string;
    limit?: number;
  };
};

export type AgentToolCall = AgentImageSearchToolCall;

export type AgentImageSearchToolResult = {
  name: "image_search";
  query: string;
  provider: "serpapi-google" | "serpapi-bing" | "google-cse" | "wikimedia";
  results: AgentImageSearchResult[];
};

export type AgentToolResult = AgentImageSearchToolResult;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function validateAgentToolCall(value: unknown): AgentToolCall | undefined {
  const raw = record(value);
  if (raw.name !== "image_search") return undefined;
  const args = record(raw.arguments);
  const query = text(args.query).slice(0, 160);
  if (!query) return undefined;
  const limitValue = Number(args.limit);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(12, Math.round(limitValue))) : 8;
  return { name: "image_search", arguments: { query, limit } };
}

export const agentToolCatalogForPrompt = () => Object.values(agentToolDefinitions)
  .map((tool) => `- ${tool.name}: ${tool.description} Risk=${tool.risk}; approval=${tool.requiresApproval ? "required" : "not required"}; input=${JSON.stringify(tool.inputSchema)}`)
  .join("\n");
