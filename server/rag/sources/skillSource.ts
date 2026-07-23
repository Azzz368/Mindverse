import "server-only";

import type { StoredSkill } from "@/shared/skills/skillTypes";
import { capabilityRecordFromSkill } from "@/server/agent/capabilities/skillCapabilityIndexer";
import { deactivateRagDocument, ingestRagDocument } from "@/server/rag/documentIngestion";

export const skillRagContent = (skill: StoredSkill) => {
  const capability = capabilityRecordFromSkill(skill);
  return [
    `# ${skill.name}`,
    `Tagline: ${skill.tagline}`,
    `Capabilities: ${capability.capabilities.join(", ")}`,
    `Category: ${skill.category}`,
    `Usage scenario: ${skill.usageScenario}`,
    `How to use: ${skill.howToUse}`,
    `Expected output: ${skill.expectedOutput}`,
    skill.skillMd,
  ].join("\n\n");
};

export const indexSkillDocument = (skill: StoredSkill, tenantId = "shared") => ingestRagDocument({
  domain: "capability",
  sourceType: "skill",
  sourceId: skill.id,
  tenantId,
  title: skill.name,
  visibility: skill.visibility === "public" ? "public" : "tenant",
  content: skillRagContent(skill),
  version: skill.version,
  metadata: {
    capabilityId: `skill:${skill.id}`,
    category: skill.category,
    visibility: skill.visibility,
    capabilities: capabilityRecordFromSkill(skill).capabilities,
    hasCanvasTemplate: skill.hasCanvasTemplate,
    nodeCount: skill.nodeCount,
  },
});

export const deactivateSkillDocument = (skillId: string, tenantId = "shared") =>
  deactivateRagDocument("skill", skillId, tenantId);
