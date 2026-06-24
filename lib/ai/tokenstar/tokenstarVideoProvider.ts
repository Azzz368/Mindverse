import "server-only";
import { TokenStarError } from "../errors";
import { tokenstarGet, tokenstarJsonRequest } from "./tokenstarClient";
import { createReferenceAssets } from "./tokenstarReferenceAssets";
import type { NormalizedVideoTask, TokenStarContentItem, TokenStarCreateVideoInput, TokenStarCreateVideoResponse, TokenStarPollVideoResponse } from "./tokenstarTypes";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const taskId = (raw: Record<string, unknown>) => text(raw.id) || text(raw.task_id) || text(raw.taskId) || text(record(raw.data).id) || text(record(raw.data).task_id) || text(record(raw.data).taskId) || text(record(raw.output).id) || text(record(raw.output).task_id) || text(record(raw.output).taskId);
const statusFor = (rawStatus: string | undefined, hasResult: boolean): NormalizedVideoTask["status"] => {
  const status = rawStatus?.trim().toUpperCase();
  if (["FAILED", "FAILURE", "FAIL", "ERROR", "CANCELLED", "CANCELED"].includes(status || "")) return "failed";
  if (hasResult || ["COMPLETED", "SUCCESS", "SUCCEEDED", "DONE"].includes(status || "")) return "completed";
  if (["RUNNING", "IN_PROGRESS"].includes(status || "")) return "running";
  return "pending";
};
const normalized = (task: string | undefined, raw: unknown): NormalizedVideoTask => {
  const root = record(raw), data = record(root.data), output = record(root.output), content = record(root.content), dataContent = record(data.content), outputContent = record(output.content);
  const resultUrl = text(root.result_url) || text(root.resultUrl) || text(root.video_url) || text(data.result_url) || text(data.resultUrl) || text(data.video_url) || text(output.result_url) || text(output.resultUrl) || text(output.video_url) || text(content.video_url) || text(dataContent.video_url) || text(outputContent.video_url);
  const rawStatus = text(root.status) || text(data.status) || text(output.status);
  return { taskId: task || taskId(root), resultUrl, status: statusFor(rawStatus, Boolean(resultUrl)), rawStatus, raw };
};
const bool = (value: string | undefined, fallback: boolean) => value === undefined ? fallback : value.toLowerCase() === "true";
const unique = (values: readonly string[] = []) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const isAssetUrl = (value: string) => /^asset:\/\/[^\s]+$/i.test(value);
const existingAssetUrls = (label: string, values: readonly string[] = []) => {
  const urls = unique(values);
  const invalid = urls.find((url) => !isAssetUrl(url));
  if (invalid) throw new TokenStarError(`${label} must use a TokenStar asset:// URL.`, 400);
  return urls;
};
const contentFor = (input: TokenStarCreateVideoInput, assetMode: boolean): TokenStarContentItem[] => {
  const content: TokenStarContentItem[] = [{ type: "text", text: input.prompt }];
  if (!assetMode) return content;
  existingAssetUrls("Image reference", [...(input.referenceImageAssetUrls || []), input.referenceImageAssetUrl || ""]).forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
  existingAssetUrls("Video reference", [...(input.referenceVideoAssetUrls || []), input.referenceVideoAssetUrl || ""]).forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
  existingAssetUrls("Audio reference", [...(input.referenceAudioAssetUrls || []), input.referenceAudioAssetUrl || ""]).forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
  return content;
};
export async function createSeedanceVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> { const raw = await tokenstarJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", { model: input.model || process.env.TOKENSTAR_VIDEO_MODEL || "seedance-2.0-fast", content: contentFor(input, false), generate_audio: input.generateAudio ?? bool(process.env.TOKENSTAR_GENERATE_AUDIO, true), ratio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9", duration: input.duration || Number(process.env.TOKENSTAR_DEFAULT_DURATION || 8), ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}) }); return normalized(taskId(raw), raw); }
export async function createSeedanceAssetVideo(input: TokenStarCreateVideoInput): Promise<NormalizedVideoTask> {
  const references = await createReferenceAssets({ imageUrls: input.referenceImageUrls, videoUrls: input.referenceVideoUrls, audioUrls: input.referenceAudioUrls });
  const referenceImageAssetUrls = unique([...(input.referenceImageAssetUrls || []), input.referenceImageAssetUrl || "", ...references.imageAssetUrls]);
  const referenceVideoAssetUrls = unique([...(input.referenceVideoAssetUrls || []), input.referenceVideoAssetUrl || "", ...references.videoAssetUrls]);
  const referenceAudioAssetUrls = unique([...(input.referenceAudioAssetUrls || []), input.referenceAudioAssetUrl || "", ...references.audioAssetUrls]);
  if (!referenceImageAssetUrls.length && !referenceVideoAssetUrls.length && !referenceAudioAssetUrls.length) throw new TokenStarError("TokenStar asset-video requires at least one completed Image, Video, or Audio reference, or an existing asset:// URL.", 400);
  const raw = await tokenstarJsonRequest<TokenStarCreateVideoResponse>("/v1/video/generations", { model: input.model || process.env.TOKENSTAR_VIDEO_ASSET_MODEL || "seedance-2.0-asset-fast", content: contentFor({ ...input, referenceImageAssetUrls, referenceVideoAssetUrls, referenceAudioAssetUrls }, true), generate_audio: input.generateAudio ?? bool(process.env.TOKENSTAR_GENERATE_AUDIO, true), ratio: input.ratio || process.env.TOKENSTAR_DEFAULT_RATIO || "16:9", duration: input.duration || 5, resolution: input.resolution || process.env.TOKENSTAR_DEFAULT_RESOLUTION || "720p", ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}) });
  return { ...normalized(taskId(raw), raw), referenceAssetGroupId: references.groupId, referenceImageAssetUrls, referenceVideoAssetUrls, referenceAudioAssetUrls };
}
export async function pollSeedanceVideo(id: string): Promise<NormalizedVideoTask> { const raw = await tokenstarGet<TokenStarPollVideoResponse>(`/v1/video/generations/${encodeURIComponent(id)}`); return normalized(id, raw); }
