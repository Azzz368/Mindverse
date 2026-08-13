import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/server/auth/auth";
import { createSkill, listSkills } from "@/server/storage/skillStorage";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    return NextResponse.json({ ok: true, output: await listSkills(session.workspaceId) });
  } catch (error) {
    const failure = authErrorResponse(error, "Could not load skills.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json() as { skill?: unknown };
    return NextResponse.json({ ok: true, output: await createSkill({ workspaceId: session.workspaceId, userId: session.userId }, body.skill) });
  } catch (error) {
    const failure = authErrorResponse(error, "Could not create skill.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
