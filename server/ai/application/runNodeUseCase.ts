import "server-only";
import { getAIProvider, getImageAIProvider, getTextAIProvider } from "@/server/ai/provider";
import { createKlingImageVideo } from "@/server/ai/klingVideoProvider";
import type { KlingVideoMode } from "@/server/ai/tokenstar/klingVideoProvider";
import { generateTokenStarImage, generateTokenStarImageRevision, isTokenStarImageModel } from "@/server/ai/tokenstar/tokenstarImageProvider";
import { createKlingImageVideo as tsKlingImage, createKlingTextVideo, createKlingOmniVideo, createSeedanceAssetVideo, createSeedanceVideo } from "@/server/ai/tokenstar/tokenstarVideoProvider";
import { createSora2ImageVideo } from "@/server/ai/sora2VideoProvider";
import { createFfmpegVideoEdit } from "@/server/video/ffmpegEditRunner";
import { createMotionComposition } from "@/server/motion/motionCompositionRunner";
import { clampStoryboardSceneCount, parseScript, scriptInstruction } from "@/shared/workflow/storyPipeline";
import { archiveResultMedia } from "@/server/storage/mediaArchive";
import { synthesizeWithClonedVoice } from "@/server/qwen/speechSynthesis";
import { qwenErrorPayload } from "@/server/qwen/errors";
import { assertSourceAspectRatio, verifyCompletedVideoAspectRatio } from "@/server/ai/videoAspectRatio";
import { DEFAULT_QWEN_VOICE_MODEL, DEFAULT_QWEN_VOICE_PROVIDER, type QwenVoiceProvider } from "@/shared/api/qwenContracts";
import type { GenerateAudioInput, GenerateImageInput, GenerateImageRevisionInput, GenerateStoryboardInput, GenerateTextInput, GenerateVideoInput } from "@/server/ai/types";

export type RunnableNodeType = "text" | "script" | "image" | "image-revision" | "video" | "videoEdit" | "motion" | "audio" | "voiceClone" | "voiceTTS" | "storyboard";

export type RunNodeResult =
  | { ok: true; provider: string; output: unknown; polling: { intervalMs: number; maxAttempts?: number } }
  | { ok: false; error: { message: string; code?: string; status: number } };

export const isRunnableNodeType = (value: unknown): value is RunnableNodeType =>
  ["text", "script", "image", "image-revision", "video", "videoEdit", "motion", "audio", "voiceClone", "voiceTTS", "storyboard"].includes(String(value));

const fail = (message: string, status = 400, code?: string): RunNodeResult => ({ ok: false, error: { message, status, ...(code ? { code } : {}) } });

const text = (value: unknown) => typeof value === "string" ? value : "";
const optionalText = (value: unknown) => typeof value === "string" ? value : undefined;
const optionalVoiceProvider = (value: unknown): QwenVoiceProvider | undefined => {
  if (value === "qwen_tts" || value === "dashscope" || value === "omni" || value === "qwencloud") return value;
  return undefined;
};
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
  await assertSourceAspectRatio(image, input.aspectRatio, "Sora-2 source image");
  const output = await createSora2ImageVideo({ prompt, image, duration: optionalNumber(input.duration), resolution: optionalText(input.resolution) });
  const verified = await verifyCompletedVideoAspectRatio(output, input.aspectRatio);
  return { ok: true, provider: "302-sora2", output: await archiveResultMedia(verified, { sourceProvider: "302-sora2", mediaTypeHint: "video" }), polling: { intervalMs: 5000 } };
}

async function runKlingVideo(input: Record<string, unknown>): Promise<RunNodeResult> {
  const prompt = text(input.prompt);
  const rawKlingMode = text(input.klingMode) || "image-to-video";
  const klingMode = (["text-to-video", "image-to-video", "reference-image", "omni"].includes(rawKlingMode) ? rawKlingMode : "image-to-video") as KlingVideoMode;
  if (!prompt) return fail("Kling video requires a prompt.");
  const image = text(input.image);
  if ((klingMode === "image-to-video" || klingMode === "reference-image") && !image) return fail("Kling 首帧/参考图生视频需要连接一张图片或填写参考图 URL。请连接已生成的图像节点，或在设置里填首帧 URL。");
  if (image) await assertSourceAspectRatio(image, input.aspectRatio, "Kling source image");
  const output = await createKlingImageVideo({ prompt, image, modelName: optionalText(input.model), negativePrompt: optionalText(input.negativePrompt), duration: optionalNumber(input.duration), resolution: optionalText(input.resolution) });
  const verified = await verifyCompletedVideoAspectRatio({ ...output, klingMode }, input.aspectRatio);
  return { ok: true, provider: "kling", output: await archiveResultMedia(verified, { sourceProvider: "kling", mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.KLING_POLL_INTERVAL_MS || 5000) } };
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
  if (tsMode === "kling-image" && input.image) await assertSourceAspectRatio(input.image, input.ratio, "TokenStar Kling source image");
  const output = tsMode === "kling-text" ? await createKlingTextVideo(input)
    : tsMode === "kling-image" ? await tsKlingImage(input)
    : tsMode === "kling-omni" ? await createKlingOmniVideo(input)
    : tsMode === "asset-video" ? await createSeedanceAssetVideo(input)
    : await createSeedanceVideo(input);
  const verified = await verifyCompletedVideoAspectRatio({ ...output, tokenstarMode: tsMode }, input.ratio);
  return { ok: true, provider: "tokenstar", output: await archiveResultMedia(verified, { sourceProvider: "tokenstar", mediaTypeHint: "video" }), polling: { intervalMs: Number(process.env.TOKENSTAR_POLL_INTERVAL_MS || 5000) } };
}

async function runScript(input: Record<string, unknown>) {
  const textProvider = getTextAIProvider();
  const brief = text(input.storyBrief) || text(input.prompt);
  const defaultTone = /[\u3400-\u9fff]/.test(brief) ? "电影感、虚构、完整可拍摄剧本" : "Cinematic, fictional";
  const tone = text(input.scriptTone) || defaultTone;
  const count = clampStoryboardSceneCount(input.numberOfScenes);
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

  if (nodeType === "motion") {
    try {
      const output = await createMotionComposition({
        prompt: optionalText(rawInput.prompt),
        compositionJson: optionalText(rawInput.compositionJson),
        templateId: optionalText(rawInput.templateId),
        motionVariablesJson: optionalText(rawInput.motionVariablesJson),
        motionMode: optionalText(rawInput.motionMode),
        codexInstruction: optionalText(rawInput.codexInstruction),
        referenceVideoUrls: urls(rawInput.referenceVideoUrls),
        referenceImageUrls: urls(rawInput.referenceImageUrls),
        referenceAudioUrls: urls(rawInput.referenceAudioUrls),
      });
      return { ok: true, provider: "hyperframes", output, polling: { intervalMs: 0 } };
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Motion render failed.", 500, "MOTION_RENDER_ERROR");
    }
  }

  if (nodeType === "voiceClone") {
    const voice = text(rawInput.voice);
    if (!voice) return fail("Create or select a cloned voice before running this node.", 400, "VOICE_REQUIRED");
    const targetModel = optionalText(rawInput.targetModel) || DEFAULT_QWEN_VOICE_MODEL;
    return {
      ok: true,
      provider: "qwencloud",
      output: {
        status: "completed",
        kind: "clonedVoice",
        voice,
        targetModel,
        voiceProvider: optionalVoiceProvider(rawInput.voiceProvider) || DEFAULT_QWEN_VOICE_PROVIDER,
        language: optionalText(rawInput.language),
        fallbackMode: typeof rawInput.fallbackMode === "boolean" ? rawInput.fallbackMode : undefined,
        fallbackReason: optionalText(rawInput.fallbackReason),
      },
      polling: { intervalMs: 0 },
    };
  }

  if (nodeType === "voiceTTS") {
    try {
      const output = await synthesizeWithClonedVoice({
        text: text(rawInput.text),
        voice: text(rawInput.voice),
        targetModel: optionalText(rawInput.targetModel) || DEFAULT_QWEN_VOICE_MODEL,
        voiceProvider: optionalVoiceProvider(rawInput.voiceProvider) || DEFAULT_QWEN_VOICE_PROVIDER,
        languageType: rawInput.languageType === "Chinese" || rawInput.languageType === "English" || rawInput.languageType === "German" || rawInput.languageType === "Italian" || rawInput.languageType === "Portuguese" || rawInput.languageType === "Spanish" || rawInput.languageType === "Japanese" || rawInput.languageType === "Korean" || rawInput.languageType === "French" || rawInput.languageType === "Russian" ? rawInput.languageType : "Auto",
      });
      return {
        ok: true,
        provider: "qwencloud",
        output: await archiveResultMedia({
          ...output,
          url: output.audioUrl,
          model: output.model || optionalText(rawInput.targetModel) || DEFAULT_QWEN_VOICE_MODEL,
          voice: text(rawInput.voice),
          provider: "qwencloud",
          voiceProvider: output.voiceProvider || optionalVoiceProvider(rawInput.voiceProvider) || DEFAULT_QWEN_VOICE_PROVIDER,
          text: text(rawInput.text),
        }, { sourceProvider: "qwencloud", mediaTypeHint: "audio" }),
        polling: { intervalMs: 0 },
      };
    } catch (error) {
      const normalized = qwenErrorPayload(error);
      return fail(normalized.message, normalized.status, normalized.code || "QWEN_TTS_ERROR");
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
    : await textProvider.generateStoryboard({
      ...(rawInput as GenerateStoryboardInput),
      numberOfScenes: clampStoryboardSceneCount(rawInput.numberOfScenes),
    });
  const verifiedOutput = nodeType === "video" ? await verifyCompletedVideoAspectRatio(output, rawInput.aspectRatio) : output;
  return {
    ok: true,
    provider: sourceProvider,
    output: await archiveResultMedia(verifiedOutput, { sourceProvider, mediaTypeHint: nodeType === "audio" ? "audio" : nodeType === "image" || nodeType === "image-revision" ? "image" : nodeType === "video" ? "video" : undefined }),
    polling: { intervalMs: Number(process.env.AI_302_POLL_INTERVAL_MS || 3000), maxAttempts: Number(process.env.AI_302_MAX_POLL_ATTEMPTS || 40) },
  };
}
