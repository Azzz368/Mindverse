import { NextResponse } from "next/server";
import {
  getAgentRun,
  requestAgentRunCancellation,
  requestAgentRunResume,
  updateAgentRun,
} from "@/server/storage/agentRunStorage";
import type { AgentRunUpdate } from "@/shared/agent/agentAutonomy";

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { runId } = await context.params;
    const run = await getAgentRun(runId);
    if (!run) return NextResponse.json({ ok: false, error: { message: "Agent run not found." } }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: { message: error instanceof Error ? error.message : "Unable to read Agent run." },
    }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { runId } = await context.params;
    const body = await request.json() as AgentRunUpdate & { action?: unknown };
    const run = body.action === "cancel"
      ? await requestAgentRunCancellation(runId)
      : body.action === "resume"
        ? await requestAgentRunResume(runId)
        : await updateAgentRun(runId, {
          events: Array.isArray(body.events) ? body.events : undefined,
          status: body.status,
          currentPhase: body.currentPhase,
          summary: typeof body.summary === "string" ? body.summary : undefined,
          checkpoint: body.checkpoint,
        });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Agent run.";
    return NextResponse.json({ ok: false, error: { message } }, { status: /not found/i.test(message) ? 404 : 400 });
  }
}
