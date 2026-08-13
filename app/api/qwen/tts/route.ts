import { NextResponse } from "next/server";
import { DEFAULT_QWEN_VOICE_MODEL, type SynthesizeVoiceInput } from "@/shared/api/qwenContracts";
import { synthesizeWithClonedVoice } from "@/server/qwen/speechSynthesis";
import { qwenErrorPayload } from "@/server/qwen/errors";
import { normalizeTtsLanguageType, normalizeTtsTargetModel, normalizeVoiceProvider } from "@/server/qwen/validation";
import { requireSession } from "@/server/auth/auth";
import { queryPostgres } from "@/server/db/postgres";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const input: SynthesizeVoiceInput = {
      text: text(body.text),
      voice: text(body.voice),
      targetModel: normalizeTtsTargetModel(text(body.targetModel) || DEFAULT_QWEN_VOICE_MODEL),
      voiceProvider: normalizeVoiceProvider(body.voiceProvider),
      languageType: normalizeTtsLanguageType(body.languageType),
    };
    const owned = await queryPostgres(
      `SELECT 1 FROM mindverse_voice_assets WHERE workspace_id = $1 AND provider = 'qwen' AND voice_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [session.workspaceId, input.voice],
    );
    if (!owned.rowCount) return NextResponse.json({ ok: false, error: { message: "Voice not found.", status: 404 } }, { status: 404 });
    const data = await synthesizeWithClonedVoice(input);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const normalized = qwenErrorPayload(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
