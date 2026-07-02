import { NextResponse } from "next/server";
import { deleteWorkflow, getWorkflow, renameWorkflow, saveWorkflow } from "@/lib/storage/workflowStorage";
import type { CanvasSnapshot } from "@/types/canvas";

type Params = { params: Promise<{ workflowId: string }> };
const isSnapshot = (value: unknown): value is CanvasSnapshot => Boolean(value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).nodes) && Array.isArray((value as CanvasSnapshot).edges));

export async function GET(request: Request, { params }: Params) {
  try {
    const { workflowId } = await params;
    const accessCode = new URL(request.url).searchParams.get("accessCode");
    const workflow = await getWorkflow(accessCode, workflowId);
    if (!workflow) return NextResponse.json({ ok: false, error: { message: "Workflow not found.", status: 404 } }, { status: 404 });
    return NextResponse.json({ ok: true, output: workflow });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Could not load workflow.", status: 400 } }, { status: 400 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { workflowId } = await params;
    const body = await request.json() as { accessCode?: unknown; snapshot?: unknown; name?: unknown };
    if (!isSnapshot(body.snapshot)) return NextResponse.json({ ok: false, error: { message: "A valid snapshot is required.", status: 400 } }, { status: 400 });
    return NextResponse.json({ ok: true, output: await saveWorkflow(body.accessCode, workflowId, body.snapshot, body.name) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Could not save workflow.", status: 400 } }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { workflowId } = await params;
    const body = await request.json() as { accessCode?: unknown; name?: unknown };
    return NextResponse.json({ ok: true, output: await renameWorkflow(body.accessCode, workflowId, body.name) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Could not rename workflow.", status: 400 } }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { workflowId } = await params;
    const accessCode = new URL(request.url).searchParams.get("accessCode");
    await deleteWorkflow(accessCode, workflowId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Could not delete workflow.", status: 400 } }, { status: 400 });
  }
}
