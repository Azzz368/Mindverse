import "server-only";

import { Buffer } from "node:buffer";
import { uploadToBunny } from "./bunnyClient";
import type { ArchivedMedia } from "./mediaTypes";

type MediaType = "image" | "video" | "audio";
type ArchiveContext = { nodeId?: string; projectId?: string; sourceProvider?: string; sourceTaskId?: string };
type ArchiveResultContext = ArchiveContext & { mediaTypeHint?: MediaType };

const dataUrlPattern = /^data:([^;,]+);base64,(.+)$/i;
const mediaFields: Array<{ key: string; originalKey?: string; mediaType: MediaType | "hint" }> = [
  { key: "imageUrl", originalKey: "originalImageUrl", mediaType: "image" },
  { key: "revisedImageUrl", originalKey: "originalImageUrl", mediaType: "image" },
  { key: "videoUrl", originalKey: "originalVideoUrl", mediaType: "video" },
  { key: "finalVideoUrl", originalKey: "originalVideoUrl", mediaType: "video" },
  { key: "audioUrl", originalKey: "originalAudioUrl", mediaType: "audio" },
  { key: "resultUrl", mediaType: "hint" },
];

const dateKey = () => new Date().toISOString().slice(0, 10);
const cleanSegment = (value: string | undefined) => value?.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const mediaDownloadRetries = Math.max(1, Number(process.env.MEDIA_ARCHIVE_DOWNLOAD_RETRIES || 3));
const mediaDownloadTimeoutMs = Math.max(10_000, Number(process.env.MEDIA_ARCHIVE_DOWNLOAD_TIMEOUT_MS || 180_000));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

const errorCauseForLog = (error: unknown) => {
  if (!(error instanceof Error) || !("cause" in error)) return undefined;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause) return undefined;
  if (cause instanceof Error) return { name: cause.name, message: cause.message };
  if (typeof cause === "object") return cause;
  return String(cause);
};

const errorForLog = (error: unknown) => {
  if (!(error instanceof Error)) return error;
  return { name: error.name, message: error.message, cause: errorCauseForLog(error) };
};

const extensionFor = (mimeType: string | undefined, mediaType: MediaType) => {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "video/webm") return "webm";
  if (normalized === "video/quicktime") return "mov";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/mp3") return "mp3";
  if (normalized === "audio/wav") return "wav";
  if (normalized === "audio/aac") return "aac";
  if (normalized === "audio/flac") return "flac";
  return mediaType === "image" ? "png" : mediaType === "video" ? "mp4" : "mp3";
};

const fetchMediaOnce = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Media download timed out after ${mediaDownloadTimeoutMs}ms.`)), mediaDownloadTimeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "video/*,image/*,audio/*,*/*",
        "User-Agent": "Mindverse-Media-Archiver/1.0",
      },
    });
    if (!response.ok) {
      const error = new Error(`Media download failed (${response.status} ${response.statusText}).`) as Error & { retryable?: boolean };
      error.retryable = retryableStatus(response.status);
      throw error;
    }
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType: response.headers.get("content-type") || undefined };
  } finally {
    clearTimeout(timeout);
  }
};

const downloadHttps = async (url: string) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= mediaDownloadRetries; attempt += 1) {
    try {
      return await fetchMediaOnce(url);
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof Error) || (error as Error & { retryable?: boolean }).retryable !== false;
      if (!retryable || attempt >= mediaDownloadRetries) break;
      await pause(Math.min(1000 * 2 ** (attempt - 1), 5000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Media download failed.");
};

const decodeDataUrl = (url: string) => {
  const match = dataUrlPattern.exec(url);
  if (!match) throw new Error("Invalid data URL media payload.");
  return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] };
};

const mediaFromUrl = async (url: string) => {
  if (/^https:\/\//i.test(url)) return downloadHttps(url);
  if (dataUrlPattern.test(url)) return decodeDataUrl(url);
  throw new Error("Only HTTPS URLs and data: base64 URLs can be archived.");
};

const originalKeyFor = (field: { originalKey?: string }, mediaType: MediaType) => field.originalKey || (mediaType === "image" ? "originalImageUrl" : mediaType === "audio" ? "originalAudioUrl" : "originalVideoUrl");

export async function archiveMedia(url: string, mediaType: MediaType, context: ArchiveContext = {}): Promise<ArchivedMedia | null> {
  try {
    if (!url) return null;
    const { buffer, mimeType } = await mediaFromUrl(url);
    if (!buffer.byteLength) throw new Error("Downloaded media is empty.");
    const extension = extensionFor(mimeType, mediaType);
    const projectPrefix = cleanSegment(context.projectId);
    const nodePrefix = cleanSegment(context.nodeId);
    const nameParts = [nodePrefix, crypto.randomUUID()].filter(Boolean).join("-");
    const storageKey = ["canvas", projectPrefix, dateKey(), mediaType, `${nameParts}.${extension}`].filter(Boolean).join("/");
    const cdnUrl = await uploadToBunny(buffer, storageKey, mimeType);
    return {
      storageProvider: "bunny",
      mediaType,
      originalUrl: url,
      cdnUrl,
      storageKey,
      mimeType,
      sizeBytes: buffer.byteLength,
      sourceProvider: context.sourceProvider,
      sourceTaskId: context.sourceTaskId,
    };
  } catch (error) {
    console.error("Bunny media archive failed", { mediaType, originalUrl: url, error: errorForLog(error) });
    return null;
  }
}

export async function archiveResultMedia<T>(result: T, context: ArchiveResultContext = {}): Promise<T> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const output = { ...(result as Record<string, unknown>) };
  const sourceTaskId = context.sourceTaskId || (typeof output.taskId === "string" ? output.taskId : undefined);

  for (const field of mediaFields) {
    const value = output[field.key];
    if (typeof value !== "string" || !value) continue;
    const mediaType = field.mediaType === "hint" ? context.mediaTypeHint || "video" : field.mediaType;
    const archived = await archiveMedia(value, mediaType, { ...context, sourceTaskId });
    if (!archived) continue;
    output[field.key] = archived.cdnUrl;
    const originalKey = originalKeyFor(field, mediaType);
    if (!output[originalKey]) output[originalKey] = value;
    output.archivedMedia = Array.isArray(output.archivedMedia) ? [...output.archivedMedia, archived] : [archived];
  }

  return output as T;
}
