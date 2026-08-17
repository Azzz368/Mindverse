import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/server/auth/auth";
import { createWorkflow, listWorkflows } from "@/server/storage/workflowStorage";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    return NextResponse.json({ ok: true, output: await listWorkflows(session.workspaceId) });
  } catch (error) {
    const failure = authErrorResponse(error, "Could not load workflows.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json() as { name?: unknown };
    return NextResponse.json({ ok: true, output: await createWorkflow({ workspaceId: session.workspaceId, userId: session.userId }, body.name) });
  } catch (error) {
    const failure = authErrorResponse(error, "Could not create workflow.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
