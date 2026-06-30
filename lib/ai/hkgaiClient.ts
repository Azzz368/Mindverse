import "server-only";
import { AIProviderConfigError, AIProviderError, AIProviderHTTPError } from "./errors";

const trimSlash = (value: string) => value.replace(/\/$/, "");
const bodyMessage = (body: unknown) => {
  if (body && typeof body === "object") {
    const value = body as { error?: { message?: unknown } | unknown; message?: unknown };
    if (typeof value.message === "string") return value.message;
    if (value.error && typeof value.error === "object" && typeof (value.error as { message?: unknown }).message === "string") return (value.error as { message: string }).message;
    if (typeof value.error === "string") return value.error;
  }
  return "Unknown response";
};

export async function requestHKGAIOpenAI<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = process.env.HKGAI_MAAS_API_KEY || process.env.HKGAI_API_KEY;
  if (!apiKey) throw new AIProviderConfigError("HKGAI_MAAS_API_KEY or HKGAI_API_KEY is required when HKGAI MaaS text provider is enabled.");
  const baseUrl = trimSlash(process.env.HKGAI_MAAS_BASE_URL || "https://test-new-api.hkchat.app/v1");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.HKGAI_MAAS_TIMEOUT_MS || process.env.AI_302_TIMEOUT_MS || 120000));
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
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* retain text */ }
    if (!response.ok) throw new AIProviderHTTPError(`HKGAI MaaS request to ${path} failed (${response.status}): ${bodyMessage(body)}`, response.status, body);
    return body as T;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new AIProviderError("HKGAI MaaS request timed out. Please try again.", "AI_PROVIDER_TIMEOUT", 504);
    throw new AIProviderError(error instanceof Error ? `HKGAI MaaS request failed: ${error.message}` : "HKGAI MaaS request failed.");
  } finally {
    clearTimeout(timer);
  }
}
