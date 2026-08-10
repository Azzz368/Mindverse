import { NextResponse } from "next/server";
import { extractVideoFrame, type VideoFrameMode } from "@/server/video/videoFrameExtractor";

const frameMode = (value: unknown): value is VideoFrameMode => value === "last" || value === "timestamp";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.videoUrl !== "string" || !body.videoUrl || !frameMode(body.mode)) {
      return NextResponse.json({ ok: false, error: { message: "videoUrl and a valid extraction mode are required.", status: 400 } }, { status: 400 });
    }
    const timestampSeconds = typeof body.timestampSeconds === "number" ? body.timestampSeconds : Number(body.timestampSeconds);
    if (body.mode === "timestamp" && (!Number.isFinite(timestampSeconds) || timestampSeconds < 0)) {
      return NextResponse.json({ ok: false, error: { message: "timestampSeconds must be a non-negative number.", status: 400 } }, { status: 400 });
    }
    const output = await extractVideoFrame({
      videoUrl: body.videoUrl,
      sourceStorageKey: typeof body.sourceStorageKey === "string" ? body.sourceStorageKey : undefined,
      mode: body.mode,
      timestampSeconds: body.mode === "timestamp" ? timestampSeconds : undefined,
      sourceNodeId: typeof body.sourceNodeId === "string" ? body.sourceNodeId : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    });
    return NextResponse.json({ ok: true, output });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: { message: error instanceof Error ? error.message : "Video frame extraction failed.", status: 500 },
    }, { status: 500 });
  }
}
