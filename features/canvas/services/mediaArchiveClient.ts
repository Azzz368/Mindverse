import { postForm } from "@/shared/api/client";
import type { ArchiveMediaResponse } from "@/shared/api/storageContracts";

export async function archiveImageFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("mediaType", "image");
  form.append("file", file);
  const payload = await postForm<ArchiveMediaResponse>("/api/storage/archive", form, "Image archive failed.");
  const cdnUrl = payload.output?.cdnUrl;
  if (typeof cdnUrl !== "string") throw new Error("Image archive failed.");
  return cdnUrl;
}
