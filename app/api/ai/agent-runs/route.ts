import { NextResponse } from "next/server";
import { listAgentRuns } from "@/server/storage/agentRunStorage";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 20);
    const runs = await listAgentRuns(limit);
    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: { message: error instanceof Error ? error.message : "Unable to list Agent runs." },
    }, { status: 500 });
  }
}
