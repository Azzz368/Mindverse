export type AgentToolName = "image_search";

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
