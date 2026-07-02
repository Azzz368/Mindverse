import "server-only";

import { Buffer } from "node:buffer";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Bunny Storage environment variable: ${name}`);
  return value;
};

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");
const bunnyConfig = () => {
  const storageZone = required("BUNNY_STORAGE_ZONE");
  const accessKey = required("BUNNY_ACCESS_KEY");
  const region = process.env.BUNNY_STORAGE_REGION?.trim() || "sg";
  const pullZoneUrl = required("BUNNY_PULL_ZONE_URL").replace(/\/+$/g, "");
  return { storageZone, accessKey, region, pullZoneUrl };
};

const storageUrlFor = (remotePath: string) => {
  const { storageZone, region } = bunnyConfig();
  const storagePath = trimSlashes(remotePath);
  if (!storagePath) throw new Error("Bunny remotePath cannot be empty.");
  return { storagePath, uploadUrl: `https://${region}.storage.bunnycdn.com/${storageZone}/${storagePath}` };
};

export async function uploadToBunny(fileBuffer: Buffer, remotePath: string, contentType?: string): Promise<string> {
  const { accessKey, pullZoneUrl } = bunnyConfig();
  const { storagePath, uploadUrl } = storageUrlFor(remotePath);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      AccessKey: accessKey,
      ...(contentType ? { "Content-Type": contentType } : {}),
      "Content-Length": String(fileBuffer.byteLength),
    },
    body: fileBuffer as unknown as BodyInit,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bunny upload failed (${response.status} ${response.statusText}) for ${storagePath}${body ? `: ${body}` : ""}`);
  }

  return `${pullZoneUrl}/${storagePath}`;
}

export async function getBunnyFile(remotePath: string): Promise<Buffer | null> {
  const { accessKey } = bunnyConfig();
  const { uploadUrl } = storageUrlFor(remotePath);
  const response = await fetch(uploadUrl, { method: "GET", headers: { AccessKey: accessKey }, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bunny read failed (${response.status} ${response.statusText}) for ${remotePath}${body ? `: ${body}` : ""}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteBunnyFile(remotePath: string): Promise<void> {
  const { accessKey } = bunnyConfig();
  const { uploadUrl } = storageUrlFor(remotePath);
  const response = await fetch(uploadUrl, { method: "DELETE", headers: { AccessKey: accessKey } });
  if (response.status === 404) return;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bunny delete failed (${response.status} ${response.statusText}) for ${remotePath}${body ? `: ${body}` : ""}`);
  }
}

export async function uploadJsonToBunny(remotePath: string, value: unknown): Promise<string> {
  return uploadToBunny(Buffer.from(JSON.stringify(value, null, 2), "utf8"), remotePath, "application/json; charset=utf-8");
}

export async function getJsonFromBunny<T>(remotePath: string): Promise<T | null> {
  const file = await getBunnyFile(remotePath);
  if (!file) return null;
  return JSON.parse(file.toString("utf8")) as T;
}
