import "server-only";

import { DEFAULT_QWEN_OMNI_TTS_MODEL, DEFAULT_QWEN_VOICE_MODEL, qwenTtsLanguageTypes, qwenVoiceLanguageCodes, qwenVoiceProviders, type QwenTtsLanguageType, type QwenVoiceLanguageCode, type QwenVoiceProvider } from "@/shared/api/qwenContracts";
import { QwenCloudError } from "./errors";

export const QWEN_VOICE_ENROLLMENT_MODEL = "qwen-voice-enrollment";
export const MAX_QWEN_AUDIO_DATA_URL_BYTES = 10 * 1024 * 1024;
export const MAX_QWEN_TTS_CHARS = 600;
export const allowedQwenTargetModels = [DEFAULT_QWEN_VOICE_MODEL] as const;
export const allowedQwenTtsModels = [DEFAULT_QWEN_VOICE_MODEL, DEFAULT_QWEN_OMNI_TTS_MODEL] as const;

const mimeMap: Record<string, "audio/wav" | "audio/mpeg" | "audio/mp4"> = {
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mp4": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "video/mp4": "audio/mp4",
};

export const normalizeQwenAudioMime = (mimeType: string) => {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  if (normalized && normalized in mimeMap) return mimeMap[normalized];
  return undefined;
};

export const assertPreferredName = (preferredName: string) => {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(preferredName)) {
    throw new QwenCloudError("Voice preferred name must use only letters, digits, or underscore, up to 16 characters.", {
      code: "INVALID_PREFERRED_NAME",
      status: 400,
    });
  }
};

export const normalizeTargetModel = (targetModel: unknown) => {
  const model = typeof targetModel === "string" && targetModel.trim() ? targetModel.trim() : DEFAULT_QWEN_VOICE_MODEL;
  if (!allowedQwenTargetModels.includes(model as typeof DEFAULT_QWEN_VOICE_MODEL)) {
    throw new QwenCloudError(`Unsupported Qwen voice model: ${model}.`, { code: "QWEN_MODEL_MISMATCH", status: 400 });
  }
  return model;
};

export const normalizeTtsTargetModel = (targetModel: unknown) => {
  const model = typeof targetModel === "string" && targetModel.trim() ? targetModel.trim() : DEFAULT_QWEN_VOICE_MODEL;
  const envOmniModel = process.env.QWEN_OMNI_TTS_MODEL?.trim();
  if (allowedQwenTtsModels.includes(model as typeof allowedQwenTtsModels[number]) || (envOmniModel && model === envOmniModel) || model.startsWith("qwen3-tts-vc")) {
    return model;
  }
  throw new QwenCloudError(`Unsupported Qwen TTS model: ${model}.`, { code: "QWEN_MODEL_MISMATCH", status: 400 });
};

export const normalizeVoiceProvider = (value: unknown): QwenVoiceProvider | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim();
  return qwenVoiceProviders.includes(normalized as QwenVoiceProvider) ? normalized as QwenVoiceProvider : undefined;
};

export const normalizeVoiceLanguageCode = (value: unknown): QwenVoiceLanguageCode | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim();
  if (!qwenVoiceLanguageCodes.includes(normalized as QwenVoiceLanguageCode)) {
    throw new QwenCloudError("Unsupported voice clone language.", { code: "INVALID_LANGUAGE", status: 400 });
  }
  return normalized as QwenVoiceLanguageCode;
};

export const normalizeTtsLanguageType = (value: unknown): QwenTtsLanguageType => {
  const normalized = typeof value === "string" && value.trim() ? value.trim() : "Auto";
  if (!qwenTtsLanguageTypes.includes(normalized as QwenTtsLanguageType)) {
    throw new QwenCloudError("Unsupported TTS language type.", { code: "INVALID_LANGUAGE_TYPE", status: 400 });
  }
  return normalized as QwenTtsLanguageType;
};

export const assertDataUrlSize = (dataUrl: string) => {
  if (Buffer.byteLength(dataUrl, "utf8") > MAX_QWEN_AUDIO_DATA_URL_BYTES) {
    throw new QwenCloudError("Reference audio is too large after Base64 encoding. Keep the Data URL under 10MB.", {
      code: "AUDIO_TOO_LARGE",
      status: 413,
    });
  }
};

export const assertTtsText = (value: string) => {
  const length = Array.from(value.trim()).length;
  if (!length) throw new QwenCloudError("TTS text is required.", { code: "TEXT_REQUIRED", status: 400 });
  if (length > MAX_QWEN_TTS_CHARS) {
    throw new QwenCloudError(`TTS text is too long. Please keep it under ${MAX_QWEN_TTS_CHARS} characters.`, {
      code: "TEXT_TOO_LONG",
      status: 400,
    });
  }
};
