import { NextResponse } from "next/server";
import { authErrorResponse, loginUser, sessionCookie } from "@/server/auth/auth";
import { enforceAuthRateLimit } from "@/server/auth/rateLimit";

export async function POST(request: Request) {
  try {
    enforceAuthRateLimit(request, "login");
    const body = await request.json() as { email?: unknown; password?: unknown };
    const result = await loginUser(body);
    const response = NextResponse.json({ ok: true });
    const cookie = sessionCookie(result.token, result.expires);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    const failure = authErrorResponse(error, "登录失败。");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
