import { NextResponse } from "next/server";
import { normalizeAIError } from "@/lib/ai/errors";
import { getAIProvider } from "@/lib/ai/provider";
import type { GenerateAudioInput, GenerateImageInput, GenerateStoryboardInput, GenerateTextInput, GenerateVideoInput } from "@/lib/ai/types";

type RunnableNodeType = "text" | "image" | "video" | "audio" | "storyboard";
const isRunnable = (value: unknown): value is RunnableNodeType => ["text", "image", "video", "audio", "storyboard"].includes(String(value));
export async function POST(request: Request) {
  try {
    const body = await request.json() as { nodeType?: unknown; input?: unknown };
    if (!isRunnable(body.nodeType) || !body.input || typeof body.input !== "object") return NextResponse.json({ ok: false, error: { message: "Invalid nodeType or input.", code: "INVALID_REQUEST", status: 400 } }, { status: 400 });
    const provider = getAIProvider();
    const output = body.nodeType === "text" ? await provider.generateText(body.input as GenerateTextInput)
      : body.nodeType === "image" ? await provider.generateImage(body.input as GenerateImageInput)
      : body.nodeType === "video" ? await provider.generateVideo(body.input as GenerateVideoInput)
      : body.nodeType === "audio" ? await provider.generateAudio(body.input as GenerateAudioInput)
      : await provider.generateStoryboard(body.input as GenerateStoryboardInput);
    return NextResponse.json({ ok: true, provider: provider.name, output, polling: { intervalMs: Number(process.env.AI_302_POLL_INTERVAL_MS || 3000), maxAttempts: Number(process.env.AI_302_MAX_POLL_ATTEMPTS || 40) } });
  } catch (error) { const normalized = normalizeAIError(error); return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 }); }
}
