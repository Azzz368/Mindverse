import "server-only";

import { Buffer } from "node:buffer";
import { AIProviderConfigError, AIProviderError, AIProviderHTTPError } from "./errors";
import { archiveMediaBuffer } from "@/server/storage/mediaArchive";

const MUSIC_URL = "https://openspeech.hkgai.net/server_proxy/api/music_gen";
const TTS_BASE_URL = "https://openspeech-ce.hkgai.net/server_proxy/api/zs/v1/audio";
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;

type ArchiveContext = { nodeId?: string; projectId?: string };
export type HKGAITTSLanguage = "auto" | "mandarin" | "cantonese" | "english";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const voiceIdFromUploadResponse = (payload: unknown) => {
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();
  const fieldNames = new Set<string>();
  for (let depth = 0; depth < 4 && queue.length; depth += 1) {
    const levelSize = queue.length;
    for (let index = 0; index < levelSize; index += 1) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      if (typeof current === "string" && /^(?:voice[_-]|[a-f\d]{8}-[a-f\d-]{20,}$)/i.test(current.trim())) return { voiceId: current.trim(), fields: [...fieldNames] };
      if (Array.isArray(current)) {
        queue.push(...current.slice(0, 5));
        continue;
      }
      const record = asRecord(current);
      if (!record) continue;
      Object.keys(record).forEach((key) => fieldNames.add(key));
      for (const key of ["voice_id", "voiceId", "voice", "speaker_id", "speakerId"]) {
        const candidate = record[key];
        if (typeof candidate === "string" && candidate.trim()) return { voiceId: candidate.trim(), fields: [...fieldNames] };
      }
      for (const key of ["data", "result", "output", "detail", "payload", "voice_data"]) {
        if (record[key] !== undefined) queue.push(record[key]);
      }
    }
  }
  return { voiceId: "", fields: [...fieldNames] };
};

const configuredKey = (kind: "music" | "tts") => {
  const value = kind === "music"
    ? process.env.HKGAI_MUSIC_API_KEY || process.env.HKGAI_SPEECH_API_KEY
    : process.env.HKGAI_TTS_API_KEY || process.env.HKGAI_SPEECH_API_KEY;
  if (!value?.trim()) {
    throw new AIProviderConfigError(`HKGAI ${kind === "music" ? "Music" : "TTS"} Bearer credential is missing. Set ${kind === "music" ? "HKGAI_MUSIC_API_KEY" : "HKGAI_TTS_API_KEY"} (or shared HKGAI_SPEECH_API_KEY).`);
  }
  return value.trim().replace(/^Bearer\s+/i, "");
};

const timeoutMs = (kind: "music" | "tts") => Math.max(
  10_000,
  Number(kind === "music" ? process.env.HKGAI_MUSIC_TIMEOUT_MS || 300_000 : process.env.HKGAI_TTS_TIMEOUT_MS || 180_000),
);

const maxBytes = () => Math.max(1024, Number(process.env.HKGAI_AUDIO_MAX_OUTPUT_BYTES || DEFAULT_MAX_BYTES));

const fetchWithTimeout = async (kind: "music" | "tts", url: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`HKGAI ${kind} request timed out.`)), timeoutMs(kind));
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError(error instanceof Error ? error.message : `HKGAI ${kind} request failed.`, "HKGAI_AUDIO_NETWORK_ERROR", 502);
  } finally {
    clearTimeout(timeout);
  }
};

const responseDetail = async (response: Response) => {
  const raw = await response.text().catch(() => "");
  if (!raw) return response.statusText || "Unknown response";
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return String(value.detail || value.message || value.error || raw).slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
};

const assertBinaryResponse = async (response: Response, label: string) => {
  if (!response.ok) {
    const detail = await responseDetail(response);
    throw new AIProviderHTTPError(`${label} request failed (${response.status}): ${detail}`, response.status, detail);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes()) throw new AIProviderError(`${label} output exceeds the configured size limit.`, "HKGAI_AUDIO_TOO_LARGE", 413);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType.includes("json") || contentType.startsWith("text/")) {
    const detail = await responseDetail(response);
    throw new AIProviderError(`${label} returned JSON/text instead of audio: ${detail}`, "HKGAI_AUDIO_INVALID_RESPONSE", 502);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength) throw new AIProviderError(`${label} returned an empty audio file.`, "HKGAI_AUDIO_EMPTY", 502);
  if (buffer.byteLength > maxBytes()) throw new AIProviderError(`${label} output exceeds the configured size limit.`, "HKGAI_AUDIO_TOO_LARGE", 413);
  return { buffer, contentType };
};

const pcmS16leToWav = (pcm: Buffer, sampleRate = 48_000, channels = 2) => {
  const alignedLength = pcm.byteLength - (pcm.byteLength % (channels * 2));
  if (alignedLength <= 0) throw new AIProviderError("HKGAI Music returned invalid PCM data.", "HKGAI_MUSIC_INVALID_PCM", 502);
  const wav = Buffer.allocUnsafe(44 + alignedLength);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + alignedLength, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(alignedLength, 40);
  pcm.copy(wav, 44, 0, alignedLength);
  return wav;
};

const archiveAudio = async (buffer: Buffer, mimeType: string, sourceProvider: string, context: ArchiveContext) => {
  const archived = await archiveMediaBuffer(buffer, "audio", mimeType, { ...context, sourceProvider });
  if (!archived) {
    throw new AIProviderError("Generated audio could not be archived. Check Bunny Storage configuration.", "AUDIO_ARCHIVE_FAILED", 500);
  }
  return archived;
};

export async function generateHKGAIMusic(input: { name: string; tags: string; userPrompt: string } & ArchiveContext) {
  const name = input.name.trim() || "mindverse_track";
  const tags = input.tags.trim();
  const userPrompt = input.userPrompt.trim();
  if (!tags) throw new AIProviderError("Music tags are required.", "HKGAI_MUSIC_TAGS_REQUIRED", 400);
  if (!userPrompt) throw new AIProviderError("Structured music prompt is required.", "HKGAI_MUSIC_PROMPT_REQUIRED", 400);

  const response = await fetchWithTimeout("music", process.env.HKGAI_MUSIC_API_URL || MUSIC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${configuredKey("music")}`, "Content-Type": "application/json", Accept: "audio/*,application/octet-stream" },
    body: JSON.stringify({ items: [{ name, tags, user_prompt: userPrompt }], return_mode: "path" }),
  });
  const { buffer, contentType } = await assertBinaryResponse(response, "HKGAI Music");
  const isWav = buffer.subarray(0, 4).toString("ascii") === "RIFF";
  const audio = isWav ? buffer : pcmS16leToWav(buffer);
  const archived = await archiveAudio(audio, "audio/wav", "hkgai-music", input);
  return { status: "completed", audioUrl: archived.cdnUrl, resultUrl: archived.cdnUrl, name, tags, format: "wav", sampleRate: 48_000, channels: 2, archivedMedia: [archived] };
}

export async function uploadHKGAIVoice(input: { audio: Blob; fileName?: string; refText?: string; language?: HKGAITTSLanguage }) {
  if (!input.audio.size) throw new AIProviderError("Reference audio is empty.", "HKGAI_TTS_AUDIO_REQUIRED", 400);
  if (input.audio.size > 10 * 1024 * 1024) throw new AIProviderError("Reference audio must not exceed 10 MB.", "HKGAI_TTS_AUDIO_TOO_LARGE", 413);
  const form = new FormData();
  form.append("ref_audio", input.audio, input.fileName || "reference.wav");
  if (input.refText?.trim()) form.append("ref_text", input.refText.trim());
  form.append("language", input.language || "auto");
  const response = await fetchWithTimeout("tts", `${(process.env.HKGAI_TTS_BASE_URL || TTS_BASE_URL).replace(/\/$/, "")}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${configuredKey("tts")}`, Accept: "application/json" },
    body: form,
  });
  if (!response.ok) {
    const detail = await responseDetail(response);
    throw new AIProviderHTTPError(`HKGAI TTS voice upload failed (${response.status}): ${detail}`, response.status, detail);
  }
  const result = await response.json() as unknown;
  const { voiceId, fields } = voiceIdFromUploadResponse(result);
  if (!voiceId) {
    const fieldHint = fields.length ? ` Response fields: ${fields.slice(0, 12).join(", ")}.` : "";
    throw new AIProviderError(`HKGAI TTS upload did not return a voice_id.${fieldHint}`, "HKGAI_TTS_VOICE_ID_MISSING", 502);
  }
  const root = asRecord(result) || {};
  const nested = asRecord(root.data) || asRecord(root.result) || asRecord(root.output) || {};
  return { ...root, ...nested, voice_id: voiceId, voice: voiceId };
}

export async function synthesizeHKGAISpeech(input: { text: string; voiceId: string; instructions?: string; xVectorOnly?: boolean } & ArchiveContext) {
  const speechText = input.text.trim();
  const voiceId = input.voiceId.trim();
  if (!speechText) throw new AIProviderError("TTS text is required.", "HKGAI_TTS_TEXT_REQUIRED", 400);
  if (!voiceId) throw new AIProviderError("Select a built-in voice or provide a voice_id.", "HKGAI_TTS_VOICE_REQUIRED", 400);
  const response = await fetchWithTimeout("tts", `${(process.env.HKGAI_TTS_BASE_URL || TTS_BASE_URL).replace(/\/$/, "")}/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${configuredKey("tts")}`, "Content-Type": "application/json", Accept: "audio/wav" },
    body: JSON.stringify({
      // The published HKGAI example uses text/voice_id/type, while the
      // deployed openai_tts_adapter_v2 validates OpenAI's input/voice fields.
      // Send both aliases so either gateway revision can consume the request.
      input: speechText,
      text: speechText,
      voice: voiceId,
      voice_id: voiceId,
      type: "file",
      response_format: "wav",
      ...(input.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
      x_vector_only: input.xVectorOnly !== false,
    }),
  });
  const { buffer, contentType } = await assertBinaryResponse(response, "HKGAI TTS");
  const isWav = buffer.subarray(0, 4).toString("ascii") === "RIFF";
  const archived = await archiveAudio(buffer, isWav ? "audio/wav" : contentType || "audio/wav", "hkgai-tts", input);
  return { status: "completed", audioUrl: archived.cdnUrl, resultUrl: archived.cdnUrl, voice: voiceId, text: speechText, instructions: input.instructions, xVectorOnly: input.xVectorOnly !== false, archivedMedia: [archived] };
}
