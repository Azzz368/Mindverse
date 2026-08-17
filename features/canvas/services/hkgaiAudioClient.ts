type VoiceUploadResponse = {
  ok?: boolean;
  data?: { voice_id?: string; voice?: string; language?: string; has_ref_text?: boolean; stored_locally?: boolean };
  error?: { message?: string };
};

export async function createHKGAIVoice(input: { audio: File; refText?: string; language?: string; consentConfirmed: boolean }) {
  const form = new FormData();
  form.append("audio", input.audio);
  form.append("refText", input.refText || "");
  form.append("language", input.language || "auto");
  form.append("consentConfirmed", input.consentConfirmed ? "true" : "false");
  const response = await fetch("/api/hkgai/tts/voices", { method: "POST", body: form });
  const payload = await response.json().catch(() => ({})) as VoiceUploadResponse;
  if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message || "HKGAI voice upload failed.");
  const voiceId = payload.data.voice_id || payload.data.voice;
  if (!voiceId) throw new Error("HKGAI voice upload did not return a voice_id.");
  return { ...payload.data, voiceId };
}
