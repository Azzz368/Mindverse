import { NextResponse } from "next/server";
import { sessionFromHeaders } from "@/server/auth/auth";

export async function GET(request: Request) {
  const session = await sessionFromHeaders(request.headers);
  if (!session) return NextResponse.json({ ok: false, error: { message: "请先登录。", status: 401 } }, { status: 401 });
  return NextResponse.json({ ok: true, output: { user: { id: session.userId, email: session.email, name: session.name }, workspace: { id: session.workspaceId, name: session.workspaceName, role: session.role } } });
}
