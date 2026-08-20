import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/auth";
import { normalizeAIError } from "@/server/ai/errors";
import { createTalkingDataAsset } from "@/server/ai/talkingDataVideoProvider";

export async function POST(request: Request) {
  try {
    await requireSession(request);
    const body = await request.json() as { url?: unknown; name?: unknown; assetType?: unknown };
    if (typeof body.url !== "string" || !["Image", "Video", "Audio"].includes(String(body.assetType))) return NextResponse.json({ ok: false, error: { message: "A public URL and valid asset type are required.", status: 400 } }, { status: 400 });
    return NextResponse.json({ ok: true, asset: await createTalkingDataAsset({ url: body.url, name: typeof body.name === "string" ? body.name : undefined, assetType: body.assetType as "Image" | "Video" | "Audio" }) });
  } catch (error) { const normalized = normalizeAIError(error); return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status }); }
}
