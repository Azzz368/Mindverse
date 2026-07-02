import { NextResponse } from "next/server";
import { archiveMedia } from "@/lib/storage/mediaArchive";

const validMediaType = (value: unknown): value is "image" | "video" | "audio" => value === "image" || value === "video" || value === "audio";

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const mediaType = form.get("mediaType");
      const file = form.get("file");
      if (!validMediaType(mediaType) || !(file instanceof Blob)) return NextResponse.json({ ok: false, error: { message: "mediaType and file are required.", status: 400 } }, { status: 400 });
      const mimeType = file.type || `${mediaType}/${mediaType === "image" ? "png" : mediaType === "video" ? "mp4" : "mpeg"}`;
      const dataUrl = `data:${mimeType};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
      const archived = await archiveMedia(dataUrl, mediaType, { sourceProvider: "local-upload" });
      if (!archived) return NextResponse.json({ ok: false, error: { message: "Archive failed.", status: 502 } }, { status: 502 });
      return NextResponse.json({ ok: true, output: archived });
    }

    const body = await request.json() as { url?: unknown; mediaType?: unknown; nodeId?: unknown; projectId?: unknown; sourceProvider?: unknown; sourceTaskId?: unknown };
    if (typeof body.url !== "string" || !validMediaType(body.mediaType)) return NextResponse.json({ ok: false, error: { message: "url and mediaType are required.", status: 400 } }, { status: 400 });
    const archived = await archiveMedia(body.url, body.mediaType, {
      nodeId: typeof body.nodeId === "string" ? body.nodeId : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      sourceProvider: typeof body.sourceProvider === "string" ? body.sourceProvider : undefined,
      sourceTaskId: typeof body.sourceTaskId === "string" ? body.sourceTaskId : undefined,
    });
    if (!archived) return NextResponse.json({ ok: false, error: { message: "Archive failed.", status: 502 } }, { status: 502 });
    return NextResponse.json({ ok: true, output: archived });
  } catch (error) {
    return NextResponse.json({ ok: false, error: { message: error instanceof Error ? error.message : "Archive failed.", status: 500 } }, { status: 500 });
  }
}
