import { NextResponse } from "next/server";
import { normalizeAIError } from "@/server/ai/errors";
import { isRunnableNodeType, runNodeUseCase } from "@/server/ai/application/runNodeUseCase";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { nodeType?: unknown; input?: unknown };
    if (!isRunnableNodeType(body.nodeType) || !body.input || typeof body.input !== "object") {
      return NextResponse.json({ ok: false, error: { message: "Invalid nodeType or input.", code: "INVALID_REQUEST", status: 400 } }, { status: 400 });
    }
    const result = await runNodeUseCase(body.nodeType, body.input as Record<string, unknown>);
    if (!result.ok) return NextResponse.json(result, { status: result.error.status });
    return NextResponse.json(result);
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
