import "server-only";
import { TokenStarError } from "../errors";
import { tokenstarActionJsonRequest } from "./tokenstarClient";

type ElementResponse = Record<string, unknown>;

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const summary = (value: unknown) => {
  try { return JSON.stringify(value).slice(0, 1600); } catch { return String(value).slice(0, 1600); }
};

const elementIdFrom = (raw: unknown) => {
  const root = record(raw), response = record(root.Response), result = record(response.Result), data = record(root.data);
  return text(root.ElementId) || text(response.ElementId) || text(result.ElementId) || text(data.ElementId);
};

const statusFrom = (raw: unknown) => {
  const root = record(raw), response = record(root.Response), result = record(response.Result), data = record(root.data);
  return text(root.Status) || text(response.Status) || text(result.Status) || text(data.Status);
};

const isFailed = (status: string | undefined) => ["failed", "failure", "error", "cancelled", "canceled"].includes(status?.toLowerCase() || "");
const isReady = (status: string | undefined) => ["succeed", "success", "succeeded", "ready", "active", "completed", "done"].includes(status?.toLowerCase() || "");

export async function createAigcElement(input: { name: string; description?: string; imageUrl: string }) {
  const raw = await tokenstarActionJsonRequest<ElementResponse>("/aigc/element", "CreateAigcElement", {
    Name: input.name.slice(0, 30),
    Description: input.description || input.name,
    ReferenceType: "image_refer",
    ElementImageList: { FrontalImage: input.imageUrl, ReferImages: [{ ImageUrl: input.imageUrl }] },
    Provider: ["kling"],
    TagList: [{ TagId: process.env.TOKENSTAR_KLING_ELEMENT_TAG_ID || "o_105" }],
  });
  const elementId = elementIdFrom(raw);
  if (!elementId) throw new TokenStarError(`TokenStar CreateAigcElement did not return ElementId. Response: ${summary(raw)}`, 502);
  return { elementId, raw };
}

export async function describeAigcElement(elementId: string) {
  const raw = await tokenstarActionJsonRequest<ElementResponse>("/aigc/element", "DescribeAigcElement", { ElementId: elementId });
  return { elementId: elementIdFrom(raw) || elementId, status: statusFrom(raw), raw };
}

export async function deleteAigcElement(elementId: string) {
  return tokenstarActionJsonRequest<ElementResponse>("/aigc/element", "DeleteAigcElement", { ElementId: elementId });
}

export async function waitForAigcElement(elementId: string) {
  const attempts = Math.max(1, Math.floor(numberFromEnv("TOKENSTAR_KLING_ELEMENT_MAX_POLL_ATTEMPTS", 40)));
  const intervalMs = Math.max(500, Math.floor(numberFromEnv("TOKENSTAR_KLING_ELEMENT_POLL_INTERVAL_MS", 5000)));
  let last: Awaited<ReturnType<typeof describeAigcElement>> | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await describeAigcElement(elementId);
    if (isFailed(last.status)) throw new TokenStarError(`TokenStar AIGC element "${elementId}" failed (status: ${last.status}). Response: ${summary(last.raw)}`, 422);
    if (isReady(last.status)) return last;
    if (attempt < attempts - 1) await delay(intervalMs);
  }
  throw new TokenStarError(`TokenStar AIGC element "${elementId}" was not ready after ${attempts} checks${last?.status ? ` (last status: ${last.status})` : ""}. Last response: ${summary(last?.raw)}`, 504);
}

export async function resolveAigcElement(input: { elementId?: string; imageUrl?: string; name?: string; description?: string }) {
  if (input.elementId) {
    await waitForAigcElement(input.elementId);
    return input.elementId;
  }
  if (!input.imageUrl) return undefined;
  const created = await createAigcElement({ name: input.name || `subject_${Date.now()}`, description: input.description, imageUrl: input.imageUrl });
  await waitForAigcElement(created.elementId);
  return created.elementId;
}
