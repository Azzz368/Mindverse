import "server-only";

import { AuthError } from "./auth";

type WindowState = { count: number; resetAt: number };
const windows = new Map<string, WindowState>();
let lastCleanup = 0;

const requestIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || request.headers.get("x-real-ip")?.trim()
  || "unknown";

export function enforceAuthRateLimit(request: Request, action: "login" | "register") {
  const now = Date.now();
  if (now - lastCleanup > 60_000) {
    windows.forEach((state, key) => { if (state.resetAt <= now) windows.delete(key); });
    lastCleanup = now;
  }
  const durationMs = action === "login" ? 15 * 60_000 : 60 * 60_000;
  const limit = action === "login" ? 10 : 5;
  const key = `${action}:${requestIp(request)}`;
  const existing = windows.get(key);
  const state = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + durationMs } : existing;
  state.count += 1;
  windows.set(key, state);
  if (state.count > limit) throw new AuthError("Too many attempts. Please try again later.", 429, "RATE_LIMITED");
}
