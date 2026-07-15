import "server-only";
import { TokenStarError } from "../errors";
import { tokenstarFormRequest, tokenstarJsonRequest } from "./tokenstarClient";

export type TokenStarAssetType = "Image" | "Video" | "Audio";
export type TokenStarAsset = {
  assetId: string;
  name?: string;
  groupId?: string;
  assetType?: string;
  status?: string;
  raw: Record<string, unknown>;
};
export type TokenStarAssetGroup = {
  groupId: string;
  name?: string;
  status?: string;
  raw: Record<string, unknown>;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const key = (value: string) => value.replace(/[_-]/g, "").toLowerCase();
const read = (value: Record<string, unknown>, names: string[]) => {
  const namesByKey = new Set(names.map(key));
  return Object.entries(value).find(([name, item]) => namesByKey.has(key(name)) && text(item))?.[1] as string | undefined;
};

const valuesFor = (raw: unknown, names: string[]) => {
  const found: string[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = record(value);
    const valueForKey = read(item, names);
    if (valueForKey) found.push(valueForKey);
    Object.values(item).forEach(visit);
  };
  visit(raw);
  return [...new Set(found)];
};

const startsWithAny = (value: string | undefined, prefixes: string[]) => Boolean(value && prefixes.some((prefix) => value.toLowerCase().startsWith(prefix)));
const idFromPrefixes = (raw: unknown, names: string[], prefixes: string[]) => {
  const values = valuesFor(raw, names);
  return values.find((value) => startsWithAny(value, prefixes)) || values[0];
};
const summary = (value: unknown) => {
  try {
    return JSON.stringify(value).slice(0, 2500);
  } catch {
    return String(value).slice(0, 2500);
  }
};

const groupIdFrom = (raw: unknown) => idFromPrefixes(raw, ["GroupId", "group_id", "MaterialGroupId", "material_group_id", "Id", "id"], ["group-", "group_", "ag_", "ag-"]);
const assetIdFrom = (raw: unknown) => idFromPrefixes(raw, ["AssetId", "asset_id", "Id", "id"], ["asset-", "asset_"]);

const groupRecordsFrom = (raw: unknown) => {
  const groups: TokenStarAssetGroup[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = record(value);
    const directId = read(item, ["GroupId", "group_id", "MaterialGroupId", "material_group_id"]);
    const fallbackId = read(item, ["Id", "id"]);
    const groupId = directId || (startsWithAny(fallbackId, ["group-", "group_", "ag_", "ag-"]) ? fallbackId : undefined);
    if (groupId) groups.push({ groupId, name: read(item, ["Name", "name"]), status: read(item, ["Status", "status", "State", "state"]), raw: item });
    Object.values(item).forEach(visit);
  };
  visit(raw);
  return [...new Map(groups.map((group) => [group.groupId, group])).values()];
};

const assetRecordsFrom = (raw: unknown) => {
  const assets: TokenStarAsset[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = record(value);
    const assetId = read(item, ["AssetId", "asset_id"]) || (() => { const value = read(item, ["Id", "id"]); return startsWithAny(value, ["asset-", "asset_"]) ? value : undefined; })();
    if (assetId) assets.push({
      assetId,
      name: read(item, ["Name", "name"]),
      groupId: read(item, ["GroupId", "group_id"]),
      assetType: read(item, ["AssetType", "asset_type", "Type", "type"]),
      status: read(item, ["Status", "status", "State", "state"]),
      raw: item,
    });
    Object.values(item).forEach(visit);
  };
  visit(raw);
  return [...new Map(assets.map((asset) => [asset.assetId, asset])).values()];
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const normalizedStatus = (value: string | undefined) => value?.trim().toUpperCase();
const isFailedStatus = (value: string | undefined) => ["FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED", "REJECTED"].includes(normalizedStatus(value) || "");
const isReadyStatus = (value: string | undefined) => !value || ["READY", "AVAILABLE", "ACTIVE", "COMPLETED", "SUCCESS", "SUCCEEDED", "DONE"].includes(normalizedStatus(value) || "");
const extensionForMime = (mime: string, assetType: TokenStarAssetType) => {
  const normalized = mime.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "mp3";
  if (normalized === "video/mp4") return "mp4";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  return assetType === "Audio" ? "mp3" : assetType === "Video" ? "mp4" : "png";
};

export async function createAssetGroup(name: string) {
  const raw = await tokenstarJsonRequest("/volc/asset/CreateAssetGroup", { model: "volc-asset", Name: name });
  return { groupId: groupIdFrom(raw), raw };
}

export async function listAssetGroups(filterName?: string) {
  const raw = await tokenstarJsonRequest("/volc/asset/ListAssetGroups", { model: "volc-asset", ...(filterName ? { Filter: { Name: filterName } } : {}), PageNumber: 1, PageSize: 10 });
  return { raw, groups: groupRecordsFrom(raw) };
}

export async function createAssetFromUrl(input: { groupId: string; name: string; assetType: TokenStarAssetType; url: string }) {
  const model = input.assetType === "Video" ? "volc-asset-video" : input.assetType === "Audio" ? "volc-asset-audio" : "volc-asset";
  const raw = await tokenstarJsonRequest("/volc/asset/CreateAsset", { model, GroupId: input.groupId, Name: input.name, AssetType: input.assetType, URL: input.url });
  const assetId = assetIdFrom(raw);
  return { assetId, assetUrl: assetId ? `asset://${assetId}` : undefined, raw };
}

export async function createAssetFromFile(input: { groupId: string; name: string; assetType: TokenStarAssetType; file: Blob }) {
  const form = new FormData();
  const extension = extensionForMime(input.file.type, input.assetType);
  form.append("file", input.file, `asset.${extension}`);
  form.append("GroupId", input.groupId);
  form.append("Name", input.name);
  if (input.assetType !== "Image") {
    form.append("model", input.assetType === "Video" ? "volc-asset-video" : "volc-asset-audio");
    form.append("AssetType", input.assetType);
  }
  const raw = await tokenstarFormRequest("/volc/asset/CreateAsset", form);
  const assetId = assetIdFrom(raw);
  return { assetId, assetUrl: assetId ? `asset://${assetId}` : undefined, raw };
}

export async function listAssets(input: { groupId?: string; name?: string }) {
  const raw = await tokenstarJsonRequest("/volc/asset/ListAssets", { model: "volc-asset", Filter: { ...(input.name ? { Name: input.name } : {}), ...(input.groupId ? { GroupIds: [input.groupId], GroupType: "AIGC" } : {}) }, PageNumber: 1, PageSize: 10 });
  return { raw, assets: assetRecordsFrom(raw) };
}

export async function waitForAsset(input: { groupId: string; name: string; assetType: TokenStarAssetType; assetId?: string }) {
  const attempts = Math.max(1, Math.floor(numberFromEnv("TOKENSTAR_ASSET_MAX_POLL_ATTEMPTS", 20)));
  const intervalMs = Math.max(250, Math.floor(numberFromEnv("TOKENSTAR_ASSET_POLL_INTERVAL_MS", 1500)));
  let lastStatus: string | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const listed = await listAssets({ groupId: input.groupId, name: input.name });
    const asset = listed.assets.find((candidate) => candidate.assetId === input.assetId)
      || listed.assets.find((candidate) => candidate.name === input.name && (!candidate.assetType || candidate.assetType.toLowerCase() === input.assetType.toLowerCase()));
    if (asset) {
      lastStatus = asset.status;
      if (isFailedStatus(asset.status)) throw new TokenStarError(`TokenStar rejected ${input.assetType.toLowerCase()} asset \"${input.name}\" (status: ${asset.status}).`, 422);
      if (isReadyStatus(asset.status)) return { ...asset, assetUrl: `asset://${asset.assetId}` };
    }
    if (attempt < attempts - 1) await delay(intervalMs);
  }
  throw new TokenStarError(`TokenStar asset \"${input.name}\" was not ready after ${attempts} checks${lastStatus ? ` (last status: ${lastStatus})` : ""}.`, 504);
}

export async function waitForAssetGroup(input: { name: string; groupId?: string; createdRaw?: unknown }) {
  const attempts = Math.max(1, Math.floor(numberFromEnv("TOKENSTAR_ASSET_MAX_POLL_ATTEMPTS", 20)));
  const intervalMs = Math.max(250, Math.floor(numberFromEnv("TOKENSTAR_ASSET_POLL_INTERVAL_MS", 1500)));
  let lastStatus: string | undefined;
  let lastListResponse: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const filtered = await listAssetGroups(input.name);
    const listed = filtered.groups.length ? filtered : await listAssetGroups();
    lastListResponse = listed.raw;
    const group = listed.groups.find((candidate) => candidate.groupId === input.groupId)
      || listed.groups.find((candidate) => candidate.name === input.name);
    if (group) {
      lastStatus = group.status;
      if (isFailedStatus(group.status)) throw new TokenStarError(`TokenStar rejected asset group \"${input.name}\" (status: ${group.status}).`, 422);
      if (isReadyStatus(group.status)) return group;
    }
    if (attempt < attempts - 1) await delay(intervalMs);
  }
  throw new TokenStarError(`TokenStar asset group \"${input.name}\" was not available after ${attempts} checks${lastStatus ? ` (last status: ${lastStatus})` : ""}. Created group response: ${summary(input.createdRaw)}. Last ListAssetGroups response: ${summary(lastListResponse)}.`, 504);
}
