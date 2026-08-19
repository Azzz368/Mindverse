import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "mindverse_session";
const protectedApiPrefixes = ["/api/ai", "/api/video", "/api/qwen", "/api/hkgai", "/api/storage"];
const workerPaths = [/^\/api\/ai\/agent-runs\/claim$/, /^\/api\/ai\/agent-runs\/[^/]+\/lease$/];

const developmentAuthSecret = "mindverse-local-development-secret-change-before-deploy";
const base64Url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function validSessionCookie(value: string) {
  const [rawToken, expiresAt, signature, ...extra] = value.split(".");
  if (!rawToken || !expiresAt || !signature || extra.length || Number(expiresAt) * 1000 <= Date.now()) return false;
  const secret = process.env.MINDVERSE_AUTH_SECRET?.trim() || (process.env.NODE_ENV !== "production" ? developmentAuthSecret : "");
  if (secret.length < 32) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${rawToken}.${expiresAt}`));
  return base64Url(signed) === signature;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/") return NextResponse.redirect(new URL("/login", request.url));
  if (workerPaths.some((pattern) => pattern.test(path))) return NextResponse.next();
  if (!protectedApiPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return NextResponse.next();
  const cookie = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (cookie && await validSessionCookie(cookie)) return NextResponse.next();
  return NextResponse.json(
    { ok: false, error: { message: "Please sign in.", code: "UNAUTHORIZED", status: 401 } },
    { status: 401 },
  );
}

export const config = { matcher: ["/", "/api/:path*"] };
