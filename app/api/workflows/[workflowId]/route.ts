import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/server/auth/auth";
import { deleteWorkflow, getWorkflow, renameWorkflow, saveWorkflow, WorkflowStorageError } from "@/server/storage/workflowStorage";
import type { CanvasSnapshot } from "@/shared/canvas";

type Params = { params: Promise<{ workflowId: string }> };
const isSnapshot = (value: unknown): value is CanvasSnapshot => Boolean(value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).nodes) && Array.isArray((value as CanvasSnapshot).edges));
const maxWorkflowRequestBytes = Math.max(256 * 1024, Number(process.env.MINDVERSE_MAX_WORKFLOW_REQUEST_BYTES || 3 * 1024 * 1024));
const failure = (error: unknown, fallback: string) => {
  if (error instanceof WorkflowStorageError) return { status: error.status, body: { ok: false, error: { message: error.message, code: error.code, status: error.status } } };
  return authErrorResponse(error, fallback);
};

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession(request);
    const { workflowId } = await params;
    const workflow = await getWorkflow(session.workspaceId, workflowId);
    if (!workflow) return NextResponse.json({ ok: false, error: { message: "Workflow not found.", status: 404 } }, { status: 404 });
    return NextResponse.json({ ok: true, output: workflow });
  } catch (error) {
    const value = failure(error, "Could not load workflow.");
    return NextResponse.json(value.body, { status: value.status });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const session = await requireSession(request);
    const { workflowId } = await params;
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > maxWorkflowRequestBytes) return NextResponse.json({ ok: false, error: { message: "Workflow payload is too large.", status: 413 } }, { status: 413 });
    const body = await request.json() as { snapshot?: unknown; name?: unknown; expectedRevision?: unknown };
    if (!isSnapshot(body.snapshot)) return NextResponse.json({ ok: false, error: { message: "A valid snapshot is required.", status: 400 } }, { status: 400 });
    return NextResponse.json({ ok: true, output: await saveWorkflow({ workspaceId: session.workspaceId, userId: session.userId }, workflowId, body.snapshot, body.name, body.expectedRevision) });
  } catch (error) {
    const value = failure(error, "Could not save workflow.");
    return NextResponse.json(value.body, { status: value.status });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requireSession(request);
    const { workflowId } = await params;
    const body = await request.json() as { name?: unknown };
    return NextResponse.json({ ok: true, output: await renameWorkflow({ workspaceId: session.workspaceId, userId: session.userId }, workflowId, body.name) });
  } catch (error) {
    const value = failure(error, "Could not rename workflow.");
    return NextResponse.json(value.body, { status: value.status });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession(request);
    const { workflowId } = await params;
    await deleteWorkflow({ workspaceId: session.workspaceId, userId: session.userId }, workflowId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const value = failure(error, "Could not delete workflow.");
    return NextResponse.json(value.body, { status: value.status });
  }
}
