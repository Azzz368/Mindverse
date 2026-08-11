import { NextResponse } from "next/server";
import { normalizeAIError } from "@/server/ai/errors";
import { uploadHKGAIVoice, type HKGAITTSLanguage } from "@/server/ai/hkgaiAudioProvider";

const languages = new Set<HKGAITTSLanguage>(["auto", "mandarin", "cantonese", "english"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    if (form.get("consentConfirmed") !== "true") {
      return NextResponse.json({ ok: false, error: { message: "必须确认已获得声音所有者授权。", code: "CONSENT_REQUIRED", status: 400 } }, { status: 400 });
    }
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ ok: false, error: { message: "请选择参考音频。", code: "AUDIO_REQUIRED", status: 400 } }, { status: 400 });
    }
    const rawLanguage = String(form.get("language") || "auto").toLowerCase() as HKGAITTSLanguage;
    const result = await uploadHKGAIVoice({
      audio,
      fileName: audio instanceof File ? audio.name : "reference.wav",
      refText: String(form.get("refText") || ""),
      language: languages.has(rawLanguage) ? rawLanguage : "auto",
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: normalized }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
