import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { createClonedVoice } from "@/server/qwen/voiceCloning";
import { qwenErrorPayload } from "@/server/qwen/errors";
import { normalizeQwenAudioMime, normalizeTargetModel } from "@/server/qwen/validation";

const jsonError = (message: string, code: string, status: number) =>
  NextResponse.json({ ok: false, error: { message, code, status } }, { status });

const shouldSendTranscript = () => process.env.QWEN_VOICE_CLONE_SEND_TRANSCRIPT === "true";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const consentConfirmed = form.get("consentConfirmed");
    if (consentConfirmed !== "true") {
      return jsonError("Explicit voice owner authorization must be confirmed before cloning.", "CONSENT_REQUIRED", 400);
    }
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return jsonError("Reference audio file is required.", "AUDIO_REQUIRED", 400);
    }
    const mimeType = normalizeQwenAudioMime(file.type);
    if (!mimeType) {
      return jsonError("Unsupported reference audio MIME type. Use WAV, MP3, M4A, or MP4 audio.", "UNSUPPORTED_AUDIO_TYPE", 400);
    }
    const preferredName = String(form.get("preferredName") || "").trim();
    const targetModel = normalizeTargetModel(String(form.get("targetModel") || ""));
    const audioDataUrl = `data:${mimeType};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    const includeTranscript = shouldSendTranscript();
    const result = await createClonedVoice({
      preferredName,
      targetModel,
      audioDataUrl,
      text: includeTranscript ? String(form.get("text") || "").trim() || undefined : undefined,
      language: includeTranscript ? String(form.get("language") || "").trim() || undefined : undefined,
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const normalized = qwenErrorPayload(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
