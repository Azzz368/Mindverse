import { NextResponse } from "next/server";
import { deleteClonedVoice, listClonedVoices } from "@/server/qwen/voiceCloning";
import { qwenErrorPayload } from "@/server/qwen/errors";
import { requireSession } from "@/server/auth/auth";
import { queryPostgres } from "@/server/db/postgres";

const numberParam = (url: URL, key: string, fallback: number) => {
  const value = Number(url.searchParams.get(key));
  return Number.isFinite(value) ? value : fallback;
};

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    const pageIndex = Math.max(0, Math.floor(numberParam(url, "pageIndex", 0)));
    const pageSize = Math.max(1, Math.min(100, Math.floor(numberParam(url, "pageSize", 50))));
    const data = await listClonedVoices(pageIndex, pageSize);
    const owned = await queryPostgres<{ voice_id: string }>(
      `SELECT voice_id FROM mindverse_voice_assets WHERE workspace_id = $1 AND provider = 'qwen' AND deleted_at IS NULL`,
      [session.workspaceId],
    );
    const ownedIds = new Set(owned.rows.map((row) => row.voice_id));
    return NextResponse.json({ ok: true, data: { ...data, voices: data.voices.filter((voice) => ownedIds.has(voice.voice)) } });
  } catch (error) {
    const normalized = qwenErrorPayload(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json().catch(() => ({})) as { voice?: unknown };
    const voice = typeof body.voice === "string" ? body.voice.trim() : "";
    const owned = await queryPostgres(
      `SELECT 1 FROM mindverse_voice_assets WHERE workspace_id = $1 AND provider = 'qwen' AND voice_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [session.workspaceId, voice],
    );
    if (!owned.rowCount) return NextResponse.json({ ok: false, error: { message: "Voice not found.", status: 404 } }, { status: 404 });
    const data = await deleteClonedVoice(voice);
    await queryPostgres(
      `UPDATE mindverse_voice_assets SET deleted_at = now(), updated_at = now() WHERE workspace_id = $1 AND provider = 'qwen' AND voice_id = $2`,
      [session.workspaceId, voice],
    );
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const normalized = qwenErrorPayload(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
