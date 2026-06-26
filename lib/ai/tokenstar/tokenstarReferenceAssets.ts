import "server-only";
import { Buffer } from "node:buffer";
import { TokenStarError } from "../errors";
import { createAssetFromUrl, createAssetGroup, waitForAsset, waitForAssetGroup, type TokenStarAssetType } from "./tokenstarAsset";

const uniqueUrls = (urls: readonly string[] = []) => [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
const isFetchableSource = (url: string) => /^(https:|data:)/i.test(url);
const labelFor = (type: TokenStarAssetType) => type.toLowerCase();
const allowedMimeTypes: Record<TokenStarAssetType, readonly string[]> = {
  Image: ["image/jpeg", "image/png", "image/webp"],
  Video: ["video/mp4"],
  Audio: ["audio/mpeg", "audio/mp3"],
};

const mediaType = (response: Response, blob: Blob) => (blob.type || response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
const dataUriMimeType = (url: string) => {
  const match = /^data:([^;,]+)[;,]/i.exec(url);
  return match?.[1]?.trim().toLowerCase() || "";
};
const preparedReferenceUrl = async (url: string, type: TokenStarAssetType, index: number) => {
  if (!isFetchableSource(url)) throw new TokenStarError(`Connected ${labelFor(type)} reference ${index + 1} must be an HTTPS or data URL. Browser blob URLs cannot be uploaded by the server.`, 400);
  if (/^data:/i.test(url)) {
    const typeName = dataUriMimeType(url);
    if (typeName === "image/svg+xml") throw new TokenStarError("TokenStar asset-video requires a raster image reference (PNG, JPEG, or WebP). Mock ImageNodes produce SVG previews and cannot be uploaded.", 422);
    if (!allowedMimeTypes[type].includes(typeName)) throw new TokenStarError(`TokenStar ${labelFor(type)} assets must be ${allowedMimeTypes[type].join(", ")}. Connected reference ${index + 1} returned ${typeName || "an unknown content type"}.`, 422);
    return url;
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
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return `data:${typeName};base64,${base64}`;
};

type ReferenceSources = { imageUrls?: readonly string[]; videoUrls?: readonly string[]; audioUrls?: readonly string[] };
type ReferenceAssets = { groupId?: string; imageAssetUrls: string[]; videoAssetUrls: string[]; audioAssetUrls: string[] };

const uploadReferences = async (groupId: string, type: TokenStarAssetType, urls: readonly string[], assetUrls: string[]) => {
  for (const [index, url] of uniqueUrls(urls).entries()) {
    const name = `reference-${labelFor(type)}-${index + 1}`;
    const preparedUrl = await preparedReferenceUrl(url, type, index);
    const created = await createAssetFromUrl({ groupId, name, assetType: type, url: preparedUrl });
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
  const groupId = createdGroup.groupId || (await waitForAssetGroup({ name })).groupId;
  if (!groupId) throw new TokenStarError("TokenStar did not return an asset group id.", 502);
  const imageAssetUrls: string[] = [], videoAssetUrls: string[] = [], audioAssetUrls: string[] = [];
  await uploadReferences(groupId, "Image", imageUrls, imageAssetUrls);
  await uploadReferences(groupId, "Video", videoUrls, videoAssetUrls);
  await uploadReferences(groupId, "Audio", audioUrls, audioAssetUrls);
  return { groupId, imageAssetUrls, videoAssetUrls, audioAssetUrls };
}
