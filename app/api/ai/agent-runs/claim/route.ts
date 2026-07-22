import { NextResponse } from "next/server";
import { claimNextWorkerRun } from "@/server/storage/agentRunStorage";

const workerAuthorized = (request: Request) => {
  const expected = process.env.AGENT_WORKER_TOKEN?.trim();
  if (!expected) return false;
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.replace(/^Bearer\s+/i, "").trim() || request.headers.get("x-agent-worker-token")?.trim();
  return supplied === expected;
};

export async function POST(request: Request) {
  if (!process.env.AGENT_WORKER_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, error: { message: "AGENT_WORKER_TOKEN is not configured." } }, { status: 503 });
  }
  if (!workerAuthorized(request)) {
    return NextResponse.json({ ok: false, error: { message: "Worker authentication failed." } }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({})) as { workerId?: unknown; leaseMs?: unknown };
    const workerId = typeof body.workerId === "string" ? body.workerId.trim().slice(0, 120) : "";
    if (!workerId) return NextResponse.json({ ok: false, error: { message: "workerId is required." } }, { status: 400 });
    const run = await claimNextWorkerRun(workerId, Number(body.leaseMs) || 60_000);
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: { message: error instanceof Error ? error.message : "Unable to claim an Agent run." },
    }, { status: 500 });
  }
}
