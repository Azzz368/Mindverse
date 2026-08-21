import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/auth";
import { normalizeAIError } from "@/server/ai/errors";
import { getTalkingDataAsset } from "@/server/ai/talkingDataVideoProvider";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") return NextResponse.json({ ok: false, error: { message: "An asset id is required.", status: 400 } }, { status: 400 });
    return NextResponse.json({ ok: true, asset: await getTalkingDataAsset(body.id) });
  } catch (error) { const normalized = normalizeAIError(error); return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status }); }
}
