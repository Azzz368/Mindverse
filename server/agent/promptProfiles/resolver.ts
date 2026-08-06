import "server-only";

import type { CapabilityEvidence, CapabilityRetrievalRequest } from "@/shared/agent/capabilityTypes";
import type { PromptProfile, PromptProfileUsage } from "@/shared/agent/promptProfiles";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import { builtInPromptProfiles } from "@/server/agent/promptProfiles/catalog";

const visualRequest = (request: CapabilityRetrievalRequest) =>
  request.requiredCapabilities.some((capability) => /image|video|storyboard|motion/.test(capability))
  || /\b(image|video|animation|anime)\b|图片|图像|视频|短片|动画|分镜/i.test(request.query);

const normalized = (value: string) => value.toLowerCase();

const profileMatchesQuery = (profile: PromptProfile, query: string) => {
  const source = normalized(query);
  return profile.aliases.some((alias) => source.includes(normalized(alias)));
};

const promptRole = (value: unknown): PromptProfile["role"] | undefined =>
  value === "base_prompt_policy" ? "base_policy" : value === "style_profile" ? "style_profile" : undefined;

const targets = (value: unknown): PromptProfile["appliesTo"] => {
  const result = Array.isArray(value) ? value.filter((item): item is "image" | "video" => item === "image" || item === "video") : [];
  return result.length ? [...new Set(result)] : ["image", "video"];
};

const phrases = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
  : [];

const priority = (value: unknown, role: PromptProfile["role"]) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(999, Math.floor(parsed))) : role === "style_profile" ? 200 : 150;
};

const profileFromCustomSkill = (skill: ActiveSkillContext): PromptProfile | undefined => {
  const role = promptRole(skill.role);
  if (!role) return undefined;
  return {
    id: `skill:${skill.id}`,
    name: skill.name,
    description: skill.tagline,
    role,
    appliesTo: targets(skill.appliesTo),
    priority: priority(skill.priority, role),
    aliases: [skill.name, ...phrases(skill.triggerPhrases)],
    runtimeInstructions: [skill.skillMd, skill.howToUse, skill.expectedOutput].filter(Boolean).join("\n\n").slice(0, 8_000),
    ragDocument: skill.skillMd,
  };
};

const profileFromEvidence = (evidence: CapabilityEvidence): PromptProfile | undefined => {
  if (evidence.sourceType !== "skill") return undefined;
  const metadata = evidence.metadata || {};
  const role = promptRole(metadata.role);
  if (!role) return undefined;
  const aliases = [evidence.title, ...phrases(metadata.triggerPhrases)];
  return {
    id: `skill:${evidence.sourceId}`,
    name: evidence.title,
    description: evidence.excerpt.slice(0, 360),
    role,
    appliesTo: targets(metadata.appliesTo),
    priority: priority(metadata.priority, role),
    aliases,
    runtimeInstructions: evidence.excerpt.slice(0, 3_500),
    ragDocument: evidence.excerpt,
  };
};

export function resolvePromptProfiles(
  request: CapabilityRetrievalRequest,
  evidence: CapabilityEvidence[] = [],
  customSkill?: ActiveSkillContext,
): { profiles: PromptProfile[]; usage: PromptProfileUsage[] } {
  if (!visualRequest(request)) return { profiles: [], usage: [] };
  const evidenceByProfileId = new Map<string, string[]>();
  evidence.filter((item) => item.sourceType === "prompt_profile").forEach((item) => {
    evidenceByProfileId.set(item.sourceId, [...(evidenceByProfileId.get(item.sourceId) || []), item.id]);
  });
  const base = builtInPromptProfiles.filter((profile) => profile.role === "base_policy");
  const builtInStyles = builtInPromptProfiles.filter((profile) => profile.role === "style_profile" && (
    profileMatchesQuery(profile, request.query) || evidenceByProfileId.has(profile.id)
  ));
  const custom = customSkill ? profileFromCustomSkill(customSkill) : undefined;
  const retrieved = evidence
    .map((item) => ({ evidence: item, profile: profileFromEvidence(item) }))
    .filter((item): item is { evidence: CapabilityEvidence; profile: PromptProfile } => Boolean(item.profile))
    // Exact trigger matches are always valid. RAG-only activation requires a
    // meaningful reranked score so unrelated style Profiles do not leak in.
    .filter(({ evidence: item, profile }) => profileMatchesQuery(profile, request.query) || item.score >= 0.12);
  retrieved.forEach(({ evidence: item, profile }) => {
    evidenceByProfileId.set(profile.id, [...(evidenceByProfileId.get(profile.id) || []), item.id]);
  });
  const unique = new Map<string, PromptProfile>();
  [...base, ...builtInStyles, ...retrieved.map((item) => item.profile), ...(custom ? [custom] : [])]
    .forEach((profile) => unique.set(profile.id, profile));
  const all = [...unique.values()];
  const bases = all.filter((profile) => profile.role === "base_policy").sort((a, b) => a.priority - b.priority);
  const style = all.filter((profile) => profile.role === "style_profile").sort((a, b) => b.priority - a.priority)[0];
  const profiles = [...bases, ...(style ? [style] : [])];
  return {
    profiles,
    usage: profiles.map((profile) => ({
      id: profile.id.startsWith("skill:") ? profile.id : `prompt-profile:${profile.id}`,
      name: profile.name,
      role: profile.role,
      source: custom?.id && profile.id === `skill:${custom.id}` ? "active" : evidenceByProfileId.has(profile.id) ? "rag" : "system",
      evidenceIds: evidenceByProfileId.get(profile.id) || [],
      appliesTo: profile.appliesTo,
    })),
  };
}
