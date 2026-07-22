import { NextResponse } from "next/server";
import { heartbeatAgentRunLease } from "@/server/storage/agentRunStorage";

type RouteContext = { params: Promise<{ runId: string }> };

const workerAuthorized = (request: Request) => {
  const expected = process.env.AGENT_WORKER_TOKEN?.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization") || "";
  return authorization.replace(/^Bearer\s+/i, "").trim() === expected || request.headers.get("x-agent-worker-token")?.trim() === expected;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!workerAuthorized(request)) {
    return NextResponse.json({ ok: false, error: { message: "Worker authentication failed." } }, { status: 401 });
  }
  try {
    const { runId } = await context.params;
    const body = await request.json() as { workerId?: unknown; leaseMs?: unknown };
    const workerId = typeof body.workerId === "string" ? body.workerId.trim().slice(0, 120) : "";
    if (!workerId) return NextResponse.json({ ok: false, error: { message: "workerId is required." } }, { status: 400 });
    const run = await heartbeatAgentRunLease(runId, workerId, Number(body.leaseMs) || 60_000);
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: { message: error instanceof Error ? error.message : "Unable to renew the Agent run lease." },
    }, { status: 400 });
  }
}
