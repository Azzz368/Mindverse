import { NextResponse } from "next/server";
import { createWorkflow, listWorkflows } from "@/server/storage/workflowStorage";

export async function GET(request: Request) {
  try {
    const accessCode = new URL(request.url).searchParams.get("accessCode");
    return NextResponse.json({ ok: true, output: await listWorkflows(accessCode) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Could not load workflows.", status: 401 } }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { accessCode?: unknown; name?: unknown };
    return NextResponse.json({ ok: true, output: await createWorkflow(body.accessCode, body.name) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Could not create workflow.", status: 400 } }, { status: 400 });
  }
}
