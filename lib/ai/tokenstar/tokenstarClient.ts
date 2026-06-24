import "server-only";
import { TokenStarError } from "../errors";
const origin = () => (process.env.TOKENSTAR_API_ORIGIN || "https://api.tokenstar.world").replace(/\/$/, "");
const message = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "TokenStar request failed.";
  const root = value as Record<string, unknown>;
  const candidates = [root.message, (root.error as Record<string, unknown> | undefined)?.message, (root.data as Record<string, unknown> | undefined)?.message, ((root.data as Record<string, unknown> | undefined)?.error as Record<string, unknown> | undefined)?.message];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0) || "TokenStar request failed.";
};
const isFormData = (body: unknown) => Boolean(body && typeof body === "object" && typeof (body as { append?: unknown }).append === "function" && typeof (body as { get?: unknown }).get === "function");
async function request<T>(path: string, init: RequestInit = {}) { const key = process.env.TOKENSTAR_API_KEY; if (!key) throw new TokenStarError("TokenStar API key is missing. Please set TOKENSTAR_API_KEY.", 500); const multipart = isFormData(init.body); const response = await fetch(`${origin()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(multipart ? {} : { "Content-Type": "application/json" }), ...init.headers } }); const raw = await response.text(); let body: unknown = raw; try { body = raw ? JSON.parse(raw) : {}; } catch { /* preserve text */ } if (!response.ok) throw new TokenStarError(message(body), response.status); return body as T; }
export const tokenstarJsonRequest = <T>(path: string, body?: unknown, method = "POST") => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export const tokenstarGet = <T>(path: string) => request<T>(path, { method: "GET" });
export const tokenstarFormRequest = <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData });
