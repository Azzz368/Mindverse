import "server-only";

import type { PromptProfile } from "@/shared/agent/promptProfiles";
import { ingestRagDocument } from "@/server/rag/documentIngestion";

export const indexPromptProfileDocument = (profile: PromptProfile) => ingestRagDocument({
  domain: "capability",
  sourceType: "prompt_profile",
  sourceId: profile.id,
  title: profile.name,
  visibility: "public",
  content: profile.ragDocument,
  metadata: {
    role: profile.role,
    appliesTo: profile.appliesTo,
    aliases: profile.aliases,
    priority: profile.priority,
  },
  version: 1,
});
