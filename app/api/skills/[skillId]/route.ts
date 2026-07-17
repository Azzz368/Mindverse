import { NextResponse } from "next/server";
import { deleteSkill, getSkill, updateSkill } from "@/server/storage/skillStorage";

type Params = { params: Promise<{ skillId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { skillId } = await params;
    const accessCode = new URL(request.url).searchParams.get("accessCode");
    const skill = await getSkill(accessCode, skillId);
    if (!skill) return NextResponse.json({ ok: false, error: { message: "Skill not found.", status: 404 } }, { status: 404 });
    return NextResponse.json({ ok: true, output: skill });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { message: error instanceof Error ? error.message : "Could not load skill.", status: 400 } },
      { status: 400 },
    );
  }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    const { skillId } = await params;
    const body = await request.json() as { accessCode?: unknown; skill?: unknown };
    return NextResponse.json({ ok: true, output: await updateSkill(body.accessCode, skillId, body.skill) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { message: error instanceof Error ? error.message : "Could not update skill.", status: 400 } },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { skillId } = await params;
    const accessCode = new URL(request.url).searchParams.get("accessCode");
    await deleteSkill(accessCode, skillId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { message: error instanceof Error ? error.message : "Could not delete skill.", status: 400 } },
      { status: 400 },
    );
  }
}
