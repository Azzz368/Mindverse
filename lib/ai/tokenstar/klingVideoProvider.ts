import "server-only";
import { TokenStarError } from "../errors";
import { tokenstarActionGet, tokenstarActionRequest } from "./tokenstarClient";

export type KlingVideoMode = "text-to-video" | "image-to-video" | "omni";

const SUBMIT_ACTION: Record<KlingVideoMode, string> = {
  "text-to-video": "SubmitTextToVideoJob",
  "image-to-video": "SubmitImageToVideoJob",
  "omni": "SubmitVideoEditKlingJob",
};

const DESCRIBE_ACTION: Record<KlingVideoMode, string> = {
  "text-to-video": "DescribeTextToVideoJob",
  "image-to-video": "DescribeImageToVideoJob",
  "omni": "DescribeVideoEditKlingJob",
};

type KlingTaskStatus = "pending" | "running" | "completed" | "failed";

export type KlingVideoTask = {
  taskId?: string;
  videoUrl?: string;
  status: KlingTaskStatus;
  rawStatus?: string;
  klingMode: KlingVideoMode;
  raw?: unknown;
};

export type KlingElement = {
  elementId: string;
  status?: string;
  raw?: unknown;
};

const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : undefined;

const statusFor = (rawStatus: string | undefined, hasResult: boolean): KlingTaskStatus => {
  if (hasResult) return "completed";
  const s = rawStatus?.trim().toLowerCase();
  if (!s) return "pending";
  if (["succeeded", "success", "done", "completed"].includes(s)) return "completed";
  if (["failed", "failure", "fail", "error", "cancelled", "canceled"].includes(s)) return "failed";
  if (["running", "in_progress", "processing", "queued", "submitted"].includes(s)) return "running";
  return "pending";
};

const normalizeTask = (raw: unknown, mode: KlingVideoMode, fallbackId?: string): KlingVideoTask => {
  const root = record(raw);
  const resp = record(root.Response);
  const taskId = text(resp.JobId) || text(root.JobId) || text(root.id) || text(root.task_id) || text(root.taskId) || fallbackId;
  const videoUrl = text(resp.ResultVideoUrl) || text(root.ResultVideoUrl) || text(root.result_url) || text(root.video_url) || text(root.videoUrl);
  const rawStatus = text(resp.Status) || text(root.Status) || text(root.status);
  return { taskId, videoUrl, status: statusFor(rawStatus, Boolean(videoUrl)), rawStatus, klingMode: mode, raw };
};

const isKlingMode = (v: unknown): v is KlingVideoMode => v === "text-to-video" || v === "image-to-video" || v === "omni";

export type KlingCreateInput = {
  mode?: KlingVideoMode;
  prompt: string;
  model?: string;
  imageUrl?: string;
  videoUrl?: string;
  elementIds?: string[];
  duration?: number;
  ratio?: string;
  resolution?: string;
};

export async function createKlingVideo(input: KlingCreateInput): Promise<KlingVideoTask> {
  const mode: KlingVideoMode = isKlingMode(input.mode) ? input.mode : "image-to-video";
  const defaultModel = mode === "omni"
    ? (process.env.KLING_OMNI_MODEL || "kling-v3-omni")
    : (process.env.KLING_VIDEO_MODEL || "kling-v2-6");
  const model = input.model || defaultModel;

  if (!input.prompt.trim()) throw new TokenStarError("Kling video requires a prompt.", 400);

  const body: Record<string, unknown> = { model, prompt: input.prompt.trim() };
  if (input.ratio) body.ratio = input.ratio;
  if (input.duration) body.duration = input.duration;
  if (input.resolution) body.resolution = input.resolution;

  if (mode === "image-to-video") {
    if (!input.imageUrl) throw new TokenStarError("Kling image-to-video requires a reference image URL. Connect an image node or set a first-frame URL.", 400);
    body.Image = { Url: input.imageUrl };
    if (input.elementIds?.length) body.ElementList = input.elementIds.map((id) => ({ ElementId: id }));
  }

  if (mode === "omni") {
    if (input.videoUrl) {
      body.VideoUrl = input.videoUrl;
    } else if (input.imageUrl) {
      body.Image = { Url: input.imageUrl };
    } else {
      throw new TokenStarError("Kling Omni requires an image URL or a video URL as source input.", 400);
    }
    if (input.elementIds?.length) body.ElementList = input.elementIds.map((id) => ({ ElementId: id }));
  }

  const raw = await tokenstarActionRequest("/v1/video/generations", SUBMIT_ACTION[mode], body);
  return normalizeTask(raw, mode);
}

export async function pollKlingVideo(taskId: string, mode: KlingVideoMode = "image-to-video"): Promise<KlingVideoTask> {
  const safeMode: KlingVideoMode = isKlingMode(mode) ? mode : "image-to-video";
  const raw = await tokenstarActionGet(`/v1/video/generations/${encodeURIComponent(taskId)}`, DESCRIBE_ACTION[safeMode]);
  return normalizeTask(raw, safeMode, taskId);
}

export async function createKlingElement(name: string, imageUrl: string): Promise<KlingElement> {
  if (!name.trim()) throw new TokenStarError("Kling element name is required.", 400);
  if (!imageUrl.trim()) throw new TokenStarError("Kling element image URL is required.", 400);
  if (name.trim().length > 32) throw new TokenStarError("Kling element Name is too long (max 32 characters).", 400);
  const raw = await tokenstarActionRequest("/aigc/element", "CreateAigcElement", { Name: name.trim(), Image: { Url: imageUrl.trim() } });
  const root = record(raw), resp = record(root.Response);
  const elementId = text(resp.ElementId) || text(root.ElementId) || text(root.elementId);
  if (!elementId) throw new TokenStarError("Kling element creation did not return an ElementId.", 502);
  return { elementId, status: text(resp.Status) || text(root.Status), raw };
}

export async function describeKlingElement(elementId: string): Promise<KlingElement> {
  const raw = await tokenstarActionRequest("/aigc/element", "DescribeAigcElement", { ElementId: elementId });
  const root = record(raw), resp = record(root.Response);
  const status = text(resp.Status) || text(root.Status) || text(root.status);
  return { elementId, status, raw };
}

export async function deleteKlingElement(elementId: string): Promise<void> {
  await tokenstarActionRequest("/aigc/element", "DeleteAigcElement", { ElementId: elementId });
}
