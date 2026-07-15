export const DEFAULT_QWEN_VOICE_MODEL = "qwen3-tts-vc-2026-01-22" as const;
export const DEFAULT_QWEN_OMNI_TTS_MODEL = "qwen3.5-omni-plus" as const;
export const DEFAULT_QWEN_VOICE_PROVIDER = "qwen_tts" as const;

export const qwenVoiceProviders = ["qwen_tts", "dashscope", "omni", "qwencloud"] as const;
export type QwenVoiceProvider = (typeof qwenVoiceProviders)[number];

export const qwenVoiceLanguageCodes = ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"] as const;
export type QwenVoiceLanguageCode = (typeof qwenVoiceLanguageCodes)[number];

export const qwenTtsLanguageTypes = ["Auto", "Chinese", "English", "German", "Italian", "Portuguese", "Spanish", "Japanese", "Korean", "French", "Russian"] as const;
export type QwenTtsLanguageType = (typeof qwenTtsLanguageTypes)[number];

export type CreateVoiceResult = {
  voice: string;
  targetModel: string;
  voiceProvider?: QwenVoiceProvider;
  fallbackMode: boolean;
  fallbackReason?: string;
  requestId?: string;
};

export type ClonedVoice = {
  voice: string;
  targetModel: string;
  voiceProvider?: QwenVoiceProvider;
  language?: string;
  createdAt?: string;
  modifiedAt?: string;
};

export type SynthesizeVoiceInput = {
  text: string;
  voice: string;
  targetModel: string;
  voiceProvider?: QwenVoiceProvider;
  languageType: QwenTtsLanguageType;
};

export type SynthesizeVoiceResult = {
  audioUrl: string;
  audioId?: string;
  expiresAt?: number;
  requestId?: string;
  characters?: number;
  model?: string;
  voiceProvider?: QwenVoiceProvider;
  transcript?: string;
};

export type QwenCreateVoiceResponse = { ok: true; data: CreateVoiceResult };
export type QwenListVoicesResponse = { ok: true; data: { voices: ClonedVoice[]; requestId?: string } };
export type QwenDeleteVoiceResponse = { ok: true; data: { voice: string; requestId?: string } };
export type QwenTtsResponse = { ok: true; data: SynthesizeVoiceResult };
