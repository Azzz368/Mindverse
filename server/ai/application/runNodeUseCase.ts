import "server-only";
import { getAIProvider, getImageAIProvider, getTextAIProvider } from "@/server/ai/provider";
import { createKlingImageVideo } from "@/server/ai/klingVideoProvider";
import type { KlingVideoMode } from "@/server/ai/tokenstar/klingVideoProvider";
import { generateTokenStarImage, generateTokenStarImageRevision, isTokenStarImageModel } from "@/server/ai/tokenstar/tokenstarImageProvider";
import { createKlingImageVideo as tsKlingImage, createKlingTextVideo, createKlingOmniVideo, createSeedanceAssetVideo, createSeedanceVideo } from "@/server/ai/tokenstar/tokenstarVideoProvider";
import { createSora2ImageVideo } from "@/server/ai/sora2VideoProvider";
import { createFfmpegVideoEdit } from "@/server/video/ffmpegEditRunner";
import { parseScript, scriptInstruction } from "@/shared/workflow/storyPipeline";
import { archiveResultMedia } from "@/server/storage/mediaArchive";
import type { GenerateAudioInput, GenerateImageInput, GenerateImageRevisionInput, GenerateStoryboardInput, GenerateTextInput, GenerateVideoInput } from "@/server/ai/types";

export type RunnableNodeType = "text" | "script" | "image" | "image-revision" | "video" | "videoEdit" | "audio" | "storyboard";

export type RunNodeResult =
  | { ok: true; provider: string; output: unknown; polling: { intervalMs: number; maxAttempts?: number } }
  | { ok: false; error: { message: string; code?: string; status: number } };

export const isRunnableNodeType = (value: unknown): value is RunnableNodeType =>
  ["text", "script", "image", "image-revision", "video", "videoEdit", "audio", "storyboard"].includes(String(value));

const fail = (message: string, status = 400, code?: string): RunNodeResult => ({ ok: false, error: { message, status, ...(code ? { code } : {}) } });

const text = (value: unknown) => typeof value === "string" ? value : "";
const optionalText = (value: unknown) => typeof value === "string" ? value : undefined;
const optionalNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};
const urls = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;

const normalizeTokenstarMode = (value: unknown, fallback: unknown = "text-to-video") => {
  const mode = typeof value === "string" && value ? value : typeof fallback === "string" ? fallback : "text-to-video";
  if (mode === "kling-image" || mode === "kling-reference" || mode === "kling-image-to-video") return "kling-image";
  if (mode === "kling-text" || mode === "kling-text-to-video") return "kling-text";
  if (mode === "kling-omni" || mode === "asset-video" || mode === "text-to-video") return mode;
  return "text-to-video";
};

async function runSora2Video(input: Record<string, unknown>): Promise<RunNodeResult> {
  const prompt = text(input.prompt);
  const image = text(input.image);
  if (!prompt || !image) return fail("Sora-2 image-to-video requires both a prompt and a source image.");
  const output = await createSora2ImageVideo({ prompt, image, duration: optionalNumber(input.duration), resolution: optionalText(input.resolution) });
  return { ok: true, provider: "302-sora2", output: await archiveResultMedia(output, { sourceProvider: "302-sora2", mediaTypeHint: "video" }), polling: { intervalMs: 5000 } };
}

async function runKlingVideo(input: Record<string, unknown>): Promise<RunNodeResult> {
  const prompt = text(input.prompt);
  const rawKlingMode = text(input.klingMode) || "image-to-video";
  const klingMode = (["text-to-video", "image-to-video", "reference-image", "omni"].includes(rawKlingMode) ? rawKlingMode : "image-to-video") as KlingVideoMode;
  if (!prompt) return fail("Kling video requires a prompt.");
  const image = text(input.image);
  if ((klingMode === "image-to-video" || klingMode === "reference-image") && !image) return fail("Kling 首帧/参考图生视频需要连接一张图片或填写参考图 URL。请连接已生成的图像节点，或在设置里填首帧 URL。");
  const output = await createKlingImageVideo({ prompt, image, modelName: optionalText(input.model), negativePrompt: optionalText(input.negativePrompt), duration: optionalNumber(input.duration), resolution: optionalText(input.resolution) });
  return { ok: true, provider: "kling", output: await archiveResultMedia({ ...output, klingMode }, { sourceProvider: "kling", mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.KLING_POLL_INTERVAL_MS || 5000) } };
}

async function runTokenstarVideo(rawInput: Record<string, unknown>): Promise<RunNodeResult> {
  const prompt = text(rawInput.prompt);
  if (!prompt) return fail("A video prompt is required.");
  const elementIds = typeof rawInput.klingElementId === "string"
    ? rawInput.klingElementId.split(",").map((item) => item.trim()).filter(Boolean)
    : urls(rawInput.klingElementIds);
  const input = {
    prompt,
    model: optionalText(rawInput.model),
    image: optionalText(rawInput.image),
    video: optionalText(rawInput.referenceVideoUrl),
    ratio: optionalText(rawInput.aspectRatio),
    duration: optionalNumber(rawInput.duration),
    resolution: optionalText(rawInput.resolution),
    generateAudio: typeof rawInput.generateAudio === "boolean" ? rawInput.generateAudio : undefined,
    klingElementId: optionalText(rawInput.klingElementId),
    klingElementIds: elementIds,
    referenceImageUrls: urls(rawInput.referenceImageUrls),
    referenceVideoUrls: urls(rawInput.referenceVideoUrls),
    referenceAudioUrls: urls(rawInput.referenceAudioUrls),
    referenceImageAssetUrl: optionalText(rawInput.referenceImageAssetUrl),
    referenceVideoAssetUrl: optionalText(rawInput.referenceVideoAssetUrl),
    referenceAudioAssetUrl: optionalText(rawInput.referenceAudioAssetUrl),
  };
  const tsMode = normalizeTokenstarMode(rawInput.tokenstarMode, rawInput.mode);
  const output = tsMode === "kling-text" ? await createKlingTextVideo(input)
    : tsMode === "kling-image" ? await tsKlingImage(input)
    : tsMode === "kling-omni" ? await createKlingOmniVideo(input)
    : tsMode === "asset-video" ? await createSeedanceAssetVideo(input)
    : await createSeedanceVideo(input);
  return { ok: true, provider: "tokenstar", output: await archiveResultMedia({ ...output, tokenstarMode: tsMode }, { sourceProvider: "tokenstar", mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.TOKENSTAR_POLL_INTERVAL_MS || 5000) } };
}

async function runScript(input: Record<string, unknown>) {
  const textProvider = getTextAIProvider();
  const brief = text(input.storyBrief) || text(input.prompt);
  const defaultTone = /[\u3400-\u9fff]/.test(brief) ? "电影感、虚构、完整可拍摄剧本" : "Cinematic, fictional";
  const tone = text(input.scriptTone) || defaultTone;
  const count = Math.max(1, Math.min(12, Number(input.numberOfScenes) || 3));
  const result = await textProvider.generateText({ model: optionalText(input.model), temperature: 0.5, prompt: scriptInstruction(brief, tone, count) });
  return parseScript(result.text, brief, count);
}

export async function runNodeUseCase(nodeType: RunnableNodeType, rawInput: Record<string, unknown>): Promise<RunNodeResult> {
  if (nodeType === "videoEdit") {
    try {
      const output = await createFfmpegVideoEdit({
        prompt: optionalText(rawInput.prompt),
        editPlan: optionalText(rawInput.editPlan),
        referenceVideoUrls: urls(rawInput.referenceVideoUrls),
        referenceAudioUrls: urls(rawInput.referenceAudioUrls),
        preserveAudio: typeof rawInput.preserveAudio === "boolean" ? rawInput.preserveAudio : true,
        originalVolume: optionalNumber(rawInput.originalVolume),
        backgroundVolume: optionalNumber(rawInput.backgroundVolume),
        fadeIn: optionalNumber(rawInput.fadeIn),
        fadeOut: optionalNumber(rawInput.fadeOut),
        transition: rawInput.transition === "fade" ? "fade" : "none",
        resolution: optionalText(rawInput.resolution),
        aspectRatio: optionalText(rawInput.aspectRatio),
        fps: optionalText(rawInput.fps) || optionalNumber(rawInput.fps),
      });
      return { ok: true, provider: "ffmpeg", output, polling: { intervalMs: 0 } };
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Video edit failed.", 500, "VIDEO_EDIT_ERROR");
    }
  }

  if (nodeType === "video" && rawInput.videoProvider === "302-sora2") return runSora2Video(rawInput);
  if (nodeType === "video" && (rawInput.videoProvider === "kling" || rawInput.videoProvider === "" || (!rawInput.videoProvider && process.env.AI_VIDEO_PROVIDER !== "302ai" && process.env.AI_VIDEO_PROVIDER !== "tokenstar"))) return runKlingVideo(rawInput);
  if (nodeType === "video" && (rawInput.videoProvider === "tokenstar" || (!rawInput.videoProvider && process.env.AI_VIDEO_PROVIDER === "tokenstar"))) return runTokenstarVideo(rawInput);

  const provider = getAIProvider();
  const imageProvider = getImageAIProvider();
  const textProvider = getTextAIProvider();
  const responseProvider = nodeType === "image" || nodeType === "image-revision" ? imageProvider : nodeType === "text" || nodeType === "script" || nodeType === "storyboard" ? textProvider : provider;
  const imageModel = optionalText(rawInput.model);
  const sourceProvider = (nodeType === "image" || nodeType === "image-revision") && isTokenStarImageModel(imageModel) ? "tokenstar" : responseProvider.name;
  const output = nodeType === "script" ? await runScript(rawInput)
    : nodeType === "text" ? await textProvider.generateText(rawInput as GenerateTextInput)
    : nodeType === "image" && isTokenStarImageModel(imageModel) ? await generateTokenStarImage(rawInput as GenerateImageInput)
    : nodeType === "image" ? await imageProvider.generateImage(rawInput as GenerateImageInput)
    : nodeType === "image-revision" && isTokenStarImageModel(imageModel) ? await generateTokenStarImageRevision(rawInput as GenerateImageRevisionInput)
    : nodeType === "image-revision" ? await imageProvider.generateImageRevision(rawInput as GenerateImageRevisionInput)
    : nodeType === "video" ? await provider.generateVideo(rawInput as GenerateVideoInput)
    : nodeType === "audio" ? await provider.generateAudio(rawInput as GenerateAudioInput)
    : await textProvider.generateStoryboard(rawInput as GenerateStoryboardInput);
  return {
    ok: true,
    provider: sourceProvider,
    output: await archiveResultMedia(output, { sourceProvider, mediaTypeHint: nodeType === "audio" ? "audio" : nodeType === "image" || nodeType === "image-revision" ? "image" : nodeType === "video" ? "video" : undefined }),
    polling: { intervalMs: Number(process.env.AI_302_POLL_INTERVAL_MS || 3000), maxAttempts: Number(process.env.AI_302_MAX_POLL_ATTEMPTS || 40) },
  };
}
