import "server-only";
import { TokenStarError } from "../errors";
const origin = () => (process.env.TOKENSTAR_API_ORIGIN || "https://api.tokenstar.io").replace(/\/$/, "");
const rec = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : undefined;
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
async function request<T>(path: string, init: RequestInit = {}) { const key = process.env.TOKENSTAR_API_KEY; if (!key) throw new TokenStarError("TokenStar API key is missing. Please set TOKENSTAR_API_KEY.", 500); const multipart = isFormData(init.body); const response = await fetch(`${origin()}${path}`, { ...init, cache: "no-store", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(multipart ? {} : { "Content-Type": "application/json" }), ...init.headers } }); const raw = await response.text(); let body: unknown = raw; try { body = raw ? JSON.parse(raw) : {}; } catch { /* preserve text */ } if (!response.ok) { const { message, errorCode, requestId } = extractError(body); throw new TokenStarError(message, response.status, errorCode, requestId); } return body as T; }
export const tokenstarJsonRequest = <T>(path: string, body?: unknown, method = "POST") => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export const tokenstarGet = <T>(path: string) => request<T>(path, { method: "GET" });
export const tokenstarFormRequest = <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData });
export const tokenstarActionRequest = <T>(path: string, action: string, body?: unknown) => request<T>(path, { method: "POST", headers: { "X-TC-Action": action }, body: body === undefined ? undefined : JSON.stringify(body) });
export const tokenstarActionGet = <T>(path: string, action: string) => request<T>(path, { method: "GET", headers: { "X-TC-Action": action } });
