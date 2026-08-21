import { NextResponse } from "next/server";
import { authErrorResponse, registerUser, sessionCookie } from "@/server/auth/auth";
import { enforceAuthRateLimit } from "@/server/auth/rateLimit";

export async function POST(request: Request) {
  try {
    enforceAuthRateLimit(request, "register");
    const body = await request.json() as { email?: unknown; name?: unknown; password?: unknown; inviteCode?: unknown };
    const result = await registerUser(body);
    const response = NextResponse.json({ ok: true });
    const cookie = sessionCookie(result.token, result.expires);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    const failure = authErrorResponse(error, "Registration failed.");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
