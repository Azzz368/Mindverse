import { NextResponse } from "next/server";
import { deleteClonedVoice, listClonedVoices } from "@/server/qwen/voiceCloning";
import { qwenErrorPayload } from "@/server/qwen/errors";

const numberParam = (url: URL, key: string, fallback: number) => {
  const value = Number(url.searchParams.get(key));
  return Number.isFinite(value) ? value : fallback;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pageIndex = Math.max(0, Math.floor(numberParam(url, "pageIndex", 0)));
    const pageSize = Math.max(1, Math.min(100, Math.floor(numberParam(url, "pageSize", 50))));
    const data = await listClonedVoices(pageIndex, pageSize);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const normalized = qwenErrorPayload(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { voice?: unknown };
    const voice = typeof body.voice === "string" ? body.voice.trim() : "";
    const data = await deleteClonedVoice(voice);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const normalized = qwenErrorPayload(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
