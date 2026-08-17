import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/server/auth/auth";
import { deleteSkill, getSkill, updateSkill } from "@/server/storage/skillStorage";

type Params = { params: Promise<{ skillId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await requireSession(request);
    const { skillId } = await params;
    const skill = await getSkill(session.workspaceId, skillId);
    if (!skill) return NextResponse.json({ ok: false, error: { message: "Skill not found.", status: 404 } }, { status: 404 });
    return NextResponse.json({ ok: true, output: skill });
  } catch (error) {
    const failure = authErrorResponse(error, "Could not load skill.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const session = await requireSession(request);
    const { skillId } = await params;
    const body = await request.json() as { skill?: unknown };
    return NextResponse.json({ ok: true, output: await updateSkill({ workspaceId: session.workspaceId, userId: session.userId }, skillId, body.skill) });
  } catch (error) {
    const failure = authErrorResponse(error, "Could not update skill.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const session = await requireSession(request);
    const { skillId } = await params;
    await deleteSkill({ workspaceId: session.workspaceId, userId: session.userId }, skillId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = authErrorResponse(error, "Could not delete skill.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
