import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { archiveMedia, archiveMediaBuffer } from "@/server/storage/mediaArchive";
import { authErrorResponse, requireSession } from "@/server/auth/auth";

const validMediaType = (value: unknown): value is "image" | "video" | "audio" => value === "image" || value === "video" || value === "audio";
const maxUploadBytes = (mediaType: "image" | "video" | "audio") => {
  const fallback = mediaType === "image" ? 20 : mediaType === "video" ? 80 : 30;
  const configured = Number(process.env[`MINDVERSE_MAX_${mediaType.toUpperCase()}_UPLOAD_MB`] || fallback);
  return Math.max(1, Number.isFinite(configured) ? configured : fallback) * 1024 * 1024;
};

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const mediaType = form.get("mediaType");
      const file = form.get("file");
      if (!validMediaType(mediaType) || !(file instanceof Blob)) return NextResponse.json({ ok: false, error: { message: "mediaType and file are required.", status: 400 } }, { status: 400 });
      if (file.size > maxUploadBytes(mediaType)) return NextResponse.json({ ok: false, error: { message: `${mediaType} upload exceeds the allowed size.`, status: 413 } }, { status: 413 });
      const mimeType = file.type || `${mediaType}/${mediaType === "image" ? "png" : mediaType === "video" ? "mp4" : "mpeg"}`;
      const archived = await archiveMediaBuffer(Buffer.from(await file.arrayBuffer()), mediaType, mimeType, { workspaceId: session.workspaceId, sourceProvider: "local-upload" });
      if (!archived) return NextResponse.json({ ok: false, error: { message: "Archive failed.", status: 502 } }, { status: 502 });
      return NextResponse.json({ ok: true, output: archived });
    }

    const body = await request.json() as { url?: unknown; mediaType?: unknown; nodeId?: unknown; projectId?: unknown; sourceProvider?: unknown; sourceTaskId?: unknown };
    if (typeof body.url !== "string" || !validMediaType(body.mediaType)) return NextResponse.json({ ok: false, error: { message: "url and mediaType are required.", status: 400 } }, { status: 400 });
    const archived = await archiveMedia(body.url, body.mediaType, {
      workspaceId: session.workspaceId,
      nodeId: typeof body.nodeId === "string" ? body.nodeId : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      sourceProvider: typeof body.sourceProvider === "string" ? body.sourceProvider : undefined,
      sourceTaskId: typeof body.sourceTaskId === "string" ? body.sourceTaskId : undefined,
    });
    if (!archived) return NextResponse.json({ ok: false, error: { message: "Archive failed.", status: 502 } }, { status: 502 });
    return NextResponse.json({ ok: true, output: archived });
  } catch (error) {
    const authFailure = authErrorResponse(error, "Archive failed.");
    if (authFailure.status !== 500) return NextResponse.json(authFailure.body, { status: authFailure.status });
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Archive failed.", status: 500 } }, { status: 500 });
  }
}
