import "server-only";
import { TokenStarError } from "../errors";
const origin = () => (process.env.TOKENSTAR_API_ORIGIN || "https://api.tokenstar.world").replace(/\/$/, "");
const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value, (_key, item) => typeof item === "string"
      ? item.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(sk|vk|ts)-[A-Za-z0-9._-]+/gi, "[redacted]").replace(/data:([^;,]+);base64,[A-Za-z0-9+/=]+/gi, "data:$1;base64,[base64 omitted]")
      : item).slice(0, 1200);
  } catch {
    return String(value).replace(/data:([^;,]+);base64,[A-Za-z0-9+/=]+/gi, "data:$1;base64,[base64 omitted]").slice(0, 1200);
  }
};
const message = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "TokenStar request failed.";
  const root = value as Record<string, unknown>;
  const candidates = [root.message, (root.error as Record<string, unknown> | undefined)?.message, (root.data as Record<string, unknown> | undefined)?.message, ((root.data as Record<string, unknown> | undefined)?.error as Record<string, unknown> | undefined)?.message];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0) || "TokenStar request failed.";
};
const isFormData = (body: unknown) => Boolean(body && typeof body === "object" && typeof (body as { append?: unknown }).append === "function" && typeof (body as { get?: unknown }).get === "function");
async function request<T>(path: string, init: RequestInit = {}) {
  const key = process.env.TOKENSTAR_API_KEY;
  if (!key) throw new TokenStarError("TokenStar API key is missing. Please set TOKENSTAR_API_KEY.", 500);
  const multipart = isFormData(init.body);
  const method = init.method || "POST";
  const response = await fetch(`${origin()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(multipart ? {} : { "Content-Type": "application/json" }), ...init.headers } });
  const raw = await response.text();
  let body: unknown = raw;
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* preserve text */ }
  const requestDetail = multipart || init.body === undefined ? "" : ` Request: ${safeJson(init.body)}`;
  if (!response.ok) throw new TokenStarError(`TokenStar ${method} ${path} failed (HTTP ${response.status}): ${message(body)}.${requestDetail} Response: ${safeJson(body)}`, response.status);
  return body as T;
}
export const tokenstarJsonRequest = <T>(path: string, body?: unknown, method = "POST") => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export const tokenstarGet = <T>(path: string) => request<T>(path, { method: "GET" });
export const tokenstarFormRequest = <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData });
export const tokenstarActionJsonRequest = <T>(path: string, action: string, body?: unknown, method = "POST") => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "X-TC-Action": action } });
export const tokenstarActionGet = <T>(path: string, action: string) => request<T>(path, { method: "GET", headers: { "X-TC-Action": action } });
