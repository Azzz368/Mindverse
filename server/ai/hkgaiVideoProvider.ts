import "server-only";

import { Buffer } from "node:buffer";
import { requestHKGAIOpenAI, requestHKGAIOpenAIBuffer } from "./hkgaiClient";
import { AIProviderError, AIProviderHTTPError } from "./errors";
import { archiveMediaBuffer } from "@/server/storage/mediaArchive";

const MINIMAX_H3_MODEL = "t2_minimax-h3_bf16_7k2p";
const MAX_PROMPT_LENGTH = 7000;
const MAX_REFERENCE_IMAGES = 2;
const MAX_REFERENCE_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 120_000;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 15;
const VIDEO_SIZE_BY_ASPECT_RATIO = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "1:1": "1024x1024",
} as const;

type RecordValue = Record<string, unknown>;
type HKGAIVideoStatus = "pending" | "running" | "completed" | "failed";
export type HKGAIVideoTask = {
  taskId?: string;
  status: HKGAIVideoStatus;
  rawStatus?: string;
  progress?: number;
  videoUrl?: string;
  resultUrl?: string;
  errorMessage?: string;
  archivedMedia?: unknown[];
  request?: unknown;
  raw?: unknown;
};

const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;

const taskRecord = (raw: unknown) => {
  const root = record(raw);
  const data = record(root.data);
  return Object.keys(data).length ? { ...root, ...data } : root;
};

const taskIdFrom = (raw: unknown) => {
  const value = taskRecord(raw);
  return text(value.task_id) || text(value.taskId) || text(value.id);
};

const statusFrom = (value: unknown, hasTask: boolean): HKGAIVideoStatus => {
  const status = (text(value) || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "complete", "succeeded", "success", "done"].includes(status)) return "completed";
  if (["failed", "failure", "error", "cancelled", "canceled", "expired"].includes(status)) return "failed";
  if (["running", "processing", "in_progress", "generating"].includes(status)) return "running";
  return hasTask ? "pending" : "failed";
};

const errorMessageFrom = (raw: unknown) => {
  const value = taskRecord(raw);
  const error = record(value.error);
  return text(error.message) || text(value.error_message) || text(value.message);
};

const dataUrlImage = (url: string) => {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url);
  if (!match) return undefined;
  return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1].toLowerCase() };
};

const downloadReferenceImage = async (url: string) => {
  const inline = dataUrlImage(url);
  if (inline) {
    if (inline.buffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) throw new AIProviderError("HKGAI reference image exceeds the 25 MB limit.", "HKGAI_REFERENCE_TOO_LARGE", 400);
    return inline;
  }
  if (!/^https:\/\//i.test(url)) throw new AIProviderError("HKGAI reference images must use HTTPS or a base64 image data URL.", "HKGAI_INVALID_REFERENCE", 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: controller.signal, headers: { Accept: "image/png,image/jpeg,image/webp" } });
    if (!response.ok) throw new AIProviderError(`Could not download HKGAI reference image (HTTP ${response.status}).`, "HKGAI_REFERENCE_DOWNLOAD_FAILED", 422);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REFERENCE_IMAGE_BYTES) throw new AIProviderError("HKGAI reference image exceeds the 25 MB limit.", "HKGAI_REFERENCE_TOO_LARGE", 400);
    const mimeType = (response.headers.get("content-type") || "image/png").split(";")[0].toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) throw new AIProviderError("HKGAI reference images must be PNG, JPEG, or WebP.", "HKGAI_INVALID_REFERENCE_TYPE", 400);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength || buffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) throw new AIProviderError("HKGAI reference image is empty or exceeds the 25 MB limit.", "HKGAI_INVALID_REFERENCE_SIZE", 400);
    return { buffer, mimeType };
  } finally {
    clearTimeout(timeout);
  }
};

const extensionFor = (mimeType: string) => mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";

const uniqueReferences = (image: string | undefined, referenceImageUrls: string[] | undefined) =>
  [...new Set([image, ...(referenceImageUrls || [])].map((item) => item?.trim()).filter((item): item is string => Boolean(item)))];

const durationFor = (value: number | undefined) => {
  const duration = value ?? MIN_DURATION_SECONDS;
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new AIProviderError("minimax_h3 duration must be an integer from 5 to 15 seconds.", "HKGAI_INVALID_VIDEO_DURATION", 400);
  }
  return duration;
};

const aspectRatioFor = (value: string | undefined) => {
  const aspectRatio = value || "16:9";
  if (!(aspectRatio in VIDEO_SIZE_BY_ASPECT_RATIO)) {
    throw new AIProviderError("minimax_h3 aspect ratio must be 16:9, 9:16, or 1:1.", "HKGAI_INVALID_VIDEO_ASPECT_RATIO", 400);
  }
  return aspectRatio as keyof typeof VIDEO_SIZE_BY_ASPECT_RATIO;
};

export async function createHKGAIMinimaxVideo(input: { prompt: string; image?: string; referenceImageUrls?: string[]; duration?: number; aspectRatio?: string }): Promise<HKGAIVideoTask> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new AIProviderError("minimax_h3 requires a video prompt.", "HKGAI_VIDEO_PROMPT_REQUIRED", 400);
  if (Array.from(prompt).length > MAX_PROMPT_LENGTH) throw new AIProviderError("minimax_h3 prompts support at most 7,000 characters.", "HKGAI_VIDEO_PROMPT_TOO_LONG", 400);
  const references = uniqueReferences(input.image, input.referenceImageUrls);
  if (references.length > MAX_REFERENCE_IMAGES) throw new AIProviderError("minimax_h3 accepts at most 2 reference images.", "HKGAI_TOO_MANY_REFERENCES", 400);
  const duration = durationFor(input.duration);
  const aspectRatio = aspectRatioFor(input.aspectRatio);

  const form = new FormData();
  form.append("model", MINIMAX_H3_MODEL);
  form.append("prompt", prompt);
  form.append("seconds", String(duration));
  form.append("size", VIDEO_SIZE_BY_ASPECT_RATIO[aspectRatio]);
  for (let index = 0; index < references.length; index += 1) {
    const image = await downloadReferenceImage(references[index]);
    form.append("input_reference", new Blob([image.buffer], { type: image.mimeType }), `reference-${index + 1}.${extensionFor(image.mimeType)}`);
  }

  const raw = await requestHKGAIOpenAI<RecordValue>("/videos", { method: "POST", body: form });
  const taskId = taskIdFrom(raw);
  if (!taskId) throw new AIProviderError("HKGAI accepted the minimax_h3 request but did not return a task_id.", "HKGAI_VIDEO_TASK_ID_MISSING", 502);
  const value = taskRecord(raw);
  const rawStatus = text(value.status);
  const normalizedStatus = statusFrom(rawStatus, true);
  return {
    taskId,
    status: normalizedStatus === "failed" ? "failed" : "pending",
    rawStatus,
    progress: number(value.progress),
    errorMessage: errorMessageFrom(raw),
    request: { model: MINIMAX_H3_MODEL, promptLength: Array.from(prompt).length, referenceImageCount: references.length, duration, aspectRatio, size: VIDEO_SIZE_BY_ASPECT_RATIO[aspectRatio], transport: "POST /v1/videos" },
    raw,
  };
}

export async function pollHKGAIMinimaxVideo(taskId: string): Promise<HKGAIVideoTask> {
  const raw = await requestHKGAIOpenAI<RecordValue>(`/videos/${encodeURIComponent(taskId)}`, { method: "GET" });
  const value = taskRecord(raw);
  const resolvedTaskId = taskIdFrom(raw) || taskId;
  const rawStatus = text(value.status);
  const status = statusFrom(rawStatus, true);
  const base = {
    taskId: resolvedTaskId,
    status,
    rawStatus,
    progress: number(value.progress),
    errorMessage: errorMessageFrom(raw),
    raw,
  } satisfies HKGAIVideoTask;
  if (status !== "completed") return base;

  try {
    const content = await requestHKGAIOpenAIBuffer(`/videos/${encodeURIComponent(resolvedTaskId)}/content`, {
      method: "GET",
      headers: { Accept: "video/mp4,video/*,application/octet-stream" },
      timeoutMs: Number(process.env.HKGAI_VIDEO_CONTENT_TIMEOUT_MS || 300_000),
    });
    const buffer = Buffer.from(content.arrayBuffer);
    if (!buffer.byteLength) throw new AIProviderError("HKGAI returned an empty video file.", "HKGAI_VIDEO_CONTENT_EMPTY", 502);
    const archived = await archiveMediaBuffer(buffer, "video", content.mimeType || "video/mp4", { sourceProvider: "hkgai", sourceTaskId: resolvedTaskId });
    if (!archived) throw new AIProviderError("HKGAI video completed, but the output could not be archived.", "HKGAI_VIDEO_ARCHIVE_FAILED", 502);
    return { ...base, videoUrl: archived.cdnUrl, resultUrl: archived.cdnUrl, archivedMedia: [archived] };
  } catch (error) {
    if (error instanceof AIProviderHTTPError && [404, 409, 425].includes(error.status)) return { ...base, status: "running", rawStatus: "content_pending" };
    throw error;
  }
}
