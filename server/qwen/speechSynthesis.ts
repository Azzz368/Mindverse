import "server-only";

import { Buffer } from "node:buffer";
import type { QwenVoiceProvider, SynthesizeVoiceInput, SynthesizeVoiceResult } from "@/shared/api/qwenContracts";
import { DEFAULT_QWEN_OMNI_TTS_MODEL, DEFAULT_QWEN_VOICE_MODEL, DEFAULT_QWEN_VOICE_PROVIDER } from "@/shared/api/qwenContracts";
import { qwenCompatibleStreamChat, qwenFetch } from "./client";
import { QwenCloudError } from "./errors";
import { assertTtsText, normalizeTtsTargetModel, normalizeVoiceProvider } from "./validation";

const DIRECT_TTS_ENDPOINT = "/services/aigc/multimodal-generation/generation";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const array = (value: unknown) => Array.isArray(value) ? value : [];

const qwenOmniTtsModel = () => process.env.QWEN_OMNI_TTS_MODEL?.trim() || DEFAULT_QWEN_OMNI_TTS_MODEL;
const qwenOmniAudioFormat = () => {
  const value = process.env.QWEN_OMNI_TTS_AUDIO_FORMAT?.trim().toLowerCase();
  return value === "mp3" || value === "wav" || value === "opus" || value === "flac" ? value : "wav";
};
const mimeForFormat = (format: string) =>
  format === "mp3" ? "audio/mpeg" : format === "opus" ? "audio/ogg" : format === "flac" ? "audio/flac" : "audio/wav";

const isDirectVoiceCloneModel = (model: string) => model.startsWith("qwen3-tts-vc");
const isCompatibleOmniModel = (model: string) => model === qwenOmniTtsModel() || model.startsWith("qwen3.5-omni");
const dataUrlFromAudioData = (data: string, format = "mp3") =>
  data.startsWith("data:") ? data : `data:${mimeForFormat(format)};base64,${data}`;

const audioBase64From = (delta: Record<string, unknown>) => {
  const audio = record(delta.audio);
  return text(audio.data) || text(audio.audio) || text(audio.b64_json) || text(delta.audio);
};

const normalizeStreamedTtsResult = (chunks: unknown[], requestId: string | undefined, model: string, format: string, inputText: string): SynthesizeVoiceResult => {
  const audioBuffers: Buffer[] = [];
  const transcriptParts: string[] = [];
  let characters: number | undefined;
  let audioId: string | undefined;
  let resolvedRequestId = requestId;

  chunks.forEach((chunk) => {
    const item = record(chunk);
    resolvedRequestId ||= text(item.request_id) || text(item.id);
    const usage = record(item.usage);
    characters ??= number(usage.characters) ?? number(usage.input_characters) ?? number(usage.completion_tokens);
    array(item.choices).forEach((choice) => {
      const delta = record(record(choice).delta);
      const audio = record(delta.audio);
      audioId ||= text(audio.id);
      const base64 = audioBase64From(delta);
      if (base64) audioBuffers.push(Buffer.from(base64, "base64"));
      const transcript = text(audio.transcript) || text(delta.content);
      if (transcript) transcriptParts.push(transcript);
    });
  });

  if (!audioBuffers.length) {
    throw new QwenCloudError("QwenCloud compatible stream did not return audio data.", { code: "QWEN_BAD_RESPONSE", status: 502, requestId: resolvedRequestId });
  }

  const audioBase64 = Buffer.concat(audioBuffers).toString("base64");
  return {
    audioUrl: `data:${mimeForFormat(format)};base64,${audioBase64}`,
    audioId: audioId || resolvedRequestId,
    requestId: resolvedRequestId,
    characters: characters ?? Array.from(inputText).length,
    model,
    voiceProvider: "omni",
    transcript: transcriptParts.join("").trim() || undefined,
  };
};

const normalizeDirectTtsResult = (payload: unknown, requestId: string | undefined, model: string, voiceProvider: QwenVoiceProvider, inputText: string): SynthesizeVoiceResult => {
  const data = record(payload);
  const output = record(data.output || data.data || payload);
  const audio = record(output.audio);
  const audioUrl = text(audio.url) || text(audio.audio_url) || text(output.audio_url) || (text(audio.data) ? dataUrlFromAudioData(text(audio.data)) : "");
  const resolvedRequestId = requestId || text(data.request_id) || text(data.requestId) || text(record(data.header).request_id);
  if (!audioUrl) {
    throw new QwenCloudError("QwenCloud TTS did not return an audio URL.", { code: "QWEN_BAD_RESPONSE", status: 502, requestId: resolvedRequestId });
  }
  const usage = record(data.usage || output.usage);
  return {
    audioUrl,
    audioId: text(audio.id) || text(audio.audio_id) || text(output.audio_id) || resolvedRequestId,
    expiresAt: number(audio.expires_at) ?? number(audio.expiresAt) ?? number(output.expires_at) ?? number(output.expiresAt),
    requestId: resolvedRequestId,
    characters: number(usage.characters) ?? number(usage.input_characters) ?? number(usage.count) ?? Array.from(inputText).length,
    model,
    voiceProvider,
  };
};

export async function synthesizeWithClonedVoice(input: SynthesizeVoiceInput): Promise<SynthesizeVoiceResult> {
  const textValue = input.text.trim();
  const voice = input.voice.trim();
  assertTtsText(textValue);
  if (!voice) throw new QwenCloudError("A cloned voice id is required.", { code: "VOICE_REQUIRED", status: 400 });
  const model = normalizeTtsTargetModel(input.targetModel || DEFAULT_QWEN_VOICE_MODEL);

  if (isDirectVoiceCloneModel(model)) {
    const voiceProvider = normalizeVoiceProvider(input.voiceProvider) || DEFAULT_QWEN_VOICE_PROVIDER;
    const { data, requestId } = await qwenFetch<unknown>(DIRECT_TTS_ENDPOINT, {
      model,
      input: {
        text: textValue,
        voice,
        language_type: input.languageType || "Auto",
      },
    }, 120_000);
    return normalizeDirectTtsResult(data, requestId, model, voiceProvider, textValue);
  }

  if (!isCompatibleOmniModel(model)) {
    throw new QwenCloudError(`Unsupported Qwen TTS model: ${model}.`, { code: "QWEN_MODEL_MISMATCH", status: 400 });
  }

  const format = qwenOmniAudioFormat();

  const { chunks, requestId } = await qwenCompatibleStreamChat({
    model,
    messages: [{ role: "user", content: textValue }],
    modalities: ["text", "audio"],
    audio: { voice, format },
    stream: true,
    stream_options: { include_usage: true },
  }, 120_000);
  return normalizeStreamedTtsResult(chunks, requestId, model, format, textValue);
}
