import "server-only";

import { AIProviderConfigError, AIProviderError } from "./errors";

const MINIMAX_H3_MODEL = "MiniMax-H3";
const MAX_PROMPT_LENGTH = 7000;
const MAX_REFERENCE_IMAGES = 2;
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 15;
const SUPPORTED_RATIOS = new Set(["16:9", "9:16", "1:1"]);

type RecordValue = Record<string, unknown>;
type ContextIRStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type H3ContextIRResult = {
  taskId: string;
  status: ContextIRStatus;
  enhancedPrompt?: string;
  truncated?: boolean;
  errorMessage?: string;
  usage?: RecordValue;
};

const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const trimSlash = (value: string) => value.replace(/\/+$/, "");

const responseMessage = (body: unknown) => {
  const root = record(body);
  const error = record(root.error);
  return text(error.message) || text(root.message) || "Unknown response";
};

async function requestMiniMax<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) throw new AIProviderConfigError("MINIMAX_API_KEY is required to use MiniMax H3 Context IR.");
  const baseUrl = trimSlash(process.env.MINIMAX_API_BASE_URL || "https://api.minimax.io");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.MINIMAX_API_TIMEOUT_MS || 120_000));
  try {
    const response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    const raw = await response.text();
    let body: unknown = raw;
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* retain response text */ }
    if (!response.ok) {
      throw new AIProviderError(`MiniMax Context IR request failed (${response.status}): ${responseMessage(body)}`, "MINIMAX_CONTEXT_IR_HTTP_ERROR", response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AIProviderError("MiniMax Context IR request timed out. Please try again.", "MINIMAX_CONTEXT_IR_TIMEOUT", 504);
    }
    throw new AIProviderError(error instanceof Error ? `MiniMax Context IR request failed: ${error.message}` : "MiniMax Context IR request failed.", "MINIMAX_CONTEXT_IR_ERROR", 502);
  } finally {
    clearTimeout(timeout);
  }
}

const durationFor = (value: number | undefined) => {
  const duration = value ?? MIN_DURATION_SECONDS;
  if (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new AIProviderError("MiniMax H3 Context IR duration must be an integer from 5 to 15 seconds.", "MINIMAX_CONTEXT_IR_INVALID_DURATION", 400);
  }
  return duration;
};

const ratioFor = (value: string | undefined) => {
  const ratio = value || "16:9";
  if (!SUPPORTED_RATIOS.has(ratio)) {
    throw new AIProviderError("MiniMax H3 Context IR ratio must be 16:9, 9:16, or 1:1.", "MINIMAX_CONTEXT_IR_INVALID_RATIO", 400);
  }
  return ratio;
};

const imageUrlsFor = (values: string[] | undefined) => {
  const urls = [...new Set((values || []).map((value) => value.trim()).filter(Boolean))];
  if (urls.length > MAX_REFERENCE_IMAGES) {
    throw new AIProviderError("MiniMax H3 Context IR accepts at most 2 reference images in this workflow.", "MINIMAX_CONTEXT_IR_TOO_MANY_IMAGES", 400);
  }
  for (const url of urls) {
    if (!/^https:\/\//i.test(url) && !/^mm_file:\/\//i.test(url) && !/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
      throw new AIProviderError("MiniMax H3 Context IR images must use HTTPS, mm_file://, or a base64 image data URL.", "MINIMAX_CONTEXT_IR_INVALID_IMAGE", 400);
    }
  }
  return urls;
};

const fitEnhancedPrompt = (value: string) => {
  const characters = Array.from(value.trim());
  return { prompt: characters.slice(0, MAX_PROMPT_LENGTH).join(""), truncated: characters.length > MAX_PROMPT_LENGTH };
};

export async function createH3ContextIR(input: { prompt: string; duration?: number; ratio?: string; imageUrls?: string[] }): Promise<H3ContextIRResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new AIProviderError("A prompt is required before it can be enhanced.", "MINIMAX_CONTEXT_IR_PROMPT_REQUIRED", 400);
  if (Array.from(prompt).length > MAX_PROMPT_LENGTH) {
    throw new AIProviderError("MiniMax H3 Context IR prompts support at most 7,000 characters.", "MINIMAX_CONTEXT_IR_PROMPT_TOO_LONG", 400);
  }
  const duration = durationFor(input.duration);
  const ratio = ratioFor(input.ratio);
  const imageUrls = imageUrlsFor(input.imageUrls);
  const content: RecordValue[] = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url }, role: "reference_image" })),
  ];
  const raw = await requestMiniMax<RecordValue>("/v2/h3_context_ir", {
    method: "POST",
    body: JSON.stringify({ model: MINIMAX_H3_MODEL, content, duration, ratio }),
  });
  const taskId = text(raw.task_id);
  if (!taskId) throw new AIProviderError("MiniMax accepted the Context IR request but did not return a task_id.", "MINIMAX_CONTEXT_IR_TASK_ID_MISSING", 502);
  return { taskId, status: "queued" };
}

export async function queryH3ContextIR(taskId: string): Promise<H3ContextIRResult> {
  const id = taskId.trim();
  if (!id) throw new AIProviderError("A MiniMax Context IR task_id is required.", "MINIMAX_CONTEXT_IR_TASK_ID_REQUIRED", 400);
  const raw = await requestMiniMax<RecordValue>(`/v2/query/video_generation/${encodeURIComponent(id)}`, { method: "GET" });
  const task = record(raw.task);
  const statusText = (text(task.status) || "queued").toLowerCase();
  const status: ContextIRStatus = statusText === "succeeded" || statusText === "failed" || statusText === "cancelled" || statusText === "running" ? statusText : "queued";
  const error = record(task.error);
  const errorMessage = text(error.message);
  if (status !== "succeeded") return { taskId: text(task.id) || id, status, errorMessage, usage: record(task.usage) };
  if (text(task.task_type) !== "h3_context_ir") {
    throw new AIProviderError("MiniMax returned a non-Context-IR task for this task_id.", "MINIMAX_CONTEXT_IR_TASK_TYPE_MISMATCH", 502);
  }
  const enhanced = text(record(task.content).prompt);
  if (!enhanced) throw new AIProviderError("MiniMax Context IR succeeded but returned no enhanced prompt.", "MINIMAX_CONTEXT_IR_PROMPT_MISSING", 502);
  const fitted = fitEnhancedPrompt(enhanced);
  return {
    taskId: text(task.id) || id,
    status,
    enhancedPrompt: fitted.prompt,
    truncated: fitted.truncated,
    usage: record(task.usage),
  };
}
