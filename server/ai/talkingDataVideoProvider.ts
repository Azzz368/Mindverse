import "server-only";

import { AIProviderError, AIProviderHTTPError } from "./errors";

type RecordValue = Record<string, unknown>;
type TalkingDataTaskStatus = "pending" | "running" | "completed" | "failed";

const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const apiOrigin = () => (process.env.TALKINGDATA_API_ORIGIN || "https://mp-api.talkingdata.com").replace(/\/$/, "");
const apiKey = () => {
  const value = process.env.TALKINGDATA_API_KEY?.trim();
  if (!value) throw new AIProviderError("TalkingData API key is missing. Set TALKINGDATA_API_KEY in the server environment.", "TALKINGDATA_CONFIG_ERROR", 500);
  return value;
};
const requestId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `mindverse-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const taskValue = (raw: unknown) => {
  const root = record(raw);
  const data = record(root.data);
  return Object.keys(data).length ? { ...root, ...data } : root;
};
const taskIdFrom = (raw: unknown) => {
  const value = taskValue(raw);
  return text(value.id) || text(value.task_id) || text(value.taskId);
};
const statusFrom = (value: unknown, hasTask: boolean): TalkingDataTaskStatus => {
  const status = (text(value) || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "complete", "succeeded", "success", "done"].includes(status)) return "completed";
  if (["failed", "failure", "error", "cancelled", "canceled", "expired"].includes(status)) return "failed";
  if (["running", "processing", "in_progress", "generating", "queued"].includes(status)) return "running";
  return hasTask ? "pending" : "failed";
};
const videoUrlFrom = (raw: unknown): string | undefined => {
  const value = taskValue(raw);
  const candidates = [value.video_url, value.videoUrl, value.result_url, value.resultUrl, value.url, record(value.content).video_url, record(value.content).videoUrl, record(value.content).url, record(value.output).video_url, record(value.output).videoUrl, record(value.output).url, record(value.result).video_url, record(value.result).videoUrl, record(value.result).url];
  return candidates.map(text).find((candidate) => /^https?:\/\//i.test(candidate || ""));
};
const lastFrameUrlFrom = (raw: unknown): string | undefined => {
  const value = taskValue(raw);
  const candidates = [value.last_frame_url, value.lastFrameUrl, record(value.content).last_frame_url, record(value.content).lastFrameUrl];
  return candidates.map(text).find((candidate) => /^https?:\/\//i.test(candidate || ""));
};
const errorMessageFrom = (raw: unknown) => {
  const value = taskValue(raw);
  return text(record(value.error).message) || text(value.error_message) || text(value.errorMessage) || text(value.message);
};

async function requestTalkingData<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "X-Timestamp": String(Math.floor(Date.now() / 1000)),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new AIProviderError(error instanceof Error ? `TalkingData request failed: ${error.message}` : "TalkingData request failed.", "TALKINGDATA_NETWORK_ERROR", 502);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = errorMessageFrom(body) || `HTTP ${response.status}`;
    throw new AIProviderHTTPError(`TalkingData request failed (${response.status}): ${detail}`, response.status, body);
  }
  return body as T;
}

const FULL_MODEL = "T0601002";
const uniqueUrls = (values: Array<string | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];

export async function createTalkingDataAsset(input: { url: string; name?: string; assetType: "Image" | "Video" | "Audio" }) {
  if (!/^https:\/\//i.test(input.url)) throw new AIProviderError("TalkingData private assets require a publicly accessible HTTPS URL.", "TALKINGDATA_ASSET_URL_REQUIRED", 400);
  const raw = await requestTalkingData<RecordValue>(`/model/openai/api/v3/open/CreateAsset?requestId=${encodeURIComponent(requestId())}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: FULL_MODEL, url: input.url, ...(input.name ? { name: input.name.slice(0, 64) } : {}), AssetType: input.assetType }) });
  const id = taskIdFrom(raw);
  if (!id) throw new AIProviderError("TalkingData accepted the asset request but did not return an asset id.", "TALKINGDATA_ASSET_ID_MISSING", 502);
  return { id, raw };
}

export async function getTalkingDataAsset(id: string) {
  if (!id.trim()) throw new AIProviderError("TalkingData asset id is required.", "TALKINGDATA_ASSET_ID_REQUIRED", 400);
  return requestTalkingData<RecordValue>("/model/openai/api/v3/open/GetAsset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: FULL_MODEL, Id: id.trim() }) });
}

export async function createTalkingDataVideo(input: { prompt: string; model?: string; image?: string; referenceImageUrls?: string[]; referenceVideoUrls?: string[]; referenceAudioUrls?: string[]; referenceImageAssetUrl?: string; referenceVideoAssetUrl?: string; referenceAudioAssetUrl?: string; duration?: number; ratio?: string; resolution?: string; generateAudio?: boolean; imageMode?: "first-frame" | "first-last-frame" | "reference"; endImage?: string; omniReferenceTaskType?: "auto" | "reference" | "edit" | "extend"; outputFormat?: "mp4" | "mov"; watermark?: boolean; returnLastFrame?: boolean; webSearch?: boolean }) {
  const prompt = input.prompt.trim();
  const model = input.model || process.env.TALKINGDATA_VIDEO_MODEL || FULL_MODEL;
  const images = uniqueUrls([input.image, ...(input.referenceImageUrls || []), input.referenceImageAssetUrl]);
  const videos = uniqueUrls([...(input.referenceVideoUrls || []), input.referenceVideoAssetUrl]);
  const audios = uniqueUrls([...(input.referenceAudioUrls || []), input.referenceAudioAssetUrl]);
  const isFullModel = model === FULL_MODEL;
  if (isFullModel) {
    if (!prompt && !images.length && !videos.length && !audios.length) throw new AIProviderError("TalkingData 云筑81 requires text, image, video, or audio input.", "TALKINGDATA_VIDEO_INPUT_REQUIRED", 400);
    if (images.length > 30 || videos.length > 10 || audios.length > 10) throw new AIProviderError("TalkingData 云筑81 supports at most 30 images, 10 videos, and 10 audio inputs.", "TALKINGDATA_TOO_MANY_REFERENCES", 400);
    const duration = input.duration ?? 5;
    if (!Number.isInteger(duration) || (duration !== -1 && (duration < 4 || duration > 30))) throw new AIProviderError("TalkingData 云筑81 duration must be -1 (automatic) or an integer from 4 to 30 seconds.", "TALKINGDATA_INVALID_DURATION", 400);
    const requestedRatio = input.ratio || "adaptive";
    if (!["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].includes(requestedRatio)) throw new AIProviderError("TalkingData 云筑81 video ratio is invalid.", "TALKINGDATA_INVALID_RATIO", 400);
    const imageMode = input.imageMode || "first-frame";
    const endImage = text(input.endImage);
    const imageInputs = uniqueUrls([...images, ...(endImage ? [endImage] : [])]);
    if (imageMode === "first-frame" && imageInputs.length > 1) throw new AIProviderError("TalkingData first-frame image-to-video accepts exactly one image.", "TALKINGDATA_INVALID_IMAGE_MODE", 400);
    if (imageMode === "first-last-frame" && imageInputs.length !== 2) throw new AIProviderError("TalkingData first/last-frame mode requires exactly two images.", "TALKINGDATA_INVALID_IMAGE_MODE", 400);
    const taskType = input.omniReferenceTaskType || "auto";
    const isMultimodalReference = imageMode === "reference" || videos.length > 0 || audios.length > 0;
    if ((taskType === "edit" || taskType === "extend") && !isMultimodalReference) throw new AIProviderError("TalkingData edit and extend modes require a reference video.", "TALKINGDATA_INVALID_TASK_TYPE", 400);
    if (taskType === "edit" && (!videos.length || requestedRatio !== "adaptive" || duration !== -1)) throw new AIProviderError("TalkingData edit mode requires a reference video, adaptive ratio, and automatic duration (-1).", "TALKINGDATA_INVALID_EDIT_INPUT", 400);
    if (taskType === "extend" && (!videos.length || requestedRatio !== "adaptive")) throw new AIProviderError("TalkingData extend mode requires a reference video and adaptive ratio.", "TALKINGDATA_INVALID_EXTEND_INPUT", 400);
    const ratio = (imageMode === "first-frame" || imageMode === "first-last-frame") && imageInputs.length ? "adaptive" : requestedRatio;
    const resolution = input.resolution || "720p";
    if (!["480p", "720p", "1080p"].includes(resolution)) throw new AIProviderError("TalkingData 云筑81 resolution must be 480p, 720p, or 1080p.", "TALKINGDATA_INVALID_RESOLUTION", 400);
    const content: Array<Record<string, unknown>> = prompt ? [{ type: "text", text: prompt }] : [];
    imageInputs.forEach((url, index) => content.push({ type: "image_url", image_url: { url }, role: imageMode === "reference" ? "reference_image" : imageMode === "first-last-frame" && index === 1 ? "last_frame" : "first_frame" }));
    videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
    audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
    const raw = await requestTalkingData<RecordValue>(`/model/openai/api/v3/contents/generations/tasks?requestId=${encodeURIComponent(requestId())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, content, duration, ratio, resolution, generate_audio: input.generateAudio ?? false, watermark: input.watermark ?? false, return_last_frame: input.returnLastFrame ?? false, output_format: input.outputFormat || "mp4", ...(isMultimodalReference ? { omni_reference_task_type: taskType } : {}), ...(input.webSearch ? { tools: [{ type: "web_search" }] } : {}) }),
    });
    const taskId = taskIdFrom(raw);
    if (!taskId) throw new AIProviderError("TalkingData accepted the video request but did not return a task id.", "TALKINGDATA_TASK_ID_MISSING", 502);
    return { taskId, status: "pending" as const, skipAspectRatioValidation: imageInputs.length > 0, request: { model, imageCount: imageInputs.length, videoCount: videos.length, audioCount: audios.length, imageMode, taskType, duration, ratio, resolution, generateAudio: input.generateAudio ?? false, outputFormat: input.outputFormat || "mp4", watermark: input.watermark ?? false, returnLastFrame: input.returnLastFrame ?? false, webSearch: input.webSearch ?? false }, raw };
  }
  if (!prompt) throw new AIProviderError("TalkingData video requires a prompt.", "TALKINGDATA_VIDEO_PROMPT_REQUIRED", 400);
  const duration = input.duration ?? 5;
  if (duration !== 5) throw new AIProviderError("TalkingData T0101009 currently supports 5-second videos only.", "TALKINGDATA_INVALID_DURATION", 400);
  const ratio = input.ratio || "16:9";
  if (!["16:9", "9:16", "1:1"].includes(ratio)) throw new AIProviderError("TalkingData video ratio must be 16:9, 9:16, or 1:1.", "TALKINGDATA_INVALID_RATIO", 400);
  const resolution = input.resolution || "480p";
  if (resolution !== "480p") throw new AIProviderError("TalkingData T0101009 currently supports 480p only.", "TALKINGDATA_INVALID_RESOLUTION", 400);
  const raw = await requestTalkingData<RecordValue>(`/model/openai/api/v3/contents/generations/tasks?requestId=${encodeURIComponent(requestId())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, content: [{ type: "text", text: prompt }], duration, ratio, resolution, generate_audio: input.generateAudio ?? false }),
  });
  const taskId = taskIdFrom(raw);
  if (!taskId) throw new AIProviderError("TalkingData accepted the video request but did not return a task id.", "TALKINGDATA_TASK_ID_MISSING", 502);
  return { taskId, status: "pending" as const, request: { duration, ratio, resolution, generateAudio: input.generateAudio ?? false }, raw };
}

export async function pollTalkingDataVideo(taskId: string) {
  const raw = await requestTalkingData<RecordValue>(`/model/openai/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const value = taskValue(raw);
  const resolvedTaskId = taskIdFrom(raw) || taskId;
  const rawStatus = text(value.status) || text(value.state);
  const status = statusFrom(rawStatus, true);
  return { taskId: resolvedTaskId, status, rawStatus, videoUrl: videoUrlFrom(raw), resultUrl: videoUrlFrom(raw), lastFrameUrl: lastFrameUrlFrom(raw), errorMessage: status === "failed" ? errorMessageFrom(raw) || "TalkingData video generation failed." : undefined, raw };
}
