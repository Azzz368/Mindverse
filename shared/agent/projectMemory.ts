import type { AgentWorkflowSkillId } from "./workflowSkills";

export type AgentMemoryIntent = "dialogue" | "create" | "edit" | "organize" | "skill";

export type AgentProjectMemory = {
  storyBrief?: string;
  selectedDirection?: string;
  visualStyle?: string;
  preferredWorkflowSkill?: AgentWorkflowSkillId;
  constraints?: string[];
  characters?: Array<{ id: string; name?: string; description: string }>;
  locations?: Array<{ id: string; name?: string; description: string }>;
  lastIntent?: AgentMemoryIntent;
  pendingIntent?: Exclude<AgentMemoryIntent, "dialogue" | "organize">;
  pendingRequest?: string;
  pendingQuestions?: string[];
  updatedAt?: string;
};

export const emptyAgentProjectMemory = (): AgentProjectMemory => ({ updatedAt: new Date().toISOString() });

export const mergeAgentProjectMemory = (
  current: AgentProjectMemory | undefined | null,
  patch: Partial<AgentProjectMemory>,
): AgentProjectMemory => ({
  ...(current || {}),
  ...patch,
  constraints: patch.constraints || current?.constraints,
  characters: patch.characters || current?.characters,
  locations: patch.locations || current?.locations,
  updatedAt: new Date().toISOString(),
});

export const agentMemorySummary = (memory: AgentProjectMemory | undefined | null) => {
  if (!memory) return "";
  return [
    memory.storyBrief ? `storyBrief: ${memory.storyBrief}` : "",
    memory.selectedDirection ? `selectedDirection: ${memory.selectedDirection}` : "",
    memory.visualStyle ? `visualStyle: ${memory.visualStyle}` : "",
    memory.preferredWorkflowSkill ? `preferredWorkflowSkill: ${memory.preferredWorkflowSkill}` : "",
    memory.constraints?.length ? `constraints: ${memory.constraints.join("; ")}` : "",
    memory.characters?.length ? `characters: ${memory.characters.map((item) => `${item.name || item.id}: ${item.description}`).join("; ")}` : "",
    memory.locations?.length ? `locations: ${memory.locations.map((item) => `${item.name || item.id}: ${item.description}`).join("; ")}` : "",
    memory.lastIntent ? `lastIntent: ${memory.lastIntent}` : "",
    memory.pendingIntent ? `pendingIntent: ${memory.pendingIntent}` : "",
    memory.pendingRequest ? `pendingRequest: ${memory.pendingRequest}` : "",
    memory.pendingQuestions?.length ? `pendingQuestions: ${memory.pendingQuestions.join("; ")}` : "",
  ].filter(Boolean).join("\n");
};
