export type VideoModelPresetId =
  | "seedance-2.0"
  | "seedance-2.0-assets"
  | "seedance-asset-fast"
  | "gen-4.5"
  | "kling-v2.6"
  | "kling-v3-tokenstar"
  | "kling-v3-omni-tokenstar"
  | "kling-v3-text-tokenstar"
  | "sora-2";

export type VideoModelPatch = {
  videoModelPreset: VideoModelPresetId;
  videoProvider: "302ai" | "302-sora2" | "tokenstar" | "kling";
  model: string;
  videoInputMode?: "text-to-video" | "image-to-video";
  tokenstarMode?: "text-to-video" | "asset-video" | "kling-image" | "kling-text" | "kling-omni";
  klingMode?: "text-to-video" | "image-to-video" | "reference-image" | "omni";
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
};

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";
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
};

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
    inputPorts: [textPort, imagePort],
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
  "sora-2": {
    id: "sora-2",
    label: "Sora 2",
    desc: "302.ai image-to-video",
    patch: { videoModelPreset: "sora-2", videoProvider: "302-sora2", model: "sora-2", videoInputMode: "image-to-video", duration: 8, resolution: "720p" },
    inputPorts: [textPort, imagePort],
    aspectRatios: ["16:9", "9:16"],
    aspectRatioControl: "source",
  },
};

export const videoModelOptions = Object.values(videoModelPresets);

export const videoModelPatch = (id: VideoModelPresetId): VideoModelPatch => ({ ...videoModelPresets[id].patch });

export const videoAspectRatiosForPreset = (id: VideoModelPresetId) => [...videoModelPresets[id].aspectRatios];

export const videoAspectRatioControlForPreset = (id: VideoModelPresetId) => videoModelPresets[id].aspectRatioControl;

export const videoAspectRatioForPreset = (id: VideoModelPresetId, value: unknown): VideoAspectRatio => {
  const supported = videoModelPresets[id].aspectRatios;
  return supported.includes(value as VideoAspectRatio) ? value as VideoAspectRatio : supported[0];
};

export const videoModelSelectionPatch = (id: VideoModelPresetId, currentAspectRatio?: string): VideoModelPatch & { aspectRatio: VideoAspectRatio } => ({
  ...videoModelPatch(id),
  aspectRatio: videoAspectRatioForPreset(id, currentAspectRatio),
});

export const videoInputPortsForPreset = (id: VideoModelPresetId) => videoModelPresets[id].inputPorts;

export const videoInputKindForNodeType = (nodeType: string): VideoInputPortKind | undefined => {
  if (nodeType === "image" || nodeType === "reference") return "image";
  if (nodeType === "video" || nodeType === "videoEdit") return "video";
  if (nodeType === "audio" || nodeType === "voiceTTS") return "audio";
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
  if (data.videoProvider === "302ai" && data.model === "gen-4.5") return "gen-4.5";
  if (data.videoProvider === "kling") return "kling-v2.6";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "asset-video" && ["seedance-asset-fast", "seedance-2.0-asset-fast"].includes(data.model || "")) return "seedance-asset-fast";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "asset-video") return "seedance-2.0-assets";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "kling-omni") return "kling-v3-omni-tokenstar";
  if (data.videoProvider === "tokenstar" && data.tokenstarMode === "kling-text") return "kling-v3-text-tokenstar";
  if (data.videoProvider === "tokenstar" && (data.tokenstarMode === "kling-image" || data.klingMode === "image-to-video")) return "kling-v3-tokenstar";
  return "seedance-2.0";
};
