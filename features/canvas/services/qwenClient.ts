import { getJson, postForm, postJson } from "@/shared/api/client";
import type {
  ClonedVoice,
  CreateVoiceResult,
  QwenCreateVoiceResponse,
  QwenDeleteVoiceResponse,
  QwenListVoicesResponse,
  QwenTtsResponse,
  SynthesizeVoiceInput,
  SynthesizeVoiceResult,
} from "@/shared/api/qwenContracts";

async function parseQwenPayload<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text().catch(() => "");
  let payload = {} as { ok?: boolean; error?: { message?: unknown } } & T;
  try {
    payload = raw ? JSON.parse(raw) as typeof payload : payload;
  } catch {
    if (!response.ok) throw new Error(`${fallbackMessage} (${response.status})`);
  }
  if (!response.ok || !payload.ok) {
    const message = typeof payload.error?.message === "string" && payload.error.message ? payload.error.message : `${fallbackMessage} (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export async function createQwenVoice(input: {
  audio: File;
  preferredName: string;
  targetModel: string;
  text?: string;
  language?: string;
  consentConfirmed: boolean;
}): Promise<CreateVoiceResult> {
  const form = new FormData();
  form.append("audio", input.audio);
  form.append("preferredName", input.preferredName);
  form.append("targetModel", input.targetModel);
  form.append("consentConfirmed", input.consentConfirmed ? "true" : "false");
  if (input.text) form.append("text", input.text);
  if (input.language) form.append("language", input.language);
  const payload = await postForm<QwenCreateVoiceResponse>("/api/qwen/voices/create", form, "Voice clone failed.");
  return payload.data;
}

export async function listQwenVoices(pageIndex = 0, pageSize = 50): Promise<ClonedVoice[]> {
  const payload = await getJson<QwenListVoicesResponse>(`/api/qwen/voices?pageIndex=${pageIndex}&pageSize=${pageSize}`, "Voice list failed.");
  return payload.data.voices;
}

export async function deleteQwenVoice(voice: string): Promise<string> {
  const response = await fetch("/api/qwen/voices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice }),
  });
  const payload = await parseQwenPayload<QwenDeleteVoiceResponse>(response, "Voice delete failed.");
  return payload.data.voice;
}

export async function synthesizeQwenVoice(input: SynthesizeVoiceInput): Promise<SynthesizeVoiceResult> {
  const payload = await postJson<QwenTtsResponse>("/api/qwen/tts", input, "Cloned voice TTS failed.");
  return payload.data;
}
