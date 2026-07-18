import { NextResponse } from "next/server";
import { normalizeAIError } from "@/server/ai/errors";
import { isPollableTaskType, pollTaskUseCase } from "@/server/ai/application/pollTaskUseCase";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { type?: unknown; taskId?: unknown; provider?: unknown; pollUrl?: unknown; pollAction?: unknown; expectedAspectRatio?: unknown };
    if (!isPollableTaskType(body.type) || typeof body.taskId !== "string" || !body.taskId) {
      return NextResponse.json({ ok: false, error: { message: "A valid task type and taskId are required.", code: "INVALID_REQUEST", status: 400 } }, { status: 400 });
    }
    const result = await pollTaskUseCase({
      type: body.type,
      taskId: body.taskId,
      provider: typeof body.provider === "string" && body.provider ? body.provider : undefined,
      pollUrl: typeof body.pollUrl === "string" && body.pollUrl ? body.pollUrl : undefined,
      pollAction: typeof body.pollAction === "string" && body.pollAction ? body.pollAction : undefined,
      expectedAspectRatio: typeof body.expectedAspectRatio === "string" && body.expectedAspectRatio ? body.expectedAspectRatio : undefined,
    });
    if (!result.ok) return NextResponse.json(result, { status: result.error.status });
    return NextResponse.json(result);
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
