import "server-only";
import { AIProviderConfigError, AIProviderError, AIProviderHTTPError } from "./errors";
const trimSlash = (value: string) => value.replace(/\/$/, "");
const bodyMessage = (body: unknown) => { if (body && typeof body === "object") { const value = body as { error?: { message?: unknown } | unknown; message?: unknown }; if (typeof value.message === "string") return value.message; if (value.error && typeof value.error === "object" && typeof (value.error as { message?: unknown }).message === "string") return (value.error as { message: string }).message; if (typeof value.error === "string") return value.error; } return "Unknown response"; };
type RequestOptions = RequestInit & { timeoutMs?: number };
async function request<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
  const apiKey = process.env.AI_302_API_KEY;
  if (!apiKey) throw new AIProviderConfigError();
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? Number(process.env.AI_302_TIMEOUT_MS || 120000));
  try { const multipart = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData; const response = await fetch(`${trimSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`, { ...fetchOptions, cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", ...(multipart ? {} : { "Content-Type": "application/json" }), ...fetchOptions.headers } }); const raw = await response.text(); let body: unknown = raw; try { body = raw ? JSON.parse(raw) : {}; } catch { /* retain text */ } if (!response.ok) throw new AIProviderHTTPError(`302.AI request to ${path} failed (${response.status}): ${bodyMessage(body)}`, response.status, body); return body as T; }
  catch (error) { if (error instanceof AIProviderError) throw error; if (error instanceof DOMException && error.name === "AbortError") throw new AIProviderError("302.AI request timed out. Please try again.", "AI_PROVIDER_TIMEOUT", 504); throw new AIProviderError(error instanceof Error ? `302.AI request failed: ${error.message}` : "302.AI request failed."); }
  finally { clearTimeout(timer); }
}
export const request302 = <T>(path: string, options?: RequestOptions) => request<T>(process.env.AI_302_API_ORIGIN || "https://api.302.ai", path, options);
export const request302OpenAI = <T>(path: string, options?: RequestOptions) => request<T>(process.env.AI_302_OPENAI_BASE_URL || process.env.AI_302_BASE_URL || "https://api.302.ai/v1", path, options);
