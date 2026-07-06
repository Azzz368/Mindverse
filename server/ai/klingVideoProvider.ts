import "server-only";
import { Buffer } from "node:buffer";
import { AIProviderError } from "./errors";

type RecordValue = Record<string, unknown>;
type KlingTaskStatus = "completed" | "pending" | "running" | "failed";
type KlingTask = { taskId?: string; videoUrl?: string; status: KlingTaskStatus; rawStatus?: string; raw: unknown };

const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const origin = () => (process.env.KLING_API_ORIGIN || "https://api-singapore.klingai.com").replace(/\/$/, "");
const createPath = () => process.env.KLING_IMAGE_TO_VIDEO_PATH || "/v1/videos/image2video";
const pollPathTemplate = () => process.env.KLING_IMAGE_TO_VIDEO_POLL_PATH_TEMPLATE || `${createPath()}/{taskId}`;
const compact = (value: RecordValue): RecordValue => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));

const messageFrom = (body: unknown) => {
  if (typeof body === "string" && body.trim()) return body.trim();
  const root = record(body), data = record(root.data), error = record(root.error);
  return text(root.message) || text(error.message) || text(data.message) || "Kling request failed.";
};

async function klingRequest<T>(path: string, init: RequestInit = {}) {
  const key = process.env.KLING_API_KEY;
  if (!key || key === "********" || key === "your-kling-api-key-here") throw new AIProviderError("Kling API key is missing. Please set KLING_API_KEY in your server environment.", "KLING_CONFIG_ERROR", 500);
  const response = await fetch(path.startsWith("http") ? path : `${origin()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", ...init.headers } });
  const raw = await response.text();
  let body: unknown = raw;
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* keep provider text */ }
  if (!response.ok) throw new AIProviderError(`Kling request failed (${response.status}): ${messageFrom(body)}`, "KLING_HTTP_ERROR", response.status);
  const code = record(body).code;
  if (typeof code === "number" && code !== 0) throw new AIProviderError(`Kling rejected the request: ${messageFrom(body)}`, "KLING_API_ERROR", 400);
  return body as T;
}

const isSupportedFirstFrame = (image: string) => {
  if (/^data:image\/(?:jpe?g|png);base64,/i.test(image)) return true;
  if (/^data:image\//i.test(image)) return false;
  return /^https?:\/\//i.test(image);
};

// Official Kling requires raw base64 WITHOUT the "data:image/...;base64," prefix.
const klingImageValue = (image: string) => {
  const dataMatch = /^data:image\/(?:jpe?g|png);base64,(.+)$/i.exec(image);
  return dataMatch ? dataMatch[1] : image;
};

// Kling can sometimes fail to download third-party HTTPS images (302.ai temporary/protected URLs),
// producing an "empty content" error. To be safe we fetch the image server-side and inline it as
// raw base64. Data URLs are stripped of their prefix; jpg/png/webp are accepted by Kling.
const resolveKlingImage = async (image: string, label: string): Promise<string> => {
  if (/^data:image\//i.test(image)) return klingImageValue(image);
  if (!/^https?:\/\//i.test(image)) throw new AIProviderError(`Kling ${label} must be an HTTPS image URL or a JPG/PNG base64 data URL.`, "INVALID_KLING_FIRST_FRAME", 400);
  try {
    const res = await fetch(image, { cache: "no-store", redirect: "follow" });
    if (!res.ok) throw new AIProviderError(`Kling could not download the ${label} (HTTP ${res.status}). Make sure the image URL is publicly accessible.`, "KLING_IMAGE_DOWNLOAD_ERROR", 422);
    const contentType = (res.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    if (contentType === "image/svg+xml") throw new AIProviderError(`Kling ${label} cannot be an SVG. Mock/preview images produce SVG and are not supported — run a real image model first.`, "KLING_IMAGE_FORMAT", 422);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new AIProviderError(`Kling ${label} downloaded as an empty file.`, "KLING_IMAGE_EMPTY", 422);
    if (buffer.length > 10 * 1024 * 1024) throw new AIProviderError(`Kling ${label} exceeds the 10MB limit (${Math.round(buffer.length / 1024 / 1024)}MB).`, "KLING_IMAGE_TOO_LARGE", 422);
    return buffer.toString("base64");
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError(`Kling could not retrieve the ${label}: ${error instanceof Error ? error.message : "unknown error"}`, "KLING_IMAGE_DOWNLOAD_ERROR", 422);
  }
};

const durationFor = (value: number | undefined) => {
  const duration = Math.round(value || Number(process.env.KLING_DEFAULT_DURATION || 5));
  if (duration < 3 || duration > 15) throw new AIProviderError("Kling image-to-video duration must be an integer from 3 to 15 seconds.", "INVALID_KLING_DURATION", 400);
  return String(duration);
};

// Official Kling uses video "mode" std / pro / 4k, not 720p/1080p.
const modeFor = (value: string | undefined) => {
  const raw = (value || process.env.KLING_DEFAULT_MODE || "std").toLowerCase();
  if (raw === "1080p" || raw === "pro") return "pro";
  if (raw === "4k") return "4k";
  return "std";
};

const statusFor = (rawStatus: string | undefined, hasResult: boolean): KlingTaskStatus => {
  const status = rawStatus?.toLowerCase();
  if (hasResult || status === "succeed" || status === "succeeded" || status === "success" || status === "completed") return "completed";
  if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
  if (status === "processing" || status === "running") return "running";
  return "pending";
};

const firstResultUrl = (raw: unknown) => {
  const seen = new Set<object>();
  const visit = (value: unknown, path: string[] = []): string | undefined => {
    if (!value || typeof value !== "object") return undefined;
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const found = visit(item, [...path, String(index)]);
        if (found) return found;
      }
      return undefined;
    }
    const item = record(value);
    for (const key of ["video_url", "videoUrl", "result_url", "resultUrl"]) {
      const found = text(item[key]);
      if (found && /^https?:\/\//i.test(found)) return found;
    }
    const genericUrl = text(item.url);
    const resultPath = path.join(".").toLowerCase();
    if (genericUrl && /^https?:\/\//i.test(genericUrl) && /video|result|output|task/.test(resultPath)) return genericUrl;
    for (const [key, child] of Object.entries(item)) {
      const found = visit(child, [...path, key]);
      if (found) return found;
    }
    return undefined;
  };
  return visit(raw);
};

const normalizeTask = (raw: unknown, fallbackTaskId?: string): KlingTask => {
  const root = record(raw), data = record(root.data);
  const taskId = text(data.task_id) || text(data.id) || text(root.task_id) || text(root.id) || fallbackTaskId;
  const rawStatus = text(data.task_status) || text(data.status) || text(root.status);
  const statusMsg = text(data.task_status_msg);
  const videoUrl = firstResultUrl(raw);
  return { taskId, videoUrl, status: statusFor(rawStatus, Boolean(videoUrl)), rawStatus: statusMsg ? `${rawStatus || ""}: ${statusMsg}` : rawStatus, raw };
};

const pathForTask = (taskId: string) => {
  const encoded = encodeURIComponent(taskId);
  const template = pollPathTemplate().replace(/\{(?:taskId|task_id|id)\}/g, encoded);
  return /\{/.test(template) ? `${template.replace(/\/$/, "")}/${encoded}` : template;
};

export async function createKlingImageVideo(input: { prompt: string; image: string; imageTail?: string; modelName?: string; negativePrompt?: string; duration?: number; resolution?: string; mode?: string; sound?: boolean; callbackUrl?: string; externalTaskId?: string; watermarkEnabled?: boolean }): Promise<KlingTask> {
  if (!input.prompt.trim()) throw new AIProviderError("Kling image-to-video requires a prompt.", "INVALID_KLING_PROMPT", 400);
  if (input.prompt.trim().length > 2500) throw new AIProviderError("Kling image-to-video prompt cannot exceed 2500 characters.", "INVALID_KLING_PROMPT", 400);
  if (!input.image && !input.imageTail) throw new AIProviderError("Kling image-to-video requires a first-frame image (or an end-frame image). Connect a completed Image node or set a reference image URL.", "INVALID_KLING_FIRST_FRAME", 400);
  if (input.image && !isSupportedFirstFrame(input.image)) throw new AIProviderError("Kling image-to-video requires an HTTPS image URL or a JPG/PNG base64 data URL for the first frame.", "INVALID_KLING_FIRST_FRAME", 400);
  if (input.imageTail && !isSupportedFirstFrame(input.imageTail)) throw new AIProviderError("Kling end-frame image must be an HTTPS image URL or a JPG/PNG base64 data URL.", "INVALID_KLING_FIRST_FRAME", 400);
  const [imageValue, imageTailValue] = await Promise.all([
    input.image ? resolveKlingImage(input.image, "first-frame image") : Promise.resolve(undefined),
    input.imageTail ? resolveKlingImage(input.imageTail, "end-frame image") : Promise.resolve(undefined),
  ]);
  const body = compact({
    model_name: input.modelName || process.env.KLING_VIDEO_MODEL || "kling-v2-6",
    image: imageValue,
    image_tail: imageTailValue,
    prompt: input.prompt.trim(),
    negative_prompt: input.negativePrompt?.trim() || undefined,
    duration: durationFor(input.duration),
    mode: modeFor(input.mode || input.resolution),
    sound: input.sound === false ? "off" : (process.env.KLING_DEFAULT_SOUND || "off"),
    callback_url: input.callbackUrl || process.env.KLING_CALLBACK_URL,
    external_task_id: input.externalTaskId,
  });
  const raw = await klingRequest(createPath(), { method: "POST", body: JSON.stringify(body) });
  return normalizeTask(raw);
}

export async function pollKlingImageVideo(taskId: string): Promise<KlingTask> {
  const raw = await klingRequest(pathForTask(taskId), { method: "GET" });
  return normalizeTask(raw, taskId);
}