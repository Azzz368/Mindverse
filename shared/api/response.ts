export type ApiErrorBody = { message: string; code?: string; status?: number };

export type ApiFailure = { ok: false; error: ApiErrorBody };

export type PollingConfig = { intervalMs?: number };

/** Raw payload shape shared by all API routes before narrowing. */
export type RawApiPayload = {
  ok?: boolean;
  error?: { message?: unknown; code?: unknown; status?: unknown };
};
