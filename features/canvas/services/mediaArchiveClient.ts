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

export async function archiveVideoFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("mediaType", "video");
  form.append("file", file);
  const payload = await postForm<ArchiveMediaResponse>("/api/storage/archive", form, "Video archive failed.");
  const cdnUrl = payload.output?.cdnUrl;
  if (typeof cdnUrl !== "string") throw new Error("Video archive failed.");
  return cdnUrl;
}

export async function archiveAudioFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("mediaType", "audio");
  form.append("file", file);
  const payload = await postForm<ArchiveMediaResponse>("/api/storage/archive", form, "Audio archive failed.");
  const cdnUrl = payload.output?.cdnUrl;
  if (typeof cdnUrl !== "string") throw new Error("Audio archive failed.");
  return cdnUrl;
}
