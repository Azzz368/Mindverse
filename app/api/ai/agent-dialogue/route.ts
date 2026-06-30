import { NextResponse } from "next/server";
import { normalizeAIError } from "@/lib/ai/errors";
import { runAgentDialogueLLM } from "@/lib/ai/302aiLLMProvider";
import type { AgentDialogueMessage } from "@/lib/agent/agentSchema";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const messagesFrom = (value: unknown): AgentDialogueMessage[] => Array.isArray(value)
  ? value.map((item) => {
    const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const role = raw.role === "assistant" ? "assistant" : "user";
    const content = text(raw.content);
    return content ? { role, content } : undefined;
  }).filter((item): item is AgentDialogueMessage => Boolean(item))
  : [];

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userMessage?: unknown; conversation?: unknown };
    const userMessage = text(body.userMessage);
    if (!userMessage) return NextResponse.json({ ok: false, error: { message: "userMessage is required." } }, { status: 400 });
    const response = await runAgentDialogueLLM({ userMessage, conversation: messagesFrom(body.conversation) });
    return NextResponse.json({ ok: true, response });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
