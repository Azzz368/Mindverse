import "server-only";

import type { CapabilityAvailability, CapabilityConstraints, CapabilityRecord, MediaRole } from "@/shared/agent/capabilityTypes";
import { videoModelOptions, videoModelPresets, type VideoModelPresetId } from "@/shared/workflow/videoModelPresets";

const configured = (value: string | undefined): CapabilityAvailability => value?.trim() ? "available" : "unconfigured";

const availabilityForVideoPreset = (id: VideoModelPresetId): CapabilityAvailability => {
  const provider = videoModelPresets[id].patch.videoProvider;
  if (provider === "tokenstar") return configured(process.env.TOKENSTAR_API_KEY);
  if (provider === "kling") return configured(process.env.KLING_API_KEY);
  return configured(process.env.AI_302_API_KEY);
};

const roleForPort = (kind: "text" | "image" | "video" | "audio"): MediaRole =>
  kind === "text" ? "prompt" : kind === "image" ? "reference_image" : kind === "video" ? "reference_video" : "reference_audio";

const videoCapabilities = (id: VideoModelPresetId) => {
  const preset = videoModelPresets[id];
  const kinds = new Set(preset.inputPorts.map((port) => port.kind));
  return [
    "video_generation",
    kinds.has("image") ? "image_to_video" : "text_to_video",
    kinds.has("image") && (id.includes("assets") || id.includes("omni") || id.includes("asset-fast")) ? "multi_reference_video" : "",
    kinds.has("audio") ? "audio_reference" : "",
    kinds.has("video") ? "video_reference" : "",
  ].filter(Boolean);
};

const constraintsByPreset: Partial<Record<VideoModelPresetId, CapabilityConstraints>> = {
  "seedance-2.0": { minDuration: 5, maxDuration: 15, resolutions: ["480p", "720p", "1080p"] },
  "seedance-2.0-assets": { minDuration: 5, maxDuration: 15, maxImages: 4, maxVideos: 1, maxAudios: 1, resolutions: ["480p", "720p", "1080p"] },
  "seedance-asset-fast": { minDuration: 5, maxDuration: 15, maxImages: 4, maxVideos: 1, maxAudios: 1, resolutions: ["480p", "720p", "1080p"] },
  "gen-4.5": { minDuration: 5, maxDuration: 15, resolutions: ["480p", "720p", "1080p"] },
  "kling-v2.6": { minDuration: 3, maxDuration: 15, maxImages: 1, resolutions: ["720p", "1080p"] },
  "kling-v3-tokenstar": { minDuration: 3, maxDuration: 15, maxImages: 1, resolutions: ["720p", "1080p"] },
  "kling-v3-omni-tokenstar": { minDuration: 3, maxDuration: 15, maxImages: 7, maxVideos: 1, maxAudios: 0, resolutions: ["720p", "1080p"] },
  "kling-v3-text-tokenstar": { minDuration: 3, maxDuration: 15, maxImages: 0, maxVideos: 0, maxAudios: 0, resolutions: ["720p", "1080p"] },
  "sora-2": { allowedDurations: [4, 8, 12], maxImages: 1, resolutions: ["720p", "1080p"] },
};

const videoRecords = (): CapabilityRecord[] => videoModelOptions.map((preset) => ({
  id: `model:video:${preset.id}`,
  kind: "model",
  name: preset.label,
  description: `${preset.desc}. Executable Mindverse video model preset.`,
  capabilities: videoCapabilities(preset.id),
  aliases: [preset.id, preset.patch.model, preset.patch.videoProvider, preset.patch.tokenstarMode || ""].filter(Boolean) as string[],
  accepts: preset.inputPorts.map((port) => roleForPort(port.kind)),
  produces: ["video"],
  constraints: { ...constraintsByPreset[preset.id], aspectRatios: [...preset.aspectRatios] },
  risk: "costly",
  requiresApproval: true,
  availability: availabilityForVideoPreset(preset.id),
  executorRef: `video:${preset.id}`,
  metadata: { nodeType: "video", nodePatch: preset.patch, aspectRatioControl: preset.aspectRatioControl },
}));

export const modelCapabilityRecords = (): CapabilityRecord[] => [
  ...videoRecords(),
  {
    id: "model:image:tokenstar:gpt-image-2",
    kind: "model",
    name: "GPT Image 2 via TokenStar",
    description: "Generate or revise images with up to four image references.",
    capabilities: ["image_generation", "image_revision", "multi_reference_image"],
    aliases: ["gpt image", "gpt-image-2", "图片生成", "图像编辑"],
    accepts: ["prompt", "reference_image"],
    produces: ["image"],
    constraints: { maxImages: 4, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["1K", "2K", "4K"] },
    risk: "costly",
    requiresApproval: true,
    availability: configured(process.env.TOKENSTAR_API_KEY),
    executorRef: "image:tokenstar:gpt-image-2",
    metadata: { nodeType: "image", nodePatch: { model: "gpt-image-2(tokenstar)", size: "2048x2048" } },
  },
  {
    id: "model:image:tokenstar:nano-banana",
    kind: "model",
    name: "Nano Banana via TokenStar",
    description: "Fast image generation and reference-based image editing.",
    capabilities: ["image_generation", "image_revision", "multi_reference_image"],
    aliases: ["nano banana", "图片生成", "图像编辑"],
    accepts: ["prompt", "reference_image"],
    produces: ["image"],
    constraints: { maxImages: 4, aspectRatios: ["16:9", "9:16", "1:1"] },
    risk: "costly",
    requiresApproval: true,
    availability: configured(process.env.TOKENSTAR_API_KEY),
    executorRef: "image:tokenstar:nano-banana",
    metadata: { nodeType: "image", nodePatch: { model: "nano banana(tokenstar)", size: "1024x1024" } },
  },
  {
    id: "model:text:configured",
    kind: "model",
    name: "Configured text LLM",
    description: "Configured OpenAI-compatible text model for text, script, and storyboard generation.",
    capabilities: ["text_generation", "script_generation", "storyboard_generation"],
    aliases: ["llm", "text", "script", "storyboard", "文本", "剧本", "分镜"],
    accepts: ["prompt", "story_brief", "source_text"],
    produces: ["source_text", "script", "storyboard"],
    risk: "costly",
    requiresApproval: true,
    availability: configured(process.env.AI_302_API_KEY || process.env.HKGAI_MAAS_API_KEY || process.env.HKGAI_API_KEY),
    executorRef: "text:configured",
    metadata: { nodeTypes: ["text", "script", "storyboard"] },
  },
  {
    id: "model:audio:qwen-tts",
    kind: "model",
    name: "Qwen cloned-voice TTS",
    description: "Create a cloned voice and synthesize speech from editable text.",
    capabilities: ["voice_clone", "speech_synthesis", "audio_generation"],
    aliases: ["qwen", "tts", "voice clone", "语音克隆", "配音"],
    accepts: ["source_audio", "source_text"],
    produces: ["audio"],
    risk: "costly",
    requiresApproval: true,
    availability: configured(process.env.DASHSCOPE_API_KEY),
    executorRef: "audio:qwen-tts",
    metadata: { nodeTypes: ["voiceClone", "voiceTTS"] },
  },
];
