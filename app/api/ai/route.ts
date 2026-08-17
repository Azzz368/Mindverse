import { NextResponse } from "next/server";
import { runCanvasNode } from "@/server/workflow/nodeRunners";
import type { CanvasNode } from "@/shared/canvas";
import { AuthError, requireSession } from "@/server/auth/auth";

export async function POST(request: Request) {
  try { await requireSession(request); const { node, inputs = [] } = await request.json() as { node: CanvasNode; inputs?: unknown[] }; return NextResponse.json(await runCanvasNode(node, inputs)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to run node" }, { status: error instanceof AuthError ? error.status : 400 }); }
}
