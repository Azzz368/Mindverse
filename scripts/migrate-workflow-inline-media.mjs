/*
 * One-off local repair for legacy workflow JSON that contains data: media.
 * Usage: node scripts/migrate-workflow-inline-media.mjs workflow-<id>
 *
 * Requires BUNNY_STORAGE_ZONE, BUNNY_ACCESS_KEY, BUNNY_PULL_ZONE_URL and,
 * optionally, BUNNY_STORAGE_REGION. Run it locally, not on the 2GB web
 * service: the old JSON can be much larger than a safe server request.
 */
import { Buffer } from "node:buffer";

const workflowId = process.argv[2];
const accessCode = process.env.MINDVERSE_WORKFLOW_ACCESS_CODE || "666666";
const storageZone = process.env.BUNNY_STORAGE_ZONE;
const accessKey = process.env.BUNNY_ACCESS_KEY;
const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL?.replace(/\/+$/, "");
const region = process.env.BUNNY_STORAGE_REGION || "sg";

if (!workflowId || !storageZone || !accessKey || !pullZoneUrl) {
  throw new Error("Usage: node scripts/migrate-workflow-inline-media.mjs workflow-<id> (requires Bunny environment variables).");
}

const storageUrl = (key) => `https://${region}.storage.bunnycdn.com/${storageZone}/${key}`;
const workflowKey = `workflows/access-${accessCode}/${workflowId}.json`;
const dataUrl = /^data:([^;,]+);base64,(.+)$/i;
const originalField = /^(?:original(?:Image|Video|Audio)?Url|originalUrl)$/i;
const mediaTypeFor = (mime) => mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : null;
const extFor = (mime, type) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a" }[mime] || (type === "image" ? "png" : type === "video" ? "mp4" : "mp3"));

const get = async (key) => {
  const response = await fetch(storageUrl(key), { headers: { AccessKey: accessKey } });
  if (!response.ok) throw new Error(`Bunny GET ${key} failed: ${response.status} ${response.statusText}`);
  return response;
};
const put = async (key, body, contentType) => {
  const response = await fetch(storageUrl(key), { method: "PUT", headers: { AccessKey: accessKey, "Content-Type": contentType, "Content-Length": String(body.byteLength) }, body });
  if (!response.ok) throw new Error(`Bunny PUT ${key} failed: ${response.status} ${response.statusText}`);
};

let migrated = 0;
const migrate = async (value, key = "") => {
  if (typeof value === "string") {
    const match = dataUrl.exec(value);
    if (!match) return value;
    if (originalField.test(key)) return undefined;
    const mime = match[1].toLowerCase();
    const type = mediaTypeFor(mime);
    if (!type) return undefined;
    const body = Buffer.from(match[2], "base64");
    const assetKey = `canvas/legacy/${new Date().toISOString().slice(0, 10)}/${type}/${crypto.randomUUID()}.${extFor(mime, type)}`;
    await put(assetKey, body, mime);
    migrated += 1;
    console.log(`Archived ${type} ${migrated}: ${Math.round(body.byteLength / 1024)}KB`);
    return `${pullZoneUrl}/${assetKey}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => migrate(item)));
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const migratedValue = await migrate(childValue, childKey);
    if (migratedValue !== undefined) next[childKey] = migratedValue;
  }
  return next;
};

const response = await get(workflowKey);
const workflow = JSON.parse(await response.text());
const cleaned = await migrate(workflow);
await put(workflowKey, Buffer.from(JSON.stringify(cleaned, null, 2), "utf8"), "application/json; charset=utf-8");
console.log(`Done. Replaced ${migrated} inline media value(s) in ${workflowId}.`);
