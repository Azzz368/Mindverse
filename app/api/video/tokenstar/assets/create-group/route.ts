import { NextResponse } from "next/server";
import { createAssetGroup } from "@/server/ai/tokenstar/tokenstarAsset";
import { normalizeAIError } from "@/server/ai/errors";
import { requireSession } from "@/server/auth/auth";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    const body = await request.json() as { name?: unknown };
    if (typeof body.name !== "string" || !body.name) return NextResponse.json({ ok: false, error: { message: "name is required.", status: 400 } }, { status: 400 });
    return NextResponse.json({ ok: true, output: await createAssetGroup(body.name) });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status });
  }
}
