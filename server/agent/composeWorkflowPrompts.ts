import "server-only";

import type { AgentWorkflowPlan } from "@/shared/agent/agentSchema";
import type { PromptProfile } from "@/shared/agent/promptProfiles";

type PromptDraft = { id: string; prompt: string; negativePrompt?: string };

const visualKinds = new Set(["image", "video"]);
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function applyComposedPrompts(plan: AgentWorkflowPlan, drafts: PromptDraft[]): AgentWorkflowPlan {
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      if (!visualKinds.has(step.kind)) return step;
      const draft = byId.get(step.id);
      if (!draft?.prompt) return step;
      const params = record(step.params);
      return {
        ...step,
        prompt: draft.prompt,
        params: draft.negativePrompt ? { ...params, negativePrompt: draft.negativePrompt } : params,
      };
    }),
  };
}

/** Deterministic fallback keeps every visual node useful if the composing LLM is unavailable. */
export function fallbackComposedPrompts(plan: AgentWorkflowPlan, profiles: PromptProfile[]): PromptDraft[] {
  return plan.steps.filter((step) => visualKinds.has(step.kind)).map((step) => ({
    id: step.id,
    prompt: [
      step.prompt || step.purpose || plan.userPrompt,
      ...profiles.filter((profile) => profile.appliesTo.includes(step.kind as "image" | "video")).map((profile) => profile.runtimeInstructions),
    ].filter(Boolean).join("\n\n"),
    negativePrompt: "collage, split screen, storyboard grid, watermark, logo, unreadable text, malformed anatomy, extra fingers, face drift, plastic 3D render, game CG, oversharpening, AI smear",
  }));
}

export const validateComposedPromptDrafts = (value: unknown, plan: AgentWorkflowPlan): PromptDraft[] => {
  const allowed = new Set(plan.steps.filter((step) => visualKinds.has(step.kind)).map((step) => step.id));
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const items = Array.isArray(raw.steps) ? raw.steps : [];
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const id = clean(source.id);
    const prompt = clean(source.prompt);
    if (!allowed.has(id) || seen.has(id) || !prompt) return [];
    seen.add(id);
    return [{ id, prompt: prompt.slice(0, 12_000), negativePrompt: clean(source.negativePrompt).slice(0, 4_000) || undefined }];
  });
};
