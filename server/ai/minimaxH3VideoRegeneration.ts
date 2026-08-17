import "server-only";

import { AIProviderError } from "./errors";
import { requestMiniMax } from "./minimaxClient";

const MODEL = "MiniMax-H3";
const RESOLUTION = "2K";
const MAX_PROMPT_LENGTH = 40_000;

type RecordValue = Record<string, unknown>;
type RegenerationMode = "base-video" | "source-task";

export type MiniMaxH3RegenerationInput = {
  mode?: RegenerationMode;
  sourceTaskId?: string;
  prompt?: string;
  baseVideoUrl?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  aigcWatermark?: boolean;
};

export type MiniMaxH3RegenerationResult = {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  rawStatus?: string;
  videoUrl?: string;
  resultUrl?: string;
  errorMessage?: string;
  resolution?: string;
  duration?: number;
  usage?: RecordValue;
  raw?: RecordValue;
};

const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "";
const unique = (values: string[] | undefined) => [...new Set((values || []).map((value) => value.trim()).filter(Boolean))];

const assertMediaUrl = (value: string, kind: "image" | "video" | "audio", label: string) => {
  const dataPattern = new RegExp(`^data:${kind}/[a-z0-9.+-]+;base64,`, "i");
  if (!/^https:\/\//i.test(value) && !/^mm_file:\/\//i.test(value) && !dataPattern.test(value)) {
    throw new AIProviderError(`${label} must use HTTPS, mm_file://, or a ${kind} base64 data URL.`, "MINIMAX_REGENERATION_INVALID_MEDIA_URL", 400);
  }
};

export async function createMiniMaxH3VideoRegeneration(input: MiniMaxH3RegenerationInput): Promise<MiniMaxH3RegenerationResult> {
  const mode: RegenerationMode = input.mode === "source-task" ? "source-task" : "base-video";
  const payload: RecordValue = { model: MODEL, resolution: RESOLUTION, aigc_watermark: input.aigcWatermark === true };

  if (mode === "source-task") {
    const sourceTaskId = text(input.sourceTaskId);
    if (!sourceTaskId) {
      throw new AIProviderError("MiniMax H3 regeneration by task ID requires source_task_id.", "MINIMAX_REGENERATION_SOURCE_TASK_REQUIRED", 400);
    }
    payload.source_task_id = sourceTaskId;
  } else {
    const prompt = text(input.prompt);
    const baseVideoUrl = text(input.baseVideoUrl);
    if (!prompt) {
      throw new AIProviderError("MiniMax H3 regeneration by source video requires the final prompt used for the 768P generation.", "MINIMAX_REGENERATION_PROMPT_REQUIRED", 400);
    }
    if (Array.from(prompt).length > MAX_PROMPT_LENGTH) {
      throw new AIProviderError("MiniMax H3 regeneration prompts support at most 40,000 characters.", "MINIMAX_REGENERATION_PROMPT_TOO_LONG", 400);
    }
    if (!baseVideoUrl) {
      throw new AIProviderError("Connect exactly one MiniMax H3 768P source video to the base_video input.", "MINIMAX_REGENERATION_BASE_VIDEO_REQUIRED", 400);
    }
    assertMediaUrl(baseVideoUrl, "video", "base_video");

    const content: RecordValue[] = [{ type: "text", text: prompt }];
    const firstFrameUrl = text(input.firstFrameUrl);
    const lastFrameUrl = text(input.lastFrameUrl);
    if (firstFrameUrl) {
      assertMediaUrl(firstFrameUrl, "image", "first_frame");
      content.push({ type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" });
    }
    if (lastFrameUrl) {
      if (!firstFrameUrl) throw new AIProviderError("last_frame must be paired with first_frame.", "MINIMAX_REGENERATION_FIRST_FRAME_REQUIRED", 400);
      assertMediaUrl(lastFrameUrl, "image", "last_frame");
      content.push({ type: "image_url", image_url: { url: lastFrameUrl }, role: "last_frame" });
    }
    for (const url of unique(input.referenceImageUrls)) {
      assertMediaUrl(url, "image", "reference_image");
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    }
    for (const url of unique(input.referenceVideoUrls)) {
      assertMediaUrl(url, "video", "reference_video");
      content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    }
    for (const url of unique(input.referenceAudioUrls)) {
      assertMediaUrl(url, "audio", "reference_audio");
      content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
    }
    content.push({ type: "video_url", video_url: { url: baseVideoUrl }, role: "base_video" });
    payload.content = content;
  }

  const raw = await requestMiniMax<RecordValue>("/v2/video_regeneration", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "H3 video regeneration");
  const taskId = text(raw.task_id);
  if (!taskId) throw new AIProviderError("MiniMax accepted the regeneration request but did not return a task_id.", "MINIMAX_REGENERATION_TASK_ID_MISSING", 502);
  return { taskId, status: "pending", rawStatus: "queued", resolution: RESOLUTION };
}

export async function queryMiniMaxH3VideoRegeneration(taskId: string): Promise<MiniMaxH3RegenerationResult> {
  const id = text(taskId);
  if (!id) throw new AIProviderError("A MiniMax regeneration task_id is required.", "MINIMAX_REGENERATION_TASK_ID_REQUIRED", 400);
  const raw = await requestMiniMax<RecordValue>(`/v2/query/video_generation/${encodeURIComponent(id)}`, { method: "GET" }, "H3 video regeneration");
  const task = record(raw.task);
  const rawStatus = (text(task.status) || "queued").toLowerCase();
  const status = rawStatus === "succeeded" ? "completed" : rawStatus === "failed" || rawStatus === "cancelled" ? "failed" : rawStatus === "running" ? "running" : "pending";
  const taskType = text(task.task_type);
  if (taskType && taskType !== "regeneration") {
    throw new AIProviderError("MiniMax returned a non-regeneration task for this task_id.", "MINIMAX_REGENERATION_TASK_TYPE_MISMATCH", 502);
  }
  const videoUrl = text(record(task.content).url);
  const errorMessage = text(record(task.error).message);
  if (status === "completed" && !videoUrl) {
    throw new AIProviderError("MiniMax regeneration succeeded but returned no video URL.", "MINIMAX_REGENERATION_VIDEO_MISSING", 502);
  }
  return {
    taskId: text(task.id) || id,
    status,
    rawStatus,
    videoUrl: videoUrl || undefined,
    resultUrl: videoUrl || undefined,
    errorMessage: errorMessage || undefined,
    resolution: text(task.resolution) || RESOLUTION,
    duration: typeof task.duration === "number" ? task.duration : undefined,
    usage: record(task.usage),
    raw,
  };
}
