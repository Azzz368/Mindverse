export type PromptProfileRole = "base_policy" | "style_profile";

export type PromptProfileTarget = "image" | "video";

/**
 * A prompt profile guides how visual-generation prompts are written.  It is
 * deliberately not a provider capability: profiles cannot execute canvas
 * steps or select models.
 */
export type PromptProfile = {
  id: string;
  name: string;
  description: string;
  role: PromptProfileRole;
  appliesTo: PromptProfileTarget[];
  priority: number;
  aliases: string[];
  conflictsWith?: string[];
  runtimeInstructions: string;
  ragDocument: string;
};

export type PromptProfileUsage = {
  id: string;
  name: string;
  role: PromptProfileRole;
  source: "system" | "rag" | "active";
  evidenceIds: string[];
  appliesTo: PromptProfileTarget[];
};
