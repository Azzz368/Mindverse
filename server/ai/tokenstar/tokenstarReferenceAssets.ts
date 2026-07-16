import "server-only";
import { TokenStarError } from "../errors";
import { createAssetFromUrl, createAssetGroup, waitForAsset, waitForAssetGroup, type TokenStarAssetType } from "./tokenstarAsset";
import { archiveMedia } from "@/server/storage/mediaArchive";

const uniqueUrls = (urls: readonly string[] = []) => [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
const isFetchableSource = (url: string) => /^(https:|data:)/i.test(url);
const labelFor = (type: TokenStarAssetType) => type.toLowerCase();
const allowedMimeTypes: Record<TokenStarAssetType, readonly string[]> = {
  Image: ["image/jpeg", "image/png", "image/webp"],
  Video: ["video/mp4"],
  Audio: ["audio/mpeg", "audio/mp3"],
};
const archiveMediaTypeFor: Record<TokenStarAssetType, "image" | "video" | "audio"> = {
  Image: "image",
  Video: "video",
  Audio: "audio",
};

const mediaType = (response: Response, blob: Blob) => (blob.type || response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
const dataUriMimeType = (url: string) => {
  const match = /^data:([^;,]+)[;,]/i.exec(url);
  return match?.[1]?.trim().toLowerCase() || "";
};
const sourceSummary = (url: string) => {
  if (/^data:/i.test(url)) return `${dataUriMimeType(url) || "unknown"} data URI (${url.length} chars)`;
  return url;
};
type PreparedReference = { url: string };

const archiveReference = async (url: string, type: TokenStarAssetType, index: number) => {
  const archived = await archiveMedia(url, archiveMediaTypeFor[type], { sourceProvider: "tokenstar-reference" });
  if (!archived?.cdnUrl) {
    throw new TokenStarError(`Could not archive connected ${labelFor(type)} reference ${index + 1} into a public HTTPS URL before TokenStar upload. TokenStar CreateAsset requires URL to be a reachable image/video/audio URL; base64 and data URIs are not sent.`, 502);
  }
  return archived.cdnUrl;
};

const preparedReference = async (url: string, type: TokenStarAssetType, index: number): Promise<PreparedReference> => {
  if (!isFetchableSource(url)) throw new TokenStarError(`Connected ${labelFor(type)} reference ${index + 1} must be an HTTPS or data URL. Browser blob URLs cannot be uploaded by the server.`, 400);
  if (/^data:/i.test(url)) {
    const typeName = dataUriMimeType(url);
    if (typeName === "image/svg+xml") throw new TokenStarError("TokenStar asset-video requires a raster image reference (PNG, JPEG, or WebP). Mock ImageNodes produce SVG previews and cannot be uploaded.", 422);
    if (!allowedMimeTypes[type].includes(typeName)) throw new TokenStarError(`TokenStar ${labelFor(type)} assets must be ${allowedMimeTypes[type].join(", ")}. Connected reference ${index + 1} returned ${typeName || "an unknown content type"}.`, 422);
    return { url: await archiveReference(url, type, index) };
  }
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", redirect: "follow" });
  } catch (error) {
    throw new TokenStarError(`Could not download connected ${labelFor(type)} reference ${index + 1}: ${error instanceof Error ? error.message : "unknown error"}`, 422);
  }
  if (!response.ok) throw new TokenStarError(`Could not download connected ${labelFor(type)} reference ${index + 1} for TokenStar upload (HTTP ${response.status}).`, response.status);
  const blob = await response.blob();
  if (!blob.size) throw new TokenStarError(`Connected ${labelFor(type)} reference ${index + 1} was empty when downloaded for TokenStar upload.`, 422);
  const typeName = mediaType(response, blob);
  if (typeName === "image/svg+xml") throw new TokenStarError("TokenStar asset-video requires a raster image reference (PNG, JPEG, or WebP). Mock ImageNodes produce SVG previews and cannot be uploaded.", 422);
  if (!allowedMimeTypes[type].includes(typeName)) throw new TokenStarError(`TokenStar ${labelFor(type)} assets must be ${allowedMimeTypes[type].join(", ")}. Connected reference ${index + 1} returned ${typeName || "an unknown content type"}.`, 422);
  return { url: await archiveReference(url, type, index) };
};

export const prepareReferenceUrl = async (url: string, type: TokenStarAssetType, index: number) => {
  const prepared = await preparedReference(url, type, index);
  return prepared.url;
};

type ReferenceSources = { imageUrls?: readonly string[]; videoUrls?: readonly string[]; audioUrls?: readonly string[] };
type ReferenceAssets = { groupId?: string; imageAssetUrls: string[]; videoAssetUrls: string[]; audioAssetUrls: string[] };

const uploadReferences = async (groupId: string, type: TokenStarAssetType, urls: readonly string[], assetUrls: string[]) => {
  for (const [index, url] of uniqueUrls(urls).entries()) {
    const name = `reference-${labelFor(type)}-${index + 1}`;
    const prepared = await preparedReference(url, type, index);
    let created: Awaited<ReturnType<typeof createAssetFromUrl>>;
    try {
      created = await createAssetFromUrl({ groupId, name, assetType: type, url: prepared.url });
    } catch (error) {
      if (error instanceof TokenStarError) {
        throw new TokenStarError(
          `CreateAsset failed for ${labelFor(type)} reference ${index + 1} by public URL. GroupId: ${groupId}. Name: ${name}. AssetType: ${type}. Source: ${sourceSummary(url)}. Prepared URL: ${sourceSummary(prepared.url)}. TokenStar CreateAsset URL must be a reachable image/video/audio URL; base64 and data URIs are not sent. TokenStar error: ${error.message}`,
          error.status,
          error.errorCode,
          error.requestId,
        );
      }
      throw error;
    }
    const ready = await waitForAsset({ groupId, name, assetType: type, assetId: created.assetId });
    assetUrls.push(ready.assetUrl);
  }
};

export async function createReferenceAssets(input: ReferenceSources): Promise<ReferenceAssets> {
  const imageUrls = uniqueUrls(input.imageUrls);
  const videoUrls = uniqueUrls(input.videoUrls);
  const audioUrls = uniqueUrls(input.audioUrls);
  if (!imageUrls.length && !videoUrls.length && !audioUrls.length) return { imageAssetUrls: [], videoAssetUrls: [], audioAssetUrls: [] };
  const name = `lumen-flow-references-${Date.now()}`;
  const createdGroup = await createAssetGroup(name);
  const groupId = createdGroup.groupId || (await waitForAssetGroup({ name, createdRaw: createdGroup.raw })).groupId;
  if (!groupId) throw new TokenStarError("TokenStar did not return an asset group id.", 502);
  const imageAssetUrls: string[] = [], videoAssetUrls: string[] = [], audioAssetUrls: string[] = [];
  await uploadReferences(groupId, "Image", imageUrls, imageAssetUrls);
  await uploadReferences(groupId, "Video", videoUrls, videoAssetUrls);
  await uploadReferences(groupId, "Audio", audioUrls, audioAssetUrls);
  return { groupId, imageAssetUrls, videoAssetUrls, audioAssetUrls };
}
