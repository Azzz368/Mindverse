import "server-only";
import { TokenStarError } from "../errors";
const origin = () => (process.env.TOKENSTAR_API_ORIGIN || "https://api.tokenstar.world").replace(/\/$/, "");
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const rec = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : undefined;
const retryableStatuses = new Set([502, 503, 504]);
const extractError = (body: unknown): { message: string; errorCode?: string; requestId?: string } => {
  if (typeof body === "string") return { message: body.trim() || "TokenStar request failed." };
  if (!body || typeof body !== "object") return { message: "TokenStar request failed." };
  const root = rec(body);
  const errObj = rec(root.error);
  const dataObj = rec(root.data);
  const message =
    str(errObj.message) || str(root.message) || str(rec(dataObj.error).message) || str(dataObj.message) || "TokenStar request failed.";
  const errorCode = str(errObj.code) || str(root.code) || str(dataObj.code);
  const requestId = str(root.requestId) || str(root.request_id) || str(root.RequestId) || str(errObj.requestId);
  return { message, errorCode, requestId };
};
const isFormData = (body: unknown) => Boolean(body && typeof body === "object" && typeof (body as { append?: unknown }).append === "function" && typeof (body as { get?: unknown }).get === "function");
const networkErrorDetail = (error: unknown) => {
  if (!(error instanceof Error)) return "unknown network error";
  const cause = error.cause;
  const causeRecord = cause && typeof cause === "object" ? cause as { code?: unknown; message?: unknown } : undefined;
  const code = typeof causeRecord?.code === "string" ? causeRecord.code : "";
  const message = typeof causeRecord?.message === "string" ? causeRecord.message : "";
  return [error.message, code && `code=${code}`, message && message !== error.message && `cause=${message}`].filter(Boolean).join("; ");
};
async function request<T>(path: string, init: RequestInit = {}) {
  const key = process.env.TOKENSTAR_API_KEY;
  if (!key) throw new TokenStarError("TokenStar API key is missing. Please set TOKENSTAR_API_KEY.", 500);
  const multipart = isFormData(init.body);
  const attempts = Math.max(1, Math.floor(numberFromEnv("TOKENSTAR_REQUEST_MAX_ATTEMPTS", 2)));
  const retryMs = Math.max(250, Math.floor(numberFromEnv("TOKENSTAR_REQUEST_RETRY_MS", 1500)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${origin()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(multipart ? {} : { "Content-Type": "application/json" }), ...init.headers } });
    } catch (error) {
      if (attempt < attempts) {
        await delay(retryMs * attempt);
        continue;
      }
      throw new TokenStarError(`TokenStar request failed before a response was received for ${path} after ${attempts} attempt(s): ${networkErrorDetail(error)}`, 502, "network_error");
    }
    const raw = await response.text();
    let body: unknown = raw;
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* preserve text */ }
    if (!response.ok) {
      const { message, errorCode, requestId } = extractError(body);
      if (attempt < attempts && retryableStatuses.has(response.status)) {
        await delay(retryMs * attempt);
        continue;
      }
      throw new TokenStarError(message, response.status, errorCode, requestId);
    }
    return body as T;
  }
  throw new TokenStarError(`TokenStar request failed for ${path}.`, 502);
}
export const tokenstarJsonRequest = <T>(path: string, body?: unknown, method = "POST") => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export const tokenstarGet = <T>(path: string) => request<T>(path, { method: "GET" });
export const tokenstarFormRequest = <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData });
export const tokenstarActionRequest = <T>(path: string, action: string, body?: unknown) => request<T>(path, { method: "POST", headers: { "X-TC-Action": action }, body: body === undefined ? undefined : JSON.stringify(body) });
// alias used by colleague's code — same as tokenstarActionRequest
export const tokenstarActionJsonRequest = tokenstarActionRequest;
export const tokenstarActionGet = <T>(path: string, action: string) => request<T>(path, { method: "GET", headers: { "X-TC-Action": action } });
