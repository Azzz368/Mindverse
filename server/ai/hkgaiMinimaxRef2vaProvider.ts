import "server-only";

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIProviderError } from "./errors";
import { requestHKGAIOpenAI } from "./hkgaiClient";
import type { HKGAIVideoTask } from "./hkgaiVideoProvider";

const MODEL = "t2_minimax-h3_bf16_ref2va";
const DEFAULT_DURATION_SECONDS = 4;
const MIN_DURATION_SECONDS = 4;
const MAX_DURATION_SECONDS = 15;
const DEFAULT_AUDIO_FLOW_SHIFT = 3;
const MAX_VIDEO_REFERENCES = 3;
const MAX_REFERENCE_BYTES = Number(process.env.HKGAI_REF2VA_MAX_REFERENCE_BYTES || 256 * 1024 * 1024);
const MAX_TOTAL_REFERENCE_BYTES = Number(process.env.HKGAI_REF2VA_MAX_TOTAL_REFERENCE_BYTES || 512 * 1024 * 1024);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.HKGAI_REF2VA_DOWNLOAD_TIMEOUT_MS || 300_000);
const MAX_TOTAL_VIDEO_DURATION_SECONDS = 15;
const PROBE_TIMEOUT_MS = 60_000;

type RecordValue = Record<string, unknown>;
type MediaKind = "image" | "video" | "audio";
type DownloadedMedia = { buffer: Buffer; mimeType: string; extension: string };

const require = createRequire(import.meta.url);
const ffprobeStatic = require("ffprobe-static") as { path?: string };

const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const unique = (values: Array<string | undefined>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];

const taskIdFrom = (raw: unknown) => {
  const root = record(raw);
  const data = record(root.data);
  return text(data.task_id) || text(data.taskId) || text(data.id) || text(root.task_id) || text(root.taskId) || text(root.id);
};

const bundledFfprobePath = () => process.platform === "win32"
  ? join(process.cwd(), "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe")
  : join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");

const ffprobeExecutable = () => [process.env.FFPROBE_PATH?.trim(), ffprobeStatic.path, bundledFfprobePath()]
  .filter((value): value is string => Boolean(value))
  .find((value) => existsSync(value)) || process.env.FFPROBE_PATH?.trim() || ffprobeStatic.path || "ffprobe";

const runFfprobe = (filePath: string) => new Promise<{ duration: number; hasAudio: boolean }>((resolve, reject) => {
  const child = spawn(ffprobeExecutable(), [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type",
    "-of", "json",
    filePath,
  ], { windowsHide: true });
  let stdout = "";
  let stderr = "";
  const timeout = setTimeout(() => child.kill(), PROBE_TIMEOUT_MS);
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", (error) => { clearTimeout(timeout); reject(error); });
  child.on("close", (code) => {
    clearTimeout(timeout);
    if (code !== 0) return reject(new Error(stderr.trim() || `ffprobe exited with code ${code}.`));
    try {
      const raw = JSON.parse(stdout) as { format?: { duration?: unknown }; streams?: Array<{ codec_type?: unknown }> };
      const duration = Number(raw.format?.duration);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Video duration is unavailable.");
      resolve({ duration, hasAudio: raw.streams?.some((stream) => stream.codec_type === "audio") === true });
    } catch (error) {
      reject(error);
    }
  });
});

const probeVideo = async (video: DownloadedMedia, index: number) => {
  const directory = await mkdtemp(join(tmpdir(), "mindverse-ref2va-"));
  const filePath = join(directory, `reference-${index + 1}.${video.extension}`);
  try {
    await writeFile(filePath, video.buffer);
    return await runFfprobe(filePath);
  } catch (error) {
    throw new AIProviderError(`Could not inspect minimax_ref2va video ${index + 1}: ${error instanceof Error ? error.message : "unknown error"}`, "HKGAI_REF2VA_VIDEO_PROBE_FAILED", 422);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
};

const mediaDefaults = (kind: MediaKind) => kind === "image"
  ? { mimeType: "image/png", extension: "png" }
  : kind === "video"
    ? { mimeType: "video/mp4", extension: "mp4" }
    : { mimeType: "audio/mpeg", extension: "mp3" };

const extensionFrom = (mimeType: string, kind: MediaKind) => {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "video/quicktime") return "mov";
  if (normalized === "video/webm") return "webm";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return "wav";
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a") return "m4a";
  if (normalized === "audio/ogg") return "ogg";
  return mediaDefaults(kind).extension;
};

const assertMimeType = (mimeType: string, kind: MediaKind) => {
  const normalized = mimeType.toLowerCase();
  const valid = kind === "image"
    ? ["image/png", "image/jpeg", "image/webp"].includes(normalized)
    : kind === "video"
      ? ["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"].includes(normalized)
      : ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "application/octet-stream"].includes(normalized);
  if (!valid) throw new AIProviderError(`minimax_ref2va does not accept ${mimeType} as a ${kind} reference.`, "HKGAI_REF2VA_INVALID_MEDIA_TYPE", 400);
};

const inlineMedia = (url: string, kind: MediaKind): DownloadedMedia | undefined => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(url);
  if (!match) return undefined;
  const mimeType = match[1].toLowerCase();
  assertMimeType(mimeType, kind);
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.byteLength || buffer.byteLength > MAX_REFERENCE_BYTES) {
    throw new AIProviderError("A minimax_ref2va inline reference is empty or exceeds Mindverse's upload safety limit.", "HKGAI_REF2VA_INVALID_MEDIA_SIZE", 400);
  }
  return { buffer, mimeType, extension: extensionFrom(mimeType, kind) };
};

const downloadMedia = async (url: string, kind: MediaKind): Promise<DownloadedMedia> => {
  const inline = inlineMedia(url, kind);
  if (inline) return inline;
  if (!/^https:\/\//i.test(url)) {
    throw new AIProviderError("minimax_ref2va references must use HTTPS or a base64 data URL.", "HKGAI_REF2VA_INVALID_REFERENCE_URL", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new AIProviderError(`Could not download a minimax_ref2va ${kind} reference (HTTP ${response.status}).`, "HKGAI_REF2VA_REFERENCE_DOWNLOAD_FAILED", 422);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REFERENCE_BYTES) {
      throw new AIProviderError("A minimax_ref2va reference exceeds Mindverse's upload safety limit.", "HKGAI_REF2VA_REFERENCE_TOO_LARGE", 400);
    }
    const fallback = mediaDefaults(kind);
    const mimeType = (response.headers.get("content-type") || fallback.mimeType).split(";")[0].toLowerCase();
    assertMimeType(mimeType, kind);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength || buffer.byteLength > MAX_REFERENCE_BYTES) {
      throw new AIProviderError("A minimax_ref2va reference is empty or exceeds Mindverse's upload safety limit.", "HKGAI_REF2VA_INVALID_MEDIA_SIZE", 400);
    }
    return { buffer, mimeType: mimeType === "application/octet-stream" ? fallback.mimeType : mimeType, extension: extensionFrom(mimeType, kind) };
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AIProviderError("Downloading a minimax_ref2va reference timed out.", "HKGAI_REF2VA_REFERENCE_TIMEOUT", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const safeNumber = (value: number | undefined, fallback: number, name: string) => {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) throw new AIProviderError(`minimax_ref2va ${name} must be a finite number.`, "HKGAI_REF2VA_INVALID_EXTRA_PARAM", 400);
  return resolved;
};

export async function createHKGAIMinimaxRef2vaVideo(input: {
  prompt: string;
  image?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  duration?: number;
  audioFlowShift?: number;
}): Promise<HKGAIVideoTask & { skipAspectRatioValidation: true }> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new AIProviderError("minimax_ref2va requires a video prompt.", "HKGAI_REF2VA_PROMPT_REQUIRED", 400);

  const imageUrls = unique([input.image, ...(input.referenceImageUrls || [])]);
  const videoUrls = unique(input.referenceVideoUrls || []);
  const audioUrls = unique(input.referenceAudioUrls || []);
  const videoMode = videoUrls.length > 0;

  if (videoMode) {
    if (imageUrls.length) throw new AIProviderError("minimax_ref2va cannot mix image and video references. Use either image + audio, or 1–3 videos.", "HKGAI_REF2VA_IMAGE_VIDEO_CONFLICT", 400);
    if (audioUrls.length) throw new AIProviderError("minimax_ref2va video-reference mode uses each video's own audio track and does not accept a separate audio reference.", "HKGAI_REF2VA_VIDEO_AUDIO_CONFLICT", 400);
    if (videoUrls.length > MAX_VIDEO_REFERENCES) throw new AIProviderError("minimax_ref2va accepts at most 3 video references, with a combined duration of at most 15 seconds.", "HKGAI_REF2VA_TOO_MANY_VIDEOS", 400);
  } else if (imageUrls.length !== 1 || audioUrls.length !== 1) {
    throw new AIProviderError("minimax_ref2va requires exactly 1 image + 1 audio, or 1–3 videos with their own audio tracks.", "HKGAI_REF2VA_INPUT_REQUIRED", 400);
  }

  const duration = safeNumber(input.duration, DEFAULT_DURATION_SECONDS, "duration");
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new AIProviderError("minimax_ref2va duration must be an integer from 4 to 15 seconds.", "HKGAI_REF2VA_INVALID_DURATION", 400);
  }
  const audioFlowShift = safeNumber(input.audioFlowShift, DEFAULT_AUDIO_FLOW_SHIFT, "audio_flow_shift");
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("extra_params", JSON.stringify({ task: "ref2va", duration, audio_flow_shift: audioFlowShift }));

  let totalBytes = 0;
  let totalVideoDuration = 0;
  if (videoMode) {
    for (let index = 0; index < videoUrls.length; index += 1) {
      const video = await downloadMedia(videoUrls[index], "video");
      totalBytes += video.buffer.byteLength;
      if (totalBytes > MAX_TOTAL_REFERENCE_BYTES) throw new AIProviderError("The combined minimax_ref2va references exceed Mindverse's upload safety limit.", "HKGAI_REF2VA_REFERENCES_TOO_LARGE", 400);
      const probe = await probeVideo(video, index);
      if (!probe.hasAudio) throw new AIProviderError(`minimax_ref2va video ${index + 1} has no audio track. Video mode requires references with their own audio.`, "HKGAI_REF2VA_VIDEO_AUDIO_REQUIRED", 400);
      totalVideoDuration += probe.duration;
      if (totalVideoDuration > MAX_TOTAL_VIDEO_DURATION_SECONDS + 0.05) throw new AIProviderError("minimax_ref2va reference videos may be at most 15 seconds in total.", "HKGAI_REF2VA_VIDEO_DURATION_EXCEEDED", 400);
      form.append("input_references", new Blob([Uint8Array.from(video.buffer)], { type: video.mimeType }), `reference-video-${index + 1}.${video.extension}`);
    }
  } else {
    const [image, audio] = await Promise.all([downloadMedia(imageUrls[0], "image"), downloadMedia(audioUrls[0], "audio")]);
    totalBytes = image.buffer.byteLength + audio.buffer.byteLength;
    if (totalBytes > MAX_TOTAL_REFERENCE_BYTES) throw new AIProviderError("The combined minimax_ref2va references exceed Mindverse's upload safety limit.", "HKGAI_REF2VA_REFERENCES_TOO_LARGE", 400);
    form.append("input_reference", new Blob([Uint8Array.from(image.buffer)], { type: image.mimeType }), `reference-image.${image.extension}`);
    form.append("audio_reference", JSON.stringify({ audio_url: `data:${audio.mimeType};base64,${audio.buffer.toString("base64")}` }));
  }

  const raw = await requestHKGAIOpenAI<RecordValue>("/videos", { method: "POST", body: form, timeoutMs: Number(process.env.HKGAI_REF2VA_REQUEST_TIMEOUT_MS || 600_000) });
  const taskId = taskIdFrom(raw);
  if (!taskId) throw new AIProviderError("HKGAI accepted the minimax_ref2va request but did not return a task_id.", "HKGAI_REF2VA_TASK_ID_MISSING", 502);
  return {
    taskId,
    status: "pending",
    rawStatus: text(record(raw).status),
    request: {
      model: MODEL,
      mode: videoMode ? "video" : "image-audio",
      promptLength: Array.from(prompt).length,
      referenceImageCount: imageUrls.length,
      referenceVideoCount: videoUrls.length,
      referenceAudioCount: audioUrls.length,
      ...(videoMode ? { totalReferenceVideoDuration: totalVideoDuration } : {}),
      duration,
      audioFlowShift,
      transport: "POST /v1/videos",
    },
    skipAspectRatioValidation: true,
    raw,
  };
}
