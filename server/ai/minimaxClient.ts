import "server-only";

import { AIProviderConfigError, AIProviderError } from "./errors";

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const trimSlash = (value: string) => value.replace(/\/+$/, "");

const responseMessage = (body: unknown) => {
  const root = record(body);
  const error = record(root.error);
  return text(error.message) || text(root.message) || "Unknown response";
};

export async function requestMiniMax<T>(path: string, options: RequestInit = {}, feature = "request"): Promise<T> {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) throw new AIProviderConfigError(`MINIMAX_API_KEY is required to use MiniMax ${feature}.`);
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
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* keep response text for diagnostics */ }
    if (!response.ok) {
      throw new AIProviderError(`MiniMax ${feature} request failed (${response.status}): ${responseMessage(body)}`, "MINIMAX_HTTP_ERROR", response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AIProviderError(`MiniMax ${feature} request timed out. Please try again.`, "MINIMAX_TIMEOUT", 504);
    }
    throw new AIProviderError(error instanceof Error ? `MiniMax ${feature} request failed: ${error.message}` : `MiniMax ${feature} request failed.`, "MINIMAX_REQUEST_ERROR", 502);
  } finally {
    clearTimeout(timeout);
  }
}
