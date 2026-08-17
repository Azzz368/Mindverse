import { NextResponse } from "next/server";
import { createAssetFromFile, createAssetFromUrl } from "@/server/ai/tokenstar/tokenstarAsset";
import { normalizeAIError } from "@/server/ai/errors";
import { requireSession } from "@/server/auth/auth";

const valid = (value: unknown): value is "Image" | "Video" | "Audio" => ["Image", "Video", "Audio"].includes(String(value));

export async function POST(request: Request) {
  try {
    await requireSession(request);
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const groupId = form.get("groupId");
      const name = form.get("name");
      const assetType = form.get("assetType");
      const file = form.get("file");
      if (typeof groupId !== "string" || typeof name !== "string" || !valid(assetType) || !(file instanceof Blob)) {
        return NextResponse.json({ ok: false, error: { message: "groupId, name, valid assetType, and file are required.", status: 400 } }, { status: 400 });
      }
      return NextResponse.json({ ok: true, output: await createAssetFromFile({ groupId, name, assetType, file }) });
    }
    const body = await request.json() as { groupId?: unknown; name?: unknown; assetType?: unknown; url?: unknown };
    if (typeof body.groupId !== "string" || typeof body.name !== "string" || typeof body.url !== "string" || !valid(body.assetType)) {
      return NextResponse.json({ ok: false, error: { message: "groupId, name, url, and valid assetType are required.", status: 400 } }, { status: 400 });
    }
    return NextResponse.json({ ok: true, output: await createAssetFromUrl({ groupId: body.groupId, name: body.name, assetType: body.assetType, url: body.url }) });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status });
  }
}
