import "server-only";

import { DEFAULT_QWEN_VOICE_MODEL, DEFAULT_QWEN_VOICE_PROVIDER, type ClonedVoice, type CreateVoiceResult, type QwenVoiceProvider } from "@/shared/api/qwenContracts";
import { qwenFetch } from "./client";
import { QwenCloudError } from "./errors";
import {
  QWEN_VOICE_ENROLLMENT_MODEL,
  assertDataUrlSize,
  assertPreferredName,
  normalizeTargetModel,
  normalizeVoiceLanguageCode,
} from "./validation";

const VOICE_ENDPOINT = "/services/audio/tts/customization";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const bool = (value: unknown) => typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined;
const voiceProviderFrom = (value: unknown): QwenVoiceProvider | undefined => {
  const normalized = text(value);
  return normalized === "dashscope" || normalized === "omni" || normalized === "qwencloud" || normalized === "qwen_tts" ? normalized : undefined;
};
const shouldRetryWithoutTranscript = (error: unknown) =>
  error instanceof QwenCloudError && /ASR text check failed|wer\s*:/i.test(error.message);

const outputFrom = (payload: unknown) => {
  const data = record(payload);
  return record(data.output || data.data || payload);
};

const normalizeCreateVoice = (payload: unknown, requestId?: string): CreateVoiceResult => {
  const output = outputFrom(payload);
  const voice = text(output.voice) || text(output.voice_id) || text(output.voiceId);
  const targetModel = text(output.target_model) || text(output.targetModel);
  if (!voice) {
    throw new QwenCloudError("QwenCloud did not return a cloned voice id.", { code: "QWEN_BAD_RESPONSE", status: 502, requestId });
  }
  return {
    voice,
    targetModel: normalizeTargetModel(targetModel),
    voiceProvider: voiceProviderFrom(output.provider) || DEFAULT_QWEN_VOICE_PROVIDER,
    fallbackMode: bool(output.fallback_mode ?? output.fallbackMode) ?? false,
    fallbackReason: text(output.fallback_reason) || text(output.fallbackReason) || undefined,
    requestId: requestId || text(record(payload).request_id) || undefined,
  };
};

const rawVoicesFrom = (payload: unknown) => {
  const output = outputFrom(payload);
  const candidates = [output.voices, output.voice_list, output.voiceList, output.data, output.items];
  return candidates.find(Array.isArray) as unknown[] | undefined;
};

const normalizeVoice = (value: unknown): ClonedVoice | undefined => {
  const item = record(value);
  const voice = text(item.voice) || text(item.voice_id) || text(item.voiceId);
  if (!voice) return undefined;
  return {
    voice,
    targetModel: text(item.target_model) || text(item.targetModel) || DEFAULT_QWEN_VOICE_MODEL,
    voiceProvider: voiceProviderFrom(item.provider) || DEFAULT_QWEN_VOICE_PROVIDER,
    language: text(item.language) || undefined,
    createdAt: text(item.created_at) || text(item.createdAt) || undefined,
    modifiedAt: text(item.modified_at) || text(item.modifiedAt) || undefined,
  };
};

export async function createClonedVoice(input: {
  preferredName: string;
  audioDataUrl: string;
  targetModel?: string;
  text?: string;
  language?: string;
}): Promise<CreateVoiceResult> {
  const preferredName = input.preferredName.trim();
  assertPreferredName(preferredName);
  assertDataUrlSize(input.audioDataUrl);
  const targetModel = normalizeTargetModel(input.targetModel);
  const language = normalizeVoiceLanguageCode(input.language);
  const textValue = input.text?.trim();
  const payloadFor = (includeTranscript: boolean) => ({
    model: QWEN_VOICE_ENROLLMENT_MODEL,
    input: {
      action: "create",
      target_model: targetModel,
      preferred_name: preferredName,
      audio: { data: input.audioDataUrl },
      ...(includeTranscript && textValue ? { text: textValue } : {}),
      ...(includeTranscript && language ? { language } : {}),
    },
  });
  try {
    const { data, requestId } = await qwenFetch<unknown>(VOICE_ENDPOINT, payloadFor(Boolean(textValue)), 20_000);
    return normalizeCreateVoice(data, requestId);
  } catch (error) {
    if (!textValue || !shouldRetryWithoutTranscript(error)) throw error;
    const { data, requestId } = await qwenFetch<unknown>(VOICE_ENDPOINT, payloadFor(false), 20_000);
    return {
      ...normalizeCreateVoice(data, requestId),
      fallbackMode: true,
      fallbackReason: "Transcript did not match the reference audio, so voice cloning was retried without transcript text.",
    };
  }
}

export async function listClonedVoices(pageIndex = 0, pageSize = 50): Promise<{ voices: ClonedVoice[]; requestId?: string }> {
  const { data, requestId } = await qwenFetch<unknown>(VOICE_ENDPOINT, {
    model: QWEN_VOICE_ENROLLMENT_MODEL,
    input: {
      action: "list",
      page_index: Math.max(0, Math.floor(pageIndex)),
      page_size: Math.max(1, Math.min(100, Math.floor(pageSize))),
    },
  }, 10_000);
  return {
    voices: (rawVoicesFrom(data) || []).map(normalizeVoice).filter((item): item is ClonedVoice => Boolean(item)),
    requestId,
  };
}

export async function deleteClonedVoice(voice: string): Promise<{ voice: string; requestId?: string }> {
  const voiceId = voice.trim();
  if (!voiceId) throw new QwenCloudError("Voice id is required.", { code: "VOICE_REQUIRED", status: 400 });
  const { requestId } = await qwenFetch<unknown>(VOICE_ENDPOINT, {
    model: QWEN_VOICE_ENROLLMENT_MODEL,
    input: {
      action: "delete",
      voice: voiceId,
    },
  }, 10_000);
  return { voice: voiceId, requestId };
}
