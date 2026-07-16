import "server-only";
import { TokenStarError } from "../errors";
import { tokenstarActionGet, tokenstarActionJsonRequest, tokenstarGet, tokenstarJsonRequest } from "./tokenstarClient";
import { waitForAigcElement } from "./tokenstarElement";
import { listAssets } from "./tokenstarAsset";
import { createReferenceAssets, prepareReferenceUrl } from "./tokenstarReferenceAssets";
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
const hasFields = (value: Record<string, unknown>) => Object.keys(value).length > 0;
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
  if (["RUNNING", "IN_PROGRESS", "PROCESSING", "SUBMITTED", "PENDING", "QUEUED", "CREATED", "GENERATING", "WAITING"].includes(status || "")) return "running";
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
  const rawStatus = numberText(response.Status) || numberText(result.Status) || numberText(root.Status) || numberText(data.Status) || text(response.StatusStr) || text(result.StatusStr) || text(root.status);
  const possibleError = text(response.ErrorMessage) || text(result.ErrorMessage) || text(result.FailReason) || text(result.Reason) || text(error.Message) || text(error.message) || text(root.ErrorMessage) || text(root.message);
  const failed = statusFor(rawStatus, Boolean(resultUrl), Boolean(id), hasFields(error)) === "failed";
  const errorMessage = failed ? possibleError || text(response.Message) || text(result.Message) : undefined;
  return { taskId: id, resultUrl, errorMessage, status: statusFor(rawStatus, Boolean(resultUrl), Boolean(id), Boolean(errorMessage) || hasFields(error)), rawStatus, pollAction, raw };
};
const firstOmniVideoUrl = (raw: unknown) => {
  const root = record(raw), data = record(root.data), taskResult = record(data.task_result);
  const videos = Array.isArray(taskResult.videos) ? taskResult.videos : [];
  const firstVideo = record(videos[0]);
  return text(firstVideo.url) || text(firstVideo.watermark_url) || text(data.result_url) || text(root.result_url) || text(root.video_url);
};
const normalizedOmni = (task: string | undefined, raw: unknown): NormalizedVideoTask => {
  const root = record(raw), data = record(root.data);
  const id = task || text(data.task_id) || text(root.task_id) || text(root.taskId) || taskId(root);
  const resultUrl = firstOmniVideoUrl(raw);
  const rawStatus = text(data.task_status) || text(data.status) || text(root.task_status) || text(root.status);
  const status = statusFor(rawStatus, Boolean(resultUrl), Boolean(id));
  return { taskId: id, resultUrl, status, rawStatus, pollAction: "omni-video", raw };
};
const bool = (value: string | undefined, fallback: boolean) => value === undefined ? fallback : value.toLowerCase() === "true";
const unique = (values: readonly string[] = []) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const elementId = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value;
const omniModeFor = (value: string | undefined) => {
  const normalized = value?.toLowerCase();
  if (normalized === "4k") return "4k";
  if (normalized === "1080p" || normalized === "pro") return "pro";
  return normalized === "720p" || normalized === "std" ? "std" : "pro";
};
const omniPrompt = (prompt: string, imageCount: number, videoCount: number, elementCount: number) => {
  if (/<<<(?:image|video|element)_\d+>>>/.test(prompt)) return prompt;
  const refs = [
    imageCount ? `reference images are available as ${Array.from({ length: imageCount }, (_, index) => `<<<image_${index + 1}>>>`).join(", ")}` : "",
    videoCount ? `reference videos are available as ${Array.from({ length: videoCount }, (_, index) => `<<<video_${index + 1}>>>`).join(", ")}` : "",
    elementCount ? `reference elements are available as ${Array.from({ length: elementCount }, (_, index) => `<<<element_${index + 1}>>>`).join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return refs ? `${refs}.\n${prompt}` : prompt;
};
const urlSummary = (value: string) => value.length > 180 ? `${value.slice(0, 177)}...` : value;
const requirePublicHttpsUrl = (label: string, value: string) => {
  if (!/^https:\/\//i.test(value)) {
    throw new TokenStarError(`${label} must be a public HTTPS URL. Received: ${urlSummary(value)}`, 400);
  }
};
const klingOmniRequestBody = (input: TokenStarCreateVideoInput, prompt: string, videoUrls: string[], elementIds: string[]) => {
  const body: Record<string, unknown> = {
    model_name: input.model || process.env.TOKENSTAR_KLING_OMNI_MODEL || process.env.KLING_OMNI_MODEL || "kling-v3-omni",
    prompt: omniPrompt(prompt, 0, videoUrls.length, elementIds.length),
    mode: omniModeFor(input.resolution || process.env.TOKENSTAR_KLING_MODE),
    duration: String(input.duration || Number(process.env.TOKENSTAR_DEFAULT_DURATION || 5)),
    aspect_ratio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9",
    sound: input.generateAudio === true ? "on" : "off",
    video_list: videoUrls.map((url, index) => ({
      video_url: url,
      refer_type: index === 0 ? "base" : "reference",
      keep_original_sound: "no",
    })),
  };
  if (elementIds.length) body.element_list = elementIds.map((id) => ({ element_id: elementId(id) }));
  return body;
};
const legacyKlingOmniActionBody = (input: TokenStarCreateVideoInput, prompt: string, imageUrls: string[], videoUrls: string[], elementIds: string[]) => {
  const imageList = imageUrls.map((url, index) => ({
    ImageUrl: url,
    ...(imageUrls.length === 1 && index === 0 ? { Type: "first_frame" } : {}),
  }));
  const body: Record<string, unknown> = {
    Model: input.model || process.env.TOKENSTAR_KLING_OMNI_MODEL || process.env.KLING_OMNI_MODEL || "kling-v3-omni",
    Prompt: omniPrompt(prompt, imageUrls.length, videoUrls.length, elementIds.length),
    AspectRatio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9",
    Duration: input.duration || Number(process.env.TOKENSTAR_DEFAULT_DURATION || 5),
    Mode: omniModeFor(input.resolution || process.env.TOKENSTAR_KLING_MODE),
    Sound: input.generateAudio === true ? "on" : "off",
    LogoAdd: 0,
  };
  if (imageList.length) body.ImageList = imageList;
  if (videoUrls[0]) body.VideoList = [{ VideoUrl: videoUrls[0], ReferType: "base", KeepOriginalSound: "no" }];
  if (elementIds.length) body.ElementList = elementIds.map((id) => ({ ElementId: id }));
  return body;
};
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
const seedanceAssetModelFor = (inputModel?: string) => {
  const envModel = process.env.TOKENSTAR_VIDEO_ASSET_MODEL?.trim() || "seedance-2.0-asset";
  const model = inputModel?.trim();
  if (!model) return envModel;
  if (model === "seedance-asset-fast") return "seedance-2.0-asset-fast";
  return model;
};
const assetVideoRequestSummary = (request: { model: string; content: TokenStarContentItem[]; duration: number; resolution: string; callback_url?: string }, references: { groupId?: string; images: string[]; videos: string[]; audios: string[] }) => ({
  model: request.model,
  content: request.content.map((item) => item.type),
  duration: request.duration,
  resolution: request.resolution,
  hasCallback: Boolean(request.callback_url),
  referenceGroupId: references.groupId,
  referenceCounts: { images: references.images.length, videos: references.videos.length, audios: references.audios.length },
  referenceAssetUrls: references,
});
const isMaterialOssMissing = (error: unknown) => error instanceof TokenStarError && error.status === 422 && /material[_\s-]*resource[_\s-]*oss[_\s-]*missing|material resource oss object is missing/i.test(error.message);
export async function createSeedanceVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> { const raw = await tokenstarJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", { model: input.model || process.env.TOKENSTAR_VIDEO_MODEL || "seedance-2.0-fast", content: contentFor(input, false), generate_audio: input.generateAudio ?? bool(process.env.TOKENSTAR_GENERATE_AUDIO, true), ratio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9", duration: input.duration || Number(process.env.TOKENSTAR_DEFAULT_DURATION || 8), resolution: input.resolution || process.env.TOKENSTAR_DEFAULT_RESOLUTION || "720p", ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}) }); return normalized(taskId(raw), raw); }
export async function createKlingTextVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const raw = await tokenstarActionJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", "SubmitTextToVideoJob", { Model: input.model || process.env.TOKENSTAR_KLING_MODEL || "kling-v3", Prompt: input.prompt, Duration: String(input.duration || 5), Mode: omniModeFor(input.resolution || process.env.TOKENSTAR_KLING_MODE), AspectRatio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9", LogoAdd: 0 });
  return normalizedKling(klingTaskId(record(raw)), raw, "DescribeTextToVideoJob");
}
export async function createKlingImageVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const image = input.image || input.referenceImageUrls?.find(Boolean);
  if (!image) throw new TokenStarError("Kling image-to-video requires a connected image or reference image URL.", 400);
  const elementIds = unique([...(input.klingElementIds || []), ...(input.klingElementId || "").split(",")]);
  if (elementIds.length) await Promise.all(elementIds.map((elementId) => waitForAigcElement(elementId)));
  const raw = await tokenstarActionJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", "SubmitImageToVideoJob", { Model: input.model || process.env.TOKENSTAR_KLING_MODEL || "kling-v3", Image: { Url: image }, Prompt: input.prompt, Duration: String(input.duration || 5), Mode: omniModeFor(input.resolution || process.env.TOKENSTAR_KLING_MODE), Sound: input.generateAudio === false ? "off" : "on", LogoAdd: 0, ...(elementIds.length ? { ElementList: elementIds.map((elementId) => ({ ElementId: elementId })) } : {}) });
  return { ...normalizedKling(klingTaskId(record(raw)), raw, "DescribeImageToVideoJob"), request: { image, elementCount: elementIds.length, elementIds, prompt: input.prompt } };
}
export async function createKlingOmniVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const imageUrls = unique([input.image || "", ...(input.referenceImageUrls || [])]).slice(0, 7);
  const videoUrls = unique([input.video || "", ...(input.referenceVideoUrls || [])]).slice(0, 1);
  const elementIds = unique([...(input.klingElementIds || []), ...(input.klingElementId || "").split(",")]);
  if (elementIds.length) await Promise.all(elementIds.map((elementId) => waitForAigcElement(elementId)));
  const prompt = input.prompt.trim();
  if (!prompt) throw new TokenStarError("Kling Omni requires a prompt.", 400);
  if (videoUrls.length) {
    const preparedVideoUrls = await Promise.all(videoUrls.map((url, index) => prepareReferenceUrl(url, "Video", index)));
    preparedVideoUrls.forEach((url, index) => requirePublicHttpsUrl(`Kling Omni video reference ${index + 1}`, url));
    const request = klingOmniRequestBody(input, prompt, preparedVideoUrls, elementIds);
    const raw = await tokenstarJsonRequest<TokenStarCreateVideoResponse>("/v1/videos/omni-video", request);
    return { ...normalizedOmni(taskId(record(raw)), raw), request: { imageCount: imageUrls.length, videoCount: videoUrls.length, elementCount: elementIds.length, videoUrls: preparedVideoUrls, prompt, transport: "/v1/videos/omni-video", body: request } };
  }
  if (!imageUrls.length) throw new TokenStarError("Kling Omni requires a connected image/video or a public HTTPS reference URL.", 400);
  const preparedImageUrls = await Promise.all(imageUrls.map((url, index) => prepareReferenceUrl(url, "Image", index)));
  preparedImageUrls.forEach((url, index) => requirePublicHttpsUrl(`Kling Omni image reference ${index + 1}`, url));
  const request = legacyKlingOmniActionBody(input, prompt, preparedImageUrls, [], elementIds);
  const raw = await tokenstarActionJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", "SubmitVideoEditKlingJob", request);
  return { ...normalizedKling(klingTaskId(record(raw)), raw, "DescribeVideoEditKlingJob"), request: { imageCount: imageUrls.length, videoCount: 0, elementCount: elementIds.length, imageUrls: preparedImageUrls, prompt, transport: "SubmitVideoEditKlingJob", body: request } };
}
export async function createSeedanceAssetVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const references = await createReferenceAssets({ imageUrls: input.referenceImageUrls, videoUrls: input.referenceVideoUrls, audioUrls: input.referenceAudioUrls });
  const referenceImageAssetUrls = unique([...(input.referenceImageAssetUrls || []), input.referenceImageAssetUrl || "", ...references.imageAssetUrls]);
  const referenceVideoAssetUrls = unique([...(input.referenceVideoAssetUrls || []), input.referenceVideoAssetUrl || "", ...references.videoAssetUrls]);
  const referenceAudioAssetUrls = unique([...(input.referenceAudioAssetUrls || []), input.referenceAudioAssetUrl || "", ...references.audioAssetUrls]);
  if (!referenceImageAssetUrls.length && !referenceVideoAssetUrls.length && !referenceAudioAssetUrls.length) throw new TokenStarError("TokenStar asset-video requires at least one completed Image, Video, or Audio reference, or an existing asset:// URL.", 400);
  const request = { model: seedanceAssetModelFor(input.model), content: contentFor({ ...input, referenceImageAssetUrls, referenceVideoAssetUrls, referenceAudioAssetUrls }, true), duration: input.duration || 5, resolution: input.resolution || process.env.TOKENSTAR_DEFAULT_RESOLUTION || "720p", ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}) };
  const requestSummary = assetVideoRequestSummary(request, { groupId: references.groupId, images: referenceImageAssetUrls, videos: referenceVideoAssetUrls, audios: referenceAudioAssetUrls });
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
      if (error instanceof TokenStarError && !isMaterialOssMissing(error) && (error.status === 400 || error.errorCode === "invalid_request" || error.errorCode === "invalid_json")) {
        throw new TokenStarError(`Seedance asset-video create rejected request. Request summary: ${summary(requestSummary)}. TokenStar error: ${error.message}`, error.status, error.errorCode, error.requestId);
      }
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
  return { ...normalized(taskId(raw), raw), request: requestSummary, referenceAssetGroupId: references.groupId, referenceImageAssetUrls, referenceVideoAssetUrls, referenceAudioAssetUrls };
}
export async function pollSeedanceVideo(id: string): Promise<NormalizedVideoTask> { const raw = await tokenstarGet<TokenStarPollVideoResponse>(`/v1/video/generations/${encodeURIComponent(id)}`); return normalized(id, raw); }
export async function pollKlingVideo(id: string, action: string): Promise<NormalizedVideoTask> {
  const raw = await tokenstarActionGet<TokenStarPollVideoResponse>(`/v1/video/generations/${encodeURIComponent(id)}`, action);
  return normalizedKling(id, raw, action);
}
export async function pollKlingOmniVideo(id: string): Promise<NormalizedVideoTask> {
  const raw = await tokenstarGet<TokenStarPollVideoResponse>(`/v1/videos/omni-video/${encodeURIComponent(id)}`);
  return normalizedOmni(id, raw);
}
