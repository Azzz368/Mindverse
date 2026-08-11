import { NextResponse } from "next/server";
import { normalizeAIError } from "@/server/ai/errors";
import { createH3ContextIR, queryH3ContextIR } from "@/server/ai/minimaxH3ContextIR";

const text = (value: unknown) => typeof value === "string" ? value : undefined;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const imageUrls = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;

const errorResponse = (error: unknown) => {
  const normalized = normalizeAIError(error);
  return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const output = await createH3ContextIR({
      prompt: text(body.prompt) || "",
      duration: number(body.duration),
      ratio: text(body.ratio),
      imageUrls: imageUrls(body.imageUrls),
    });
    return NextResponse.json({ ok: true, output, polling: { intervalMs: Number(process.env.MINIMAX_CONTEXT_IR_POLL_INTERVAL_MS || 2500) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId") || "";
    const output = await queryH3ContextIR(taskId);
    return NextResponse.json({ ok: true, output, polling: { intervalMs: output.status === "queued" || output.status === "running" ? Number(process.env.MINIMAX_CONTEXT_IR_POLL_INTERVAL_MS || 2500) : 0 } });
  } catch (error) {
    return errorResponse(error);
  }
}
