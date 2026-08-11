import "server-only";

import { createHash, createHmac } from "node:crypto";
import { AIProviderConfigError, AIProviderError } from "./errors";
import { archiveMedia } from "@/server/storage/mediaArchive";

const DEFAULT_ORIGIN = "https://visual.volcengineapi.com";
const VERSION = "2022-08-31";
const REQ_KEY = "jimeng_realman_avatar_picture_omni_v15";
const SERVICE = "cv";
const REGION = "cn-north-1";

type JsonRecord = Record<string, unknown>;
type OmniHumanStatus = "pending" | "running" | "completed" | "failed";
export type VolcengineOmniHumanTask = {
  taskId?: string;
  status: OmniHumanStatus;
  rawStatus?: string;
  videoUrl?: string;
  resultUrl?: string;
  errorMessage?: string;
  archivedMedia?: unknown[];
  request?: unknown;
  raw?: unknown;
};

const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value, "utf8").digest();
const uriEscape = (value: string) => encodeURIComponent(value).replace(/[!*'()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const canonicalQuery = (query: Record<string, string>) => Object.entries(query)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${uriEscape(key)}=${uriEscape(value)}`)
  .join("&");

const credentials = () => {
  const accessKeyId = (process.env.VOLCENGINE_OMNIHUMAN_ACCESS_KEY_ID || process.env.VOLCENGINE_ACCESS_KEY_ID || process.env.VOLC_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.VOLCENGINE_OMNIHUMAN_SECRET_ACCESS_KEY || process.env.VOLCENGINE_SECRET_ACCESS_KEY || process.env.VOLC_SECRET_ACCESS_KEY || "").trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new AIProviderConfigError("Volcengine OmniHuman credentials are missing. Set VOLCENGINE_OMNIHUMAN_ACCESS_KEY_ID and VOLCENGINE_OMNIHUMAN_SECRET_ACCESS_KEY.");
  }
  return { accessKeyId, secretAccessKey, sessionToken: process.env.VOLCENGINE_OMNIHUMAN_SESSION_TOKEN?.trim() || process.env.VOLCENGINE_SESSION_TOKEN?.trim() || undefined };
};

const timeoutMs = () => Math.max(10_000, Number(process.env.VOLCENGINE_OMNIHUMAN_TIMEOUT_MS || 120_000));

const apiStatus = (code: number | undefined) => code === 50429 || code === 50430 ? 429 : code && code >= 50500 ? 502 : 400;

const responseErrorDetail = (raw: JsonRecord, fallback: string) => {
  const metadata = record(raw.ResponseMetadata || raw.response_metadata);
  const error = record(metadata.Error || metadata.error || raw.Error || raw.error);
  const code = text(error.Code || error.code || raw.code);
  const message = text(error.Message || error.message || raw.message) || fallback;
  const requestId = text(metadata.RequestId || metadata.request_id || raw.request_id);
  return `${code ? `${code}: ` : ""}${message}${requestId ? ` [request_id: ${requestId}]` : ""}`;
};

async function visualRequest(action: "CVSubmitTask" | "CVGetResult", bodyValue: JsonRecord) {
  const origin = new URL(process.env.VOLCENGINE_VISUAL_API_ORIGIN || DEFAULT_ORIGIN);
  const body = JSON.stringify(bodyValue);
  const query = { Action: action, Version: VERSION };
  const headers = signedHeadersForAction(body, origin.host, action);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Volcengine OmniHuman request timed out.")), timeoutMs());
  let response: Response;
  try {
    response = await fetch(`${origin.origin}/?${canonicalQuery(query)}`, { method: "POST", headers, body, cache: "no-store", signal: controller.signal });
  } catch (error) {
    throw new AIProviderError(error instanceof Error ? error.message : "Volcengine OmniHuman network request failed.", "VOLCENGINE_OMNIHUMAN_NETWORK_ERROR", 502);
  } finally {
    clearTimeout(timeout);
  }
  const rawText = await response.text();
  let raw: JsonRecord;
  try {
    raw = record(JSON.parse(rawText));
  } catch {
    throw new AIProviderError(`Volcengine OmniHuman returned a non-JSON response: ${rawText.slice(0, 300)}`, "VOLCENGINE_INVALID_RESPONSE", response.status || 502);
  }
  if (!response.ok) throw new AIProviderError(`Volcengine OmniHuman request failed (${response.status}): ${responseErrorDetail(raw, response.statusText)}`, "VOLCENGINE_HTTP_ERROR", response.status);
  return raw;
}

function signedHeadersForAction(body: string, host: string, action: "CVSubmitTask" | "CVGetResult", now = new Date()) {
  const { accessKeyId, secretAccessKey, sessionToken } = credentials();
  const region = process.env.VOLCENGINE_REGION || REGION;
  const service = process.env.VOLCENGINE_SERVICE || SERVICE;
  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = xDate.slice(0, 8);
  const bodyHash = sha256(body);
  const canonicalHeaderValues: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-content-sha256": bodyHash,
    "x-date": xDate,
    ...(sessionToken ? { "x-security-token": sessionToken } : {}),
  };
  const signedHeaderNames = Object.keys(canonicalHeaderValues).sort();
  const canonicalHeaders = signedHeaderNames.map((key) => `${key}:${canonicalHeaderValues[key].trim().replace(/\s+/g, " ")}`).join("\n");
  const canonicalRequest = ["POST", "/", canonicalQuery({ Action: action, Version: VERSION }), `${canonicalHeaders}\n`, signedHeaderNames.join(";"), bodyHash].join("\n");
  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(secretAccessKey, shortDate), region), service), "request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return {
    Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
    "Content-Type": "application/json",
    Host: host,
    "X-Content-Sha256": bodyHash,
    "X-Date": xDate,
    ...(sessionToken ? { "X-Security-Token": sessionToken } : {}),
  };
}

const ensureHttps = (value: string, label: string) => {
  if (!/^https:\/\//i.test(value)) throw new AIProviderError(`${label} must be an HTTPS URL that Volcengine can download.`, "VOLCENGINE_OMNIHUMAN_INVALID_URL", 400);
  return value;
};

const businessError = (raw: JsonRecord) => {
  const code = number(raw.code);
  const message = text(raw.message) || "Volcengine OmniHuman request failed.";
  return { code, message, requestId: text(raw.request_id) };
};

export async function createVolcengineOmniHuman(input: { imageUrl: string; audioUrl: string; prompt?: string; resolution?: string; seed?: number }): Promise<VolcengineOmniHumanTask> {
  const imageUrl = ensureHttps(input.imageUrl.trim(), "OmniHuman image");
  const audioUrl = ensureHttps(input.audioUrl.trim(), "OmniHuman audio");
  const prompt = input.prompt?.trim() || "";
  if (Array.from(prompt).length > 300) throw new AIProviderError("OmniHuman 1.5 prompt must not exceed 300 characters.", "VOLCENGINE_OMNIHUMAN_PROMPT_TOO_LONG", 400);
  const outputResolution = input.resolution === "720p" || input.resolution === "720" ? 720 : 1080;
  const raw = await visualRequest("CVSubmitTask", {
    req_key: REQ_KEY,
    image_url: imageUrl,
    audio_url: audioUrl,
    ...(prompt ? { prompt } : {}),
    output_resolution: outputResolution,
    pe_fast_mode: outputResolution === 720,
    ...(Number.isInteger(input.seed) ? { seed: input.seed } : {}),
  });
  const { code, message, requestId } = businessError(raw);
  if (code !== 10000) throw new AIProviderError(`${message}${requestId ? ` [request_id: ${requestId}]` : ""}`, `VOLCENGINE_${code || "ERROR"}`, apiStatus(code));
  const taskId = text(record(raw.data).task_id);
  if (!taskId) throw new AIProviderError("Volcengine accepted the OmniHuman request but did not return task_id.", "VOLCENGINE_OMNIHUMAN_TASK_ID_MISSING", 502);
  return {
    taskId,
    status: "pending",
    rawStatus: "in_queue",
    request: { reqKey: REQ_KEY, imageUrl, audioUrl, promptLength: Array.from(prompt).length, outputResolution, peFastMode: outputResolution === 720 },
    raw,
  };
}

export async function pollVolcengineOmniHuman(taskId: string): Promise<VolcengineOmniHumanTask> {
  const raw = await visualRequest("CVGetResult", { req_key: REQ_KEY, task_id: taskId });
  const { code, message, requestId } = businessError(raw);
  if (code !== 10000) return { taskId, status: "failed", errorMessage: `${message}${requestId ? ` [request_id: ${requestId}]` : ""}`, raw };
  const data = record(raw.data);
  const rawStatus = (text(data.status) || "processing").toLowerCase();
  if (["processing", "in_queue"].includes(rawStatus)) return { taskId, status: "pending", rawStatus, raw };
  if (rawStatus === "generating") return { taskId, status: "running", rawStatus, raw };
  if (["not_found", "expired"].includes(rawStatus)) return { taskId, status: "failed", rawStatus, errorMessage: rawStatus === "expired" ? "OmniHuman task expired. Please submit it again." : "OmniHuman task was not found or has expired.", raw };
  const temporaryVideoUrl = text(data.video_url);
  if (rawStatus !== "done" || !temporaryVideoUrl) return { taskId, status: "failed", rawStatus, errorMessage: message === "Success" ? "OmniHuman generation finished without a video URL." : message, raw };
  const archived = await archiveMedia(temporaryVideoUrl, "video", { sourceProvider: "volcengine-omnihuman", sourceTaskId: taskId });
  if (!archived) throw new AIProviderError("OmniHuman completed, but its one-hour video URL could not be archived.", "VOLCENGINE_OMNIHUMAN_ARCHIVE_FAILED", 502);
  return { taskId, status: "completed", rawStatus, videoUrl: archived.cdnUrl, resultUrl: archived.cdnUrl, archivedMedia: [archived], raw: { ...raw, data: { ...data, video_url: undefined } } };
}
