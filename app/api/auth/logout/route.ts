import { NextResponse } from "next/server";
import { clearedSessionCookie, revokeSession } from "@/server/auth/auth";

export async function POST(request: Request) {
  await revokeSession(request.headers).catch(() => undefined);
  const response = NextResponse.json({ ok: true });
  const cookie = clearedSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
