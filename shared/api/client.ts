import type { RawApiPayload } from "./response";

async function parseApiPayload<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text().catch(() => "");
  let payload = {} as RawApiPayload & T;
  try {
    payload = raw ? JSON.parse(raw) as RawApiPayload & T : payload;
  } catch {
    if (!response.ok) {
      const detail = raw.trim().replace(/\s+/g, " ").slice(0, 160);
      throw new Error(`${fallbackMessage} (${response.status}${detail ? `: ${detail}` : ""})`);
    }
  }
  if (!response.ok || !payload.ok) {
    const message = payload.error && typeof payload.error.message === "string" && payload.error.message
      ? payload.error.message
      : `${fallbackMessage}${response.ok ? "" : ` (${response.status})`}`;
    throw new Error(message);
  }
  return payload;
}

export async function getJson<T>(url: string, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  return parseApiPayload<T>(response, fallbackMessage);
}

async function sendJson<T>(method: "POST" | "PUT" | "PATCH", url: string, body: unknown, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return parseApiPayload<T>(response, fallbackMessage);
}

export const postJson = <T>(url: string, body: unknown, fallbackMessage: string) => sendJson<T>("POST", url, body, fallbackMessage);
export const putJson = <T>(url: string, body: unknown, fallbackMessage: string) => sendJson<T>("PUT", url, body, fallbackMessage);
export const patchJson = <T>(url: string, body: unknown, fallbackMessage: string) => sendJson<T>("PATCH", url, body, fallbackMessage);

export async function deleteJson<T>(url: string, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, { method: "DELETE" });
  return parseApiPayload<T>(response, fallbackMessage);
}

export async function postForm<T>(url: string, form: FormData, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, { method: "POST", body: form });
  return parseApiPayload<T>(response, fallbackMessage);
}
