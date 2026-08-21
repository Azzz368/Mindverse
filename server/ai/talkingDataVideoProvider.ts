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
const assetGroupId = () => {
  const value = process.env.TALKINGDATA_ASSET_GROUP_ID?.trim();
  if (!value) throw new AIProviderError("TalkingData private asset group is missing. Set TALKINGDATA_ASSET_GROUP_ID in the server environment.", "TALKINGDATA_ASSET_GROUP_CONFIG_ERROR", 500);
  return value;
};
const assetProjectName = () => process.env.TALKINGDATA_ASSET_PROJECT_NAME?.trim() || "default";
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

const PRIVATE_MODEL = "T0101009";
const uniqueUrls = (values: Array<string | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];

export async function createTalkingDataAsset(input: { url: string; name?: string; assetType: "Image" | "Video" | "Audio" }) {
  if (!/^https:\/\//i.test(input.url)) throw new AIProviderError("TalkingData private assets require a publicly accessible HTTPS URL.", "TALKINGDATA_ASSET_URL_REQUIRED", 400);
  const raw = await requestTalkingData<RecordValue>(`/model/origin/assets/create?requestId=${encodeURIComponent(requestId())}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ GroupId: assetGroupId(), URL: input.url, ...(input.name ? { Name: input.name.slice(0, 64) } : {}), AssetType: input.assetType, ProjectName: assetProjectName() }) });
  const id = text(record(record(raw).Result).Id) || taskIdFrom(raw);
  if (!id) throw new AIProviderError("TalkingData accepted the asset request but did not return an asset id.", "TALKINGDATA_ASSET_ID_MISSING", 502);
  return { id, raw };
}

export async function getTalkingDataAsset(id: string) {
  if (!id.trim()) throw new AIProviderError("TalkingData asset id is required.", "TALKINGDATA_ASSET_ID_REQUIRED", 400);
  const raw = await requestTalkingData<RecordValue>(`/model/origin/assets/get?id=${encodeURIComponent(id.replace(/^asset:\/\//, "").trim())}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ProjectName: assetProjectName() }) });
  const result = record(record(raw).Result);
  const groupId = text(result.GroupId);
  const status = text(result.Status);
  return {
    id: text(result.Id) || id.replace(/^asset:\/\//, "").trim(),
    status,
    groupId,
    projectName: text(result.ProjectName),
    verifiedGroup: groupId === assetGroupId(),
    errorMessage: text(record(result.Error).Message),
    raw,
  };
}

const verifyTalkingDataAssetsForInference = async (values: string[]) => {
  const assetIds = [...new Set(values.filter((value) => value.startsWith("asset://")))];
  for (const assetId of assetIds) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const asset = await getTalkingDataAsset(assetId);
      console.info("TalkingData private asset preflight", { assetId: asset.id, status: asset.status, groupId: asset.groupId, verifiedGroup: asset.verifiedGroup, attempt: attempt + 1 });
      if (!asset.verifiedGroup) throw new AIProviderError(`TalkingData asset ${asset.id} is not in the configured private asset group.`, "TALKINGDATA_ASSET_GROUP_MISMATCH", 400);
      if (asset.status === "Active") break;
      if (asset.status === "Failed") throw new AIProviderError(`TalkingData asset ${asset.id} failed to process: ${asset.errorMessage || "unknown error"}`, "TALKINGDATA_ASSET_FAILED", 400);
      if (attempt === 19) throw new AIProviderError(`TalkingData asset ${asset.id} is still ${asset.status || "processing"} after waiting 20 seconds.`, "TALKINGDATA_ASSET_NOT_ACTIVE", 400);
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
  }
};

const asTalkingDataPrivateAssets = async (values: string[], assetType: "Image" | "Video" | "Audio") => Promise.all(
  values.map(async (value) => {
    if (value.startsWith("asset://")) return value;
    const asset = await createTalkingDataAsset({ url: value, assetType });
    return `asset://${asset.id}`;
  }),
);

export async function createTalkingDataVideo(input: { prompt: string; model?: string; image?: string; referenceImageUrls?: string[]; referenceVideoUrls?: string[]; referenceAudioUrls?: string[]; referenceImageAssetUrl?: string; referenceVideoAssetUrl?: string; referenceAudioAssetUrl?: string; duration?: number; ratio?: string; resolution?: string; generateAudio?: boolean; imageMode?: "first-frame" | "first-last-frame" | "reference"; endImage?: string; omniReferenceTaskType?: "auto" | "reference" | "edit" | "extend"; outputFormat?: "mp4" | "mov"; watermark?: boolean; returnLastFrame?: boolean; webSearch?: boolean }) {
  const prompt = input.prompt.trim();
  const imageMode = input.imageMode || "first-frame";
  const sourceImages = uniqueUrls([input.image, ...(input.referenceImageUrls || []), input.referenceImageAssetUrl]);
  const sourceVideos = uniqueUrls([...(input.referenceVideoUrls || []), input.referenceVideoAssetUrl]);
  const sourceAudios = uniqueUrls([...(input.referenceAudioUrls || []), input.referenceAudioAssetUrl]);
  const sourceEndImage = text(input.endImage);
  const [images, videos, audios, endImage] = await Promise.all([
    asTalkingDataPrivateAssets(sourceImages, "Image"),
    asTalkingDataPrivateAssets(sourceVideos, "Video"),
    asTalkingDataPrivateAssets(sourceAudios, "Audio"),
    sourceEndImage ? asTalkingDataPrivateAssets([sourceEndImage], "Image").then(([asset]) => asset) : Promise.resolve(""),
  ]);
  const configuredModel = process.env.TALKINGDATA_VIDEO_MODEL || PRIVATE_MODEL;
  // The TalkingData integration exclusively uses the configured Yunzhu 80 model.
  const hasPrivateAsset = [...images, ...videos, ...audios, input.endImage].some((value) => typeof value === "string" && value.startsWith("asset://"));
  const model = configuredModel;
  await verifyTalkingDataAssetsForInference([...images, ...videos, ...audios, ...(input.endImage ? [input.endImage] : [])]);
  if (!prompt) throw new AIProviderError("TalkingData video requires a prompt.", "TALKINGDATA_VIDEO_PROMPT_REQUIRED", 400);
  const duration = input.duration ?? 5;
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new AIProviderError("TalkingData T0101009 duration must be an integer from 4 to 30 seconds.", "TALKINGDATA_INVALID_DURATION", 400);
  const ratio = imageMode === "first-frame" || imageMode === "first-last-frame" ? "adaptive" : input.ratio || "adaptive";
  if (!["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].includes(ratio)) throw new AIProviderError("TalkingData video ratio is invalid.", "TALKINGDATA_INVALID_RATIO", 400);
  const resolution = hasPrivateAsset ? "480p" : input.resolution || "480p";
  if (resolution !== "480p") throw new AIProviderError("TalkingData T0101009 currently supports 480p only.", "TALKINGDATA_INVALID_RESOLUTION", 400);
  const imageInputs = uniqueUrls([...images, ...(endImage ? [endImage] : [])]);
  if (imageInputs.length > 2) throw new AIProviderError("TalkingData image input accepts at most two images.", "TALKINGDATA_TOO_MANY_IMAGES", 400);
  if (imageMode === "first-frame" && imageInputs.length > 1) throw new AIProviderError("First-frame mode accepts exactly one image.", "TALKINGDATA_INVALID_IMAGE_MODE", 400);
  if (imageMode === "first-last-frame" && imageInputs.length !== 2) throw new AIProviderError("First/last-frame mode requires exactly two images.", "TALKINGDATA_INVALID_IMAGE_MODE", 400);
  if (imageMode === "reference" && imageInputs.length < 1) throw new AIProviderError("Reference-image mode requires at least one image.", "TALKINGDATA_INVALID_IMAGE_MODE", 400);
  const content: Array<Record<string, unknown>> = prompt ? [{ type: "text", text: prompt }] : [];
  imageInputs.forEach((url, index) => content.push({ type: "image_url", image_url: { url }, role: imageMode === "reference" ? "reference_image" : imageMode === "first-last-frame" && index === 1 ? "last_frame" : "first_frame" }));
  videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
  audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
  const raw = await requestTalkingData<RecordValue>(`/model/openai/api/v3/contents/generations/tasks?requestId=${encodeURIComponent(requestId())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, content, duration, ratio, resolution, generate_audio: input.generateAudio ?? false }),
  });
  const taskId = taskIdFrom(raw);
  if (!taskId) throw new AIProviderError("TalkingData accepted the video request but did not return a task id.", "TALKINGDATA_TASK_ID_MISSING", 502);
  return { taskId, status: "pending" as const, request: { model, duration, ratio, resolution, imageMode, imageCount: imageInputs.length, videoCount: videos.length, audioCount: audios.length, generateAudio: input.generateAudio ?? false }, raw };
}

export async function pollTalkingDataVideo(taskId: string) {
  const raw = await requestTalkingData<RecordValue>(`/model/openai/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const value = taskValue(raw);
  const resolvedTaskId = taskIdFrom(raw) || taskId;
  const rawStatus = text(value.status) || text(value.state);
  const status = statusFrom(rawStatus, true);
  return { taskId: resolvedTaskId, status, rawStatus, videoUrl: videoUrlFrom(raw), resultUrl: videoUrlFrom(raw), lastFrameUrl: lastFrameUrlFrom(raw), errorMessage: status === "failed" ? errorMessageFrom(raw) || "TalkingData video generation failed." : undefined, raw };
}
