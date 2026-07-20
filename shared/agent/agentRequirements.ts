export type AgentRequirementDecision = {
  ready: boolean;
  resolvedRequest: string;
  missingInformation: string[];
  questions: string[];
  assumptions: string[];
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const textArray = (value: unknown, max: number) => Array.isArray(value)
  ? value.map(text).filter(Boolean).slice(0, max)
  : [];

export function validateAgentRequirementDecision(value: unknown, fallbackRequest: string): AgentRequirementDecision {
  const raw = object(value);
  const ready = raw.ready === true;
  const questions = textArray(raw.questions, 3);
  if (!ready && !questions.length) throw new Error("Agent requirement check found missing information but returned no questions.");
  return {
    ready,
    resolvedRequest: text(raw.resolvedRequest) || fallbackRequest,
    missingInformation: textArray(raw.missingInformation, 6),
    questions: ready ? [] : questions,
    assumptions: textArray(raw.assumptions, 6),
  };
}
