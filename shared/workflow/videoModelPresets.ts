export type VideoModelPresetId =
  | "seedance-2.0"
  | "seedance-2.0-assets"
  | "seedance-asset-fast"
  | "digital-human-video"
  | "omnihuman-1.5-volcengine"
  | "gen-4.5"
  | "kling-v2.6"
  | "kling-v3-tokenstar"
  | "kling-v3-omni-tokenstar"
  | "kling-v3-text-tokenstar"
  | "minimax-h3-hkgai"
  | "minimax-ref2va-hkgai"
  | "sora-2"
  | "talkingdata-yunzhu80";

export const DEFAULT_VIDEO_MODEL_PRESET_ID: VideoModelPresetId = "seedance-asset-fast";

export type VideoModelPatch = {
  videoModelPreset: VideoModelPresetId;
  videoProvider: "302ai" | "302-sora2" | "tokenstar" | "kling" | "hkgai" | "volcengine" | "talkingdata";
  model: string;
  videoInputMode?: "text-to-video" | "image-to-video";
  tokenstarMode?: "text-to-video" | "asset-video" | "kling-image" | "kling-text" | "kling-omni";
  klingMode?: "text-to-video" | "image-to-video" | "reference-image" | "omni";
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
};

export type VideoAspectRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive";
export type VideoAspectRatioControl = "native" | "source";

export type VideoInputPortKind = "text" | "image" | "video" | "audio";

export type VideoInputPort = {
  id: string;
  label: string;
  kind: VideoInputPortKind;
};

export type VideoModelPreset = {
  id: VideoModelPresetId;
  label: string;
  desc: string;
  patch: VideoModelPatch;
  inputPorts: VideoInputPort[];
  aspectRatios: VideoAspectRatio[];
  aspectRatioControl: VideoAspectRatioControl;
  promptMaxLength?: number;
  durationOptions?: number[];
  referenceLimits?: Partial<Record<Exclude<VideoInputPortKind, "text">, number>>;
};

export const DIGITAL_HUMAN_VIDEO_PROMPT = "让图中人物自然说话，口型与参考音频精准同步；保持人物身份、服装、构图和背景稳定，仅添加自然眨眼、轻微表情与头部动作，镜头固定。";

const textPort: VideoInputPort = { id: "text", label: "Text", kind: "text" };
const imagePort: VideoInputPort = { id: "image", label: "Image", kind: "image" };
const videoPort: VideoInputPort = { id: "video", label: "Video", kind: "video" };
const audioPort: VideoInputPort = { id: "audio", label: "Audio", kind: "audio" };

export const videoModelPresets: Record<VideoModelPresetId, VideoModelPreset> = {
  "seedance-2.0": {
    id: "seedance-2.0",
    label: "Seedance 2.0",
    desc: "TokenStar text-to-video",
    patch: { videoModelPreset: "seedance-2.0", videoProvider: "tokenstar", model: "seedance-2.0-fast", tokenstarMode: "text-to-video", videoInputMode: "text-to-video", duration: 8, resolution: "720p", generateAudio: true },
    inputPorts: [textPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "native",
  },
  "seedance-2.0-assets": {
    id: "seedance-2.0-assets",
    label: "Seedance 2.0 Assets",
    desc: "TokenStar image/video/audio references",
    patch: { videoModelPreset: "seedance-2.0-assets", videoProvider: "tokenstar", model: "seedance-2.0-asset", tokenstarMode: "asset-video", videoInputMode: "image-to-video", duration: 5, resolution: "720p", generateAudio: false },
    inputPorts: [textPort, imagePort, videoPort, audioPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "native",
  },
  "seedance-asset-fast": {
    id: "seedance-asset-fast",
    label: "seedance-asset-fast",
    desc: "TokenStar fast asset-video references",
    patch: { videoModelPreset: "seedance-asset-fast", videoProvider: "tokenstar", model: "seedance-2.0-asset-fast", tokenstarMode: "asset-video", videoInputMode: "image-to-video", duration: 5, resolution: "720p", generateAudio: false },
    inputPorts: [textPort, imagePort, videoPort, audioPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "native",
  },
  "digital-human-video": {
    id: "digital-human-video",
    label: "Digital Human Video",
    desc: "Generate a lip-synced video from a character image and audio",
    patch: { videoModelPreset: "digital-human-video", videoProvider: "tokenstar", model: "seedance-2.0-asset-fast", tokenstarMode: "asset-video", videoInputMode: "image-to-video", duration: 5, resolution: "720p", generateAudio: false },
    inputPorts: [imagePort, audioPort],
    aspectRatios: ["9:16", "16:9", "1:1"],
    aspectRatioControl: "native",
    referenceLimits: { image: 1, audio: 1, video: 0 },
  },
  "omnihuman-1.5-volcengine": {
    id: "omnihuman-1.5-volcengine",
    label: "OmniHuman 1.5",
    desc: "Volcengine Seedance digital human · one image + one audio",
    patch: { videoModelPreset: "omnihuman-1.5-volcengine", videoProvider: "volcengine", model: "jimeng_realman_avatar_picture_omni_v15", videoInputMode: "image-to-video", resolution: "1080p", generateAudio: false },
    inputPorts: [imagePort, audioPort],
    aspectRatios: ["9:16", "16:9", "1:1"],
    aspectRatioControl: "source",
    promptMaxLength: 300,
    referenceLimits: { image: 1, audio: 1, video: 0 },
  },
  "gen-4.5": {
    id: "gen-4.5",
    label: "Gen-4.5",
    desc: "302.ai text-to-video",
    patch: { videoModelPreset: "gen-4.5", videoProvider: "302ai", model: "gen-4.5", videoInputMode: "text-to-video", duration: 10, resolution: "720p" },
    inputPorts: [textPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "native",
  },
  "kling-v2.6": {
    id: "kling-v2.6",
    label: "Kling v2.6",
    desc: "Official Kling image-to-video",
    patch: { videoModelPreset: "kling-v2.6", videoProvider: "kling", model: "kling-v2-6", videoInputMode: "image-to-video", klingMode: "image-to-video", duration: 5, resolution: "720p" },
    inputPorts: [textPort, imagePort, videoPort, audioPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "source",
  },
  "kling-v3-tokenstar": {
    id: "kling-v3-tokenstar",
    label: "Kling v3",
    desc: "TokenStar Kling image-to-video",
    patch: { videoModelPreset: "kling-v3-tokenstar", videoProvider: "tokenstar", model: "kling-v3", videoInputMode: "image-to-video", tokenstarMode: "kling-image", klingMode: "image-to-video", duration: 5, resolution: "720p", generateAudio: true },
    inputPorts: [textPort, imagePort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "source",
  },
  "kling-v3-omni-tokenstar": {
    id: "kling-v3-omni-tokenstar",
    label: "Kling v3 Omni",
    desc: "TokenStar multi-reference Omni video",
    patch: { videoModelPreset: "kling-v3-omni-tokenstar", videoProvider: "tokenstar", model: "kling-v3-omni", videoInputMode: "image-to-video", tokenstarMode: "kling-omni", klingMode: "omni", duration: 5, resolution: "1080p", generateAudio: false },
    inputPorts: [textPort, imagePort, videoPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "native",
  },
  "kling-v3-text-tokenstar": {
    id: "kling-v3-text-tokenstar",
    label: "Kling v3 Text",
    desc: "TokenStar Kling text-to-video",
    patch: { videoModelPreset: "kling-v3-text-tokenstar", videoProvider: "tokenstar", model: "kling-v3", videoInputMode: "text-to-video", tokenstarMode: "kling-text", klingMode: "text-to-video", duration: 5, resolution: "720p", generateAudio: true },
    inputPorts: [textPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "native",
  },
  "minimax-h3-hkgai": {
    id: "minimax-h3-hkgai",
    label: "minimax_h3",
    desc: "HKGAI MiniMax H3 · prompt 7k · up to 2 images",
    patch: { videoModelPreset: "minimax-h3-hkgai", videoProvider: "hkgai", model: "t2_minimax-h3_bf16_7k2p", videoInputMode: "image-to-video", duration: 5 },
    inputPorts: [textPort, imagePort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "native",
    promptMaxLength: 7000,
    referenceLimits: { image: 1, video: 0, audio: 0 },
  },
  "minimax-ref2va-hkgai": {
    id: "minimax-ref2va-hkgai",
    label: "minimax_ref2va",
    desc: "HKGAI MiniMax H3 multimodal reference video",
    patch: { videoModelPreset: "minimax-ref2va-hkgai", videoProvider: "hkgai", model: "t2_minimax-h3_bf16_ref2va", videoInputMode: "image-to-video", duration: 4 },
    inputPorts: [textPort, imagePort, videoPort, audioPort],
    aspectRatios: ["16:9", "9:16", "1:1"],
    aspectRatioControl: "source",
    durationOptions: Array.from({ length: 12 }, (_, index) => index + 4),
    referenceLimits: { image: 1, video: 3, audio: 1 },
  },
  "sora-2": {
    id: "sora-2",
    label: "Sora 2",
    desc: "302.ai image-to-video",
    patch: { videoModelPreset: "sora-2", videoProvider: "302-sora2", model: "sora-2", videoInputMode: "image-to-video", duration: 8, resolution: "720p" },
    inputPorts: [textPort, imagePort],
    aspectRatios: ["16:9", "9:16"],
    aspectRatioControl: "source",
  },
  "talkingdata-yunzhu80": {
    id: "talkingdata-yunzhu80",
    label: "TalkingData Yunzhu 80 · Private Assets",
    desc: "TalkingData trusted private image/video/audio assets",
    patch: { videoModelPreset: "talkingdata-yunzhu80", videoProvider: "talkingdata", model: "T0101009", videoInputMode: "image-to-video", duration: 5, resolution: "480p", generateAudio: false },
    inputPorts: [textPort, imagePort, videoPort, audioPort],
    aspectRatios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
    aspectRatioControl: "native",
    durationOptions: Array.from({ length: 27 }, (_, index) => index + 4),
    referenceLimits: { image: 2, video: 10, audio: 10 },
  },
};

export const videoModelOptions = [
  videoModelPresets[DEFAULT_VIDEO_MODEL_PRESET_ID],
  ...Object.values(videoModelPresets).filter((preset) => preset.id !== DEFAULT_VIDEO_MODEL_PRESET_ID),
];

export const videoModelPatch = (id: VideoModelPresetId): VideoModelPatch => ({ ...videoModelPresets[id].patch });

export const videoAspectRatiosForPreset = (id: VideoModelPresetId) => [...videoModelPresets[id].aspectRatios];

export const videoAspectRatioControlForPreset = (id: VideoModelPresetId) => videoModelPresets[id].aspectRatioControl;

export const videoAspectRatioForPreset = (id: VideoModelPresetId, value: unknown): VideoAspectRatio => {
  const supported = videoModelPresets[id].aspectRatios;
  return supported.includes(value as VideoAspectRatio) ? value as VideoAspectRatio : supported[0];
};

export const videoModelSelectionPatch = (id: VideoModelPresetId, currentAspectRatio?: string): VideoModelPatch & { aspectRatio: VideoAspectRatio } => ({
  ...videoModelPatch(id),
  aspectRatio: id === "talkingdata-yunzhu80" ? "adaptive" : videoAspectRatioForPreset(id, currentAspectRatio),
});

export const videoInputPortsForPreset = (id: VideoModelPresetId) => videoModelPresets[id].inputPorts;

export const videoReferenceLimitForPreset = (
  id: VideoModelPresetId,
  kind: Exclude<VideoInputPortKind, "text">,
) => videoModelPresets[id].referenceLimits?.[kind];

export const videoPromptMaxLengthForPreset = (id: VideoModelPresetId) => videoModelPresets[id].promptMaxLength;

export const videoDurationOptionsForPreset = (id: VideoModelPresetId) => videoModelPresets[id].durationOptions;

export const videoInputKindForNodeType = (nodeType: string): VideoInputPortKind | undefined => {
  if (nodeType === "image" || nodeType === "reference" || nodeType === "videoFrame") return "image";
  if (nodeType === "video" || nodeType === "videoRegeneration" || nodeType === "videoEdit") return "video";
  if (nodeType === "audio" || nodeType === "musicGeneration" || nodeType === "hkgaiTTS" || nodeType === "voiceTTS") return "audio";
  if (nodeType === "text" || nodeType === "prompt" || nodeType === "script" || nodeType === "storyboard") return "text";
  return undefined;
};

export const videoTargetHandleForNodeType = (
  sourceNodeType: string,
  targetData: {
    videoModelPreset?: string;
    videoProvider?: string;
    model?: string;
    tokenstarMode?: string;
    klingMode?: string;
  },
) => {
  const kind = videoInputKindForNodeType(sourceNodeType);
  if (!kind) return undefined;
  return videoInputPortsForPreset(videoModelPresetIdFromData(targetData)).find((port) => port.kind === kind)?.id;
};

export const videoModelPresetIdFromData = (data: {
  videoModelPreset?: string;
  videoProvider?: string;
  model?: string;
  tokenstarMode?: string;
  klingMode?: string;
}): VideoModelPresetId => {
  if (data.videoModelPreset && data.videoModelPreset in videoModelPresets) return data.videoModelPreset as VideoModelPresetId;
  if (data.videoProvider === "302-sora2") return "sora-2";
  if (data.videoProvider === "talkingdata") return "talkingdata-yunzhu80";
  if (data.videoProvider === "hkgai" && data.model === "t2_minimax-h3_bf16_ref2va") return "minimax-ref2va-hkgai";
  if (data.videoProvider === "hkgai" && data.model === "t2_minimax-h3_bf16_7k2p") return "minimax-h3-hkgai";
  if (data.videoProvider === "volcengine" && data.model === "jimeng_realman_avatar_picture_omni_v15") return "omnihuman-1.5-volcengine";
  if (data.videoProvider === "302ai" && data.model === "gen-4.5") return "gen-4.5";
  if (data.videoProvider === "kling") return "kling-v2.6";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "asset-video" && ["seedance-asset-fast", "seedance-2.0-asset-fast"].includes(data.model || "")) return "seedance-asset-fast";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "asset-video" && data.model === "seedance-2.0-asset") return "seedance-2.0-assets";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "asset-video") return DEFAULT_VIDEO_MODEL_PRESET_ID;
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "kling-omni") return "kling-v3-omni-tokenstar";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "kling-text") return "kling-v3-text-tokenstar";
  if (data.videoProvider === "tokenstar" && (data.tokenstarMode === "kling-image" || data.klingMode === "image-to-video")) return "kling-v3-tokenstar";
  return DEFAULT_VIDEO_MODEL_PRESET_ID;
};
