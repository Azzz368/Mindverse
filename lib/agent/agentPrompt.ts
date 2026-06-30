import { readAgentSkill } from "./skillLoader";

const languageInstructionFor = (text: string) =>
  /[\u3400-\u9fff]/.test(text)
    ? "The user writes Chinese. All human-readable values must be Simplified Chinese. JSON keys and enum values stay English."
    : "Preserve the user's language for all human-readable values. JSON keys and enum values stay English.";

export function buildAgentPlannerMessages(userPrompt: string, canvasSummary?: string) {
  return [
    {
      role: "system",
      content: [
        readAgentSkill("workflow-planner"),
        languageInstructionFor(userPrompt),
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User creative request:\n${userPrompt}`,
        canvasSummary ? `Current canvas summary:\n${canvasSummary}` : "Current canvas summary: empty or unavailable.",
        "Create the best initial editable workflow plan.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

export function buildAgentDialogueMessages({
  userMessage,
  conversation,
}: {
  userMessage: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const languageSource = [userMessage, ...conversation.map((item) => item.content)].join("\n");
  return [
    {
      role: "system",
      content: [
        readAgentSkill("ideation-dialogue"),
        languageInstructionFor(languageSource),
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        "Conversation so far:",
        JSON.stringify(conversation.slice(-12), null, 2),
        "Latest user message:",
        userMessage,
        "Continue the ideation dialogue.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}

export function buildAgentEditMessages({
  userInstruction,
  canvasSummary,
}: {
  userInstruction: string;
  canvasSummary: string;
}) {
  return [
    {
      role: "system",
      content: [
        readAgentSkill("canvas-edit"),
        languageInstructionFor(userInstruction),
        "Return JSON only. Do not output Markdown.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `User edit instruction:\n${userInstruction}`,
        canvasSummary,
        "Create a safe canvas edit plan.",
      ].join("\n\n"),
    },
  ] as Array<{ role: "system" | "user"; content: string }>;
}
