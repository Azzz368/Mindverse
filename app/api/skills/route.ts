import { NextResponse } from "next/server";
import { createSkill, listSkills } from "@/server/storage/skillStorage";

export async function GET(request: Request) {
  try {
    const accessCode = new URL(request.url).searchParams.get("accessCode");
    return NextResponse.json({ ok: true, output: await listSkills(accessCode) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { message: error instanceof Error ? error.message : "Could not load skills.", status: 401 } },
      { status: 401 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json() as { accessCode?: unknown; skill?: unknown };
    return NextResponse.json({ ok: true, output: await createSkill(body.accessCode, body.skill) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { message: error instanceof Error ? error.message : "Could not create skill.", status: 400 } },
      { status: 400 },
    );
  }
}
