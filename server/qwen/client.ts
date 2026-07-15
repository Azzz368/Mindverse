import "server-only";

import { QwenCloudError } from "./errors";

const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com/api/v1";
const DEFAULT_COMPATIBLE_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

const endpointUrl = (endpoint: string) => {
  const baseUrl = (process.env.QWEN_DASHSCOPE_BASE_URL || DEFAULT_DASHSCOPE_BASE_URL).trim().replace(/\/+$/g, "");
  return `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
};

const compatibleEndpointUrl = (endpoint: string) => {
  const baseUrl = (process.env.QWEN_COMPATIBLE_BASE_URL || DEFAULT_COMPATIBLE_BASE_URL).trim().replace(/\/+$/g, "");
  return `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
};

const requestIdFrom = (payload: unknown) => {
  const data = record(payload);
  return text(data.request_id) || text(data.requestId) || text(record(data.header).request_id);
};

const qwenMessageFrom = (payload: unknown) => {
  const data = record(payload);
  return text(data.message) || text(data.msg) || text(data.error_message) || text(record(data.error).message);
};

export async function qwenFetch<T>(endpoint: string, body: unknown, timeoutMs = 20_000): Promise<{ data: T; requestId?: string }> {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    throw new QwenCloudError("DASHSCOPE_API_KEY is not configured.", { code: "QWEN_CONFIG_ERROR", status: 500 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`QwenCloud request timed out after ${timeoutMs}ms.`)), timeoutMs);
  let rawText = "";
  try {
    const response = await fetch(endpointUrl(endpoint), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    rawText = await response.text().catch(() => "");
    let payload: unknown = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      payload = {};
    }
    const parsed = record(payload);
    const requestId = requestIdFrom(payload);
    const qwenCode = text(parsed.code) || text(record(parsed.error).code);
    if (!response.ok) {
      const message = qwenMessageFrom(payload) || `QwenCloud request failed (${response.status}).`;
      throw new QwenCloudError(message, {
        code: response.status === 401 || response.status === 403 ? "QWEN_AUTH_ERROR" : response.status === 429 ? "QWEN_RATE_LIMIT" : "QWEN_HTTP_ERROR",
        status: response.status,
        requestId,
        qwenCode,
      });
    }
    if (qwenCode && qwenCode !== "OK" && qwenCode !== "Success") {
      throw new QwenCloudError(qwenMessageFrom(payload) || "QwenCloud API returned an error.", {
        code: "QWEN_API_ERROR",
        status: 502,
        requestId,
        qwenCode,
      });
    }
    return { data: payload as T, requestId };
  } catch (error) {
    if (error instanceof QwenCloudError) throw error;
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new QwenCloudError(isAbort ? "QwenCloud request timed out." : error instanceof Error ? error.message : "QwenCloud request failed.", {
      code: isAbort ? "QWEN_TIMEOUT" : "QWEN_NETWORK_ERROR",
      status: isAbort ? 504 : 502,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function qwenCompatibleStreamChat(body: unknown, timeoutMs = 120_000): Promise<{ chunks: unknown[]; requestId?: string }> {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    throw new QwenCloudError("DASHSCOPE_API_KEY is not configured.", { code: "QWEN_CONFIG_ERROR", status: 500 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`QwenCloud compatible request timed out after ${timeoutMs}ms.`)), timeoutMs);
  try {
    const response = await fetch(compatibleEndpointUrl("/chat/completions"), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let payload: unknown = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }
      const requestId = requestIdFrom(payload);
      throw new QwenCloudError(qwenMessageFrom(payload) || `QwenCloud compatible request failed (${response.status}).`, {
        code: response.status === 401 || response.status === 403 ? "QWEN_AUTH_ERROR" : response.status === 429 ? "QWEN_RATE_LIMIT" : "QWEN_HTTP_ERROR",
        status: response.status,
        requestId,
        qwenCode: text(record(payload).code) || text(record(record(payload).error).code),
      });
    }

    if (!response.body) {
      throw new QwenCloudError("QwenCloud compatible response did not include a stream.", { code: "QWEN_BAD_RESPONSE", status: 502 });
    }

    const chunks: unknown[] = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let requestId: string | undefined;
    const parseLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payloadText = trimmed.slice(5).trim();
      if (!payloadText || payloadText === "[DONE]") return;
      let payload: unknown;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        return;
      }
      requestId ||= requestIdFrom(payload) || text(record(payload).id);
      chunks.push(payload);
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(parseLine);
    }
    buffer += decoder.decode();
    if (buffer) buffer.split(/\r?\n/).forEach(parseLine);

    return { chunks, requestId };
  } catch (error) {
    if (error instanceof QwenCloudError) throw error;
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new QwenCloudError(isAbort ? "QwenCloud compatible request timed out." : error instanceof Error ? error.message : "QwenCloud compatible request failed.", {
      code: isAbort ? "QWEN_TIMEOUT" : "QWEN_NETWORK_ERROR",
      status: isAbort ? 504 : 502,
    });
  } finally {
    clearTimeout(timeout);
  }
}
