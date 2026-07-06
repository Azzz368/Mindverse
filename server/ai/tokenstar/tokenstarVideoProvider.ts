import "server-only";
import { TokenStarError } from "../errors";
import { tokenstarActionGet, tokenstarActionJsonRequest, tokenstarGet, tokenstarJsonRequest } from "./tokenstarClient";
import { waitForAigcElement } from "./tokenstarElement";
import { listAssets } from "./tokenstarAsset";
import { createReferenceAssets } from "./tokenstarReferenceAssets";
import type { NormalizedVideoTask, TokenStarContentItem, TokenStarCreateVideoInput, TokenStarCreateVideoResponse, TokenStarPollVideoResponse } from "./tokenstarTypes";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const summary = (value: unknown) => {
  try {
    return JSON.stringify(value).slice(0, 2500);
  } catch {
    return String(value).slice(0, 2500);
  }
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const numberText = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
const taskId = (raw: Record<string, unknown>) => text(raw.id) || text(raw.task_id) || text(raw.taskId) || text(record(raw.data).id) || text(record(raw.data).task_id) || text(record(raw.data).taskId) || text(record(raw.output).id) || text(record(raw.output).task_id) || text(record(raw.output).taskId);
const klingTaskId = (raw: Record<string, unknown>) => taskId(raw) || text(raw.JobId) || text(record(raw.Response).JobId) || text(record(raw.Result).JobId) || text(record(record(raw.Response).Result).JobId);
const statusFor = (rawStatus: string | undefined, hasResult: boolean, hasTask = false, hasError = false): NormalizedVideoTask["status"] => {
  const status = rawStatus?.trim().toUpperCase();
  if (hasError || ["FAILED", "FAILURE", "FAIL", "ERROR", "CANCELLED", "CANCELED"].includes(status || "")) return "failed";
  // A result URL is the definitive signal that the task has finished.
  if (hasResult) return "completed";
  // Seedance/Tokenstar returns string status codes. A terminal success status WITHOUT a result_url
  // means the task is done but the result may appear in the next poll cycle — treat as still running
  // so the caller keeps polling until result_url appears.
  if (["COMPLETED", "SUCCESS", "SUCCEEDED", "DONE", "SUCCEED"].includes(status || "")) return "running";
  if (/^\d+$/.test(status || "")) return hasTask ? "running" : "pending";
  if (["RUNNING", "IN_PROGRESS", "PROCESSING", "SUBMITTED", "PENDING", "QUEUED"].includes(status || "")) return "running";
  if (hasTask && !hasResult) return "pending";
  return "pending";
};
const normalized = (task: string | undefined, raw: unknown): NormalizedVideoTask => {
  const root = record(raw), data = record(root.data), output = record(root.output), content = record(root.content), dataContent = record(data.content), outputContent = record(output.content);
  const resultUrl = text(root.result_url) || text(root.resultUrl) || text(root.video_url) || text(data.result_url) || text(data.resultUrl) || text(data.video_url) || text(output.result_url) || text(output.resultUrl) || text(output.video_url) || text(content.video_url) || text(dataContent.video_url) || text(outputContent.video_url);
  const rawStatus = text(root.status) || text(data.status) || text(output.status);
  const id = task || taskId(root);
  return { taskId: id, resultUrl, status: statusFor(rawStatus, Boolean(resultUrl), Boolean(id)), rawStatus, raw };
};
const normalizedKling = (task: string | undefined, raw: unknown, pollAction: string): NormalizedVideoTask => {
  const root = record(raw), response = record(root.Response), result = record(response.Result), data = record(root.data), error = record(response.Error) || record(root.error);
  const resultUrl = text(response.ResultVideoUrl) || text(result.ResultVideoUrl) || text(root.ResultVideoUrl) || text(data.ResultVideoUrl) || text(data.result_url) || text(data.video_url);
  const id = task || klingTaskId(root);
  const errorMessage = text(response.ErrorMessage) || text(response.Message) || text(result.ErrorMessage) || text(result.Message) || text(result.FailReason) || text(result.Reason) || text(error.Message) || text(error.message) || text(root.ErrorMessage) || text(root.message);
  const rawStatus = errorMessage ? "ERROR" : numberText(response.Status) || numberText(result.Status) || numberText(root.Status) || numberText(data.Status) || text(response.StatusStr) || text(result.StatusStr) || text(root.status);
  return { taskId: id, resultUrl, errorMessage, status: statusFor(rawStatus, Boolean(resultUrl), Boolean(id), Boolean(errorMessage)), rawStatus, pollAction, raw };
};
const bool = (value: string | undefined, fallback: boolean) => value === undefined ? fallback : value.toLowerCase() === "true";
const unique = (values: readonly string[] = []) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const isAssetUrl = (value: string) => /^asset:\/\/[^\s]+$/i.test(value);
const existingAssetUrls = (label: string, values: readonly string[] = []) => {
  const urls = unique(values);
  const invalid = urls.find((url) => !isAssetUrl(url));
  if (invalid) throw new TokenStarError(`${label} must use a TokenStar asset:// URL.`, 400);
  return urls;
};
const contentFor = (input: TokenStarCreateVideoInput, assetMode: boolean): TokenStarContentItem[] => {
  const content: TokenStarContentItem[] = [{ type: "text", text: input.prompt }];
  if (!assetMode) return content;
  existingAssetUrls("Image reference", [...(input.referenceImageAssetUrls || []), input.referenceImageAssetUrl || ""]).forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
  existingAssetUrls("Video reference", [...(input.referenceVideoAssetUrls || []), input.referenceVideoAssetUrl || ""]).forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
  existingAssetUrls("Audio reference", [...(input.referenceAudioAssetUrls || []), input.referenceAudioAssetUrl || ""]).forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
  return content;
};
const isMaterialOssMissing = (error: unknown) => error instanceof TokenStarError && error.status === 422 && /material[_\s-]*resource[_\s-]*oss[_\s-]*missing|material resource oss object is missing/i.test(error.message);
export async function createSeedanceVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> { const raw = await tokenstarJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", { model: input.model || process.env.TOKENSTAR_VIDEO_MODEL || "seedance-2.0-fast", content: contentFor(input, false), generate_audio: input.generateAudio ?? bool(process.env.TOKENSTAR_GENERATE_AUDIO, true), ratio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9", duration: input.duration || Number(process.env.TOKENSTAR_DEFAULT_DURATION || 8), ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}) }); return normalized(taskId(raw), raw); }
export async function createKlingTextVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const raw = await tokenstarActionJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", "SubmitTextToVideoJob", { Model: input.model || process.env.TOKENSTAR_KLING_MODEL || "kling-v3", Prompt: input.prompt, Duration: String(input.duration || 5), Mode: process.env.TOKENSTAR_KLING_MODE || "std", LogoAdd: 0 });
  return normalizedKling(klingTaskId(record(raw)), raw, "DescribeTextToVideoJob");
}
export async function createKlingImageVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const image = input.image || input.referenceImageUrls?.find(Boolean);
  if (!image) throw new TokenStarError("Kling image-to-video requires a connected image or reference image URL.", 400);
  const elementIds = unique([...(input.klingElementIds || []), ...(input.klingElementId || "").split(",")]);
  if (elementIds.length) await Promise.all(elementIds.map((elementId) => waitForAigcElement(elementId)));
  const raw = await tokenstarActionJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", "SubmitImageToVideoJob", { Model: input.model || process.env.TOKENSTAR_KLING_MODEL || "kling-v3", Image: { Url: image }, Prompt: input.prompt, Duration: String(input.duration || 5), Mode: process.env.TOKENSTAR_KLING_MODE || "std", Sound: input.generateAudio === false ? "off" : "on", LogoAdd: 0, ...(elementIds.length ? { ElementList: elementIds.map((elementId) => ({ ElementId: elementId })) } : {}) });
  return { ...normalizedKling(klingTaskId(record(raw)), raw, "DescribeImageToVideoJob"), request: { image, elementCount: elementIds.length, elementIds, prompt: input.prompt } };
}
export async function createKlingOmniVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const image = input.image || input.referenceImageUrls?.find(Boolean);
  const videoUrls = unique([input.video || "", ...(input.referenceVideoUrls || [])]);
  const elementIds = unique([...(input.klingElementIds || []), ...(input.klingElementId || "").split(",")]);
  const hasVideo = videoUrls.length > 0;
  if (!image && !hasVideo) throw new TokenStarError("Kling Omni requires a connected image or video URL.", 400);
  if (videoUrls.length > 1) throw new TokenStarError(`Kling Omni supports at most one video input. You connected ${videoUrls.length} videos, but TokenStar requires VideoList length 0~1. Use one base video per Omni node, or chain multiple Omni nodes sequentially.`, 400);
  if (elementIds.length) await Promise.all(elementIds.map((elementId) => waitForAigcElement(elementId)));
  const duration = input.duration || 5;
  const prompt = input.prompt;
  const request = {
    Model: input.model || process.env.TOKENSTAR_KLING_OMNI_MODEL || "kling-v3-omni",
    Prompt: prompt,
    ...(image ? { ImageList: [{ ImageUrl: image, Type: "first_frame" }] } : {}),
    ...(hasVideo ? { VideoList: videoUrls.map((url) => ({ VideoUrl: url, ReferType: "base", KeepOriginalSound: "no" })) } : {}),
    ...(!hasVideo && input.ratio ? { AspectRatio: input.ratio } : {}),
    ...(!hasVideo ? { Duration: duration } : {}),
    Mode: process.env.TOKENSTAR_KLING_MODE || "std",
    Sound: "off",
    LogoAdd: 0,
    ...(elementIds.length ? { ElementList: elementIds.map((elementId) => ({ ElementId: elementId })) } : {}),
  };
  const raw = await tokenstarActionJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", "SubmitVideoEditKlingJob", request);
  return { ...normalizedKling(klingTaskId(record(raw)), raw, "DescribeVideoEditKlingJob"), request: { duration: hasVideo ? undefined : duration, videoCount: videoUrls.length, imageCount: image ? 1 : 0, elementCount: elementIds.length, videoUrls, prompt } };
}
export async function createSeedanceAssetVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const references = await createReferenceAssets({ imageUrls: input.referenceImageUrls, videoUrls: input.referenceVideoUrls, audioUrls: input.referenceAudioUrls });
  const referenceImageAssetUrls = unique([...(input.referenceImageAssetUrls || []), input.referenceImageAssetUrl || "", ...references.imageAssetUrls]);
  const referenceVideoAssetUrls = unique([...(input.referenceVideoAssetUrls || []), input.referenceVideoAssetUrl || "", ...references.videoAssetUrls]);
  const referenceAudioAssetUrls = unique([...(input.referenceAudioAssetUrls || []), input.referenceAudioAssetUrl || "", ...references.audioAssetUrls]);
  if (!referenceImageAssetUrls.length && !referenceVideoAssetUrls.length && !referenceAudioAssetUrls.length) throw new TokenStarError("TokenStar asset-video requires at least one completed Image, Video, or Audio reference, or an existing asset:// URL.", 400);
  const request = { model: input.model || process.env.TOKENSTAR_VIDEO_ASSET_MODEL || "seedance-2.0-asset-fast", content: contentFor({ ...input, referenceImageAssetUrls, referenceVideoAssetUrls, referenceAudioAssetUrls }, true), generate_audio: input.generateAudio ?? bool(process.env.TOKENSTAR_GENERATE_AUDIO, true), ratio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9", duration: input.duration || 5, resolution: input.resolution || process.env.TOKENSTAR_DEFAULT_RESOLUTION || "720p", ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}) };
  const attempts = Math.max(1, Math.floor(numberFromEnv("TOKENSTAR_ASSET_VIDEO_CREATE_MAX_ATTEMPTS", 8)));
  const intervalMs = Math.max(250, Math.floor(numberFromEnv("TOKENSTAR_ASSET_VIDEO_CREATE_RETRY_MS", 5000)));
  let raw: TokenStarCreateVideoResponse | undefined;
  let lastMaterialError: unknown;
  let lastAssetsResponse: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      raw = await tokenstarJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", request);
      break;
    } catch (error) {
      if (!isMaterialOssMissing(error)) throw error;
      lastMaterialError = error;
      if (references.groupId) {
        try {
          lastAssetsResponse = (await listAssets({ groupId: references.groupId })).raw;
        } catch (assetError) {
          lastAssetsResponse = assetError instanceof Error ? assetError.message : assetError;
        }
      }
      if (attempt === attempts - 1) {
        throw new TokenStarError(`TokenStar asset-video references were still missing OSS objects after ${attempts} create attempts (${intervalMs}ms between attempts). Reference group: ${references.groupId || "none"}. Reference asset URLs: ${JSON.stringify({ images: referenceImageAssetUrls, videos: referenceVideoAssetUrls, audios: referenceAudioAssetUrls })}. Last create error: ${lastMaterialError instanceof Error ? lastMaterialError.message : String(lastMaterialError)}. Last ListAssets response: ${summary(lastAssetsResponse)}.`, 422);
      }
      await delay(intervalMs);
    }
  }
  if (!raw) throw new TokenStarError("TokenStar asset-video create did not return a response.", 502);
  return { ...normalized(taskId(raw), raw), referenceAssetGroupId: references.groupId, referenceImageAssetUrls, referenceVideoAssetUrls, referenceAudioAssetUrls };
}
export async function pollSeedanceVideo(id: string): Promise<NormalizedVideoTask> { const raw = await tokenstarGet<TokenStarPollVideoResponse>(`/v1/video/generations/${encodeURIComponent(id)}`); return normalized(id, raw); }
export async function pollKlingVideo(id: string, action: string): Promise<NormalizedVideoTask> {
  const raw = await tokenstarActionGet<TokenStarPollVideoResponse>(`/v1/video/generations/${encodeURIComponent(id)}`, action);
  return normalizedKling(id, raw, action);
}
