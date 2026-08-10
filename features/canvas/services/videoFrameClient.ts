import { postJson } from "@/shared/api/client";
import type { ExtractVideoFrameRequest, ExtractVideoFrameResponse } from "@/shared/api/storageContracts";

export async function extractVideoFrameRemote(request: ExtractVideoFrameRequest) {
  const payload = await postJson<ExtractVideoFrameResponse>(
    "/api/video/extract-frame",
    request,
    "Video frame extraction failed.",
  );
  if (!payload.output?.imageUrl) throw new Error("Video frame extraction returned no image.");
  return payload.output;
}
