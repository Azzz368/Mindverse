import "server-only";

import { AIProviderError } from "../errors";
import { tokenstarFormRequest, tokenstarJsonRequest } from "./tokenstarClient";
import type { GenerateImageInput, GenerateImageOutput, GenerateImageRevisionInput } from "../types";

type RecordValue = Record<string, unknown>;

export const TOKENSTAR_GPT_IMAGE_MODEL = "gpt-image-2(tokenstar)";
export const TOKENSTAR_NANO_BANANA_MODEL = "nano banana(tokenstar)";

const GPT_IMAGE_MODEL = "gpt-image-2";
const NANO_BANANA_MODEL = "gemini-3.1-flash-image-preview";

const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const string = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const compact = (value: RecordValue) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
const normalizeModel = (model?: string) => {
  const value = model?.trim().toLowerCase();
  if (value === TOKENSTAR_GPT_IMAGE_MODEL.toLowerCase() || value === "gpt-image-2-tokenstar") return "gpt";
  if (value === TOKENSTAR_NANO_BANANA_MODEL.toLowerCase() || value === "nano-banana-tokenstar") return "nano";
  return undefined;
};
export const isTokenStarImageModel = (model?: string) => Boolean(normalizeModel(model));
const dataImage = (value: string) => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(value);
  return match ? { mimeType: match[1], data: match[2] } : undefined;
};
const referenceImageUrlsFrom = (input: GenerateImageInput) => {
  const urls = [...(input.referenceImageUrl ? [input.referenceImageUrl] : []), ...(input.referenceImageUrls || [])]
    .map((url) => url.trim())
    .filter(Boolean);
  return Array.from(new Set(urls)).slice(0, 4);
};
const imageSizeForNano = (size?: string) => {
  const normalized = (size || "").replace(/×/g, "x").toLowerCase();
  if (normalized.includes("2048") || normalized.includes("2k")) return "2K";
  return "1K";
};
const aspectRatioFrom = (aspectRatio?: string, size?: string) => {
  const normalized = aspectRatio?.replace(".", ":");
  if (normalized && ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"].includes(normalized)) return normalized;
  const [w, h] = (size || "").replace(/×/g, "x").split("x").map((item) => Number(item));
  if (w && h) {
    if (w === h) return "1:1";
    if (w > h) return w / h > 1.9 ? "21:9" : w / h > 1.45 ? "16:9" : "3:2";
    return h / w > 1.65 ? "9:16" : "2:3";
  }
  return "1:1";
};
const imageExtension = (contentType: string | null) => contentType?.includes("jpeg") ? "jpg" : contentType?.includes("webp") ? "webp" : "png";
const outputFormat = (value?: string) => value?.toLowerCase().includes("webp") ? "webp" : value?.toLowerCase().includes("jpeg") || value?.toLowerCase().includes("jpg") ? "jpeg" : "png";
const imageFromOpenAIResponse = (raw: RecordValue) => {
  const first = Array.isArray(raw.data) ? object(raw.data[0]) : {};
  const encoded = string(first.b64_json) || string(first.base64) || string(first.data);
  const format = outputFormat(string(raw.output_format));
  return string(first.url) || string(raw.image_url) || string(raw.url) || (encoded ? `data:image/${format};base64,${encoded}` : undefined);
};
const imageFromNanoResponse = (raw: RecordValue) => {
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  for (const candidate of candidates) {
    const partsValue = object(object(candidate).content).parts;
    const parts = Array.isArray(partsValue) ? partsValue : [];
    for (const part of parts) {
      const item = object(part);
      const inline = object(item.inlineData || item.inline_data);
      const encoded = string(inline.data);
      if (encoded) return `data:${string(inline.mimeType) || string(inline.mime_type) || "image/png"};base64,${encoded}`;
      const url = string(item.url) || string(item.image_url) || string(item.file_url);
      if (url) return url;
    }
  }
  return string(raw.image_url) || string(raw.url);
};
const downloadImage = async (url: string, field: "image" | "mask") => {
  if (!/^https:\/\//i.test(url) && !/^data:image\//i.test(url)) throw new AIProviderError("Only HTTPS image URLs or data:image URLs can be used for TokenStar image editing.", "INVALID_IMAGE_URL", 400);
  let response: Response;
  try { response = await fetch(url, { cache: "no-store" }); }
  catch (error) { throw new AIProviderError(`Could not download the ${field} for TokenStar image editing: ${error instanceof Error ? error.message : "unknown network error"}`, "IMAGE_DOWNLOAD_FAILED", 400); }
  if (!response.ok) throw new AIProviderError(`Could not download the ${field} for TokenStar image editing (HTTP ${response.status}).`, "IMAGE_DOWNLOAD_FAILED", 400);
  const blob = await response.blob();
  if (!blob.size) throw new AIProviderError(`The ${field} for TokenStar image editing is empty.`, "IMAGE_DOWNLOAD_FAILED", 400);
  return { blob, filename: `${field}.${imageExtension(blob.type || response.headers.get("content-type"))}` };
};
const inlineImagePartFromUrl = async (url: string, index: number) => {
  const inline = dataImage(url);
  if (inline) return { inlineData: inline };
  const { blob } = await downloadImage(url, "image");
  const mimeType = blob.type || "image/png";
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  if (!data) throw new AIProviderError(`TokenStar Nano Banana reference image ${index + 1} could not be converted to base64.`, "IMAGE_CONVERT_FAILED", 400);
  return { inlineData: { mimeType, data } };
};

export async function generateTokenStarImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const route = normalizeModel(input.model);
  if (route === "nano") {
    const referenceUrls = referenceImageUrlsFrom(input);
    const imageParts = await Promise.all(referenceUrls.map((url, index) => inlineImagePartFromUrl(url, index)));
    const raw = await tokenstarJsonRequest<RecordValue>(`/v1beta/models/${NANO_BANANA_MODEL}:generateContent`, {
      contents: [{ role: "user", parts: [{ text: input.prompt }, ...imageParts] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: compact({ aspectRatio: aspectRatioFrom(input.aspectRatio, input.size), imageSize: imageSizeForNano(input.size) }),
      },
    });
    const imageUrl = imageFromNanoResponse(raw);
    return { imageUrl, status: imageUrl ? "completed" : "failed", raw };
  }
  if (input.referenceImageUrl) {
    return generateTokenStarImageRevision({ sourceImageUrl: input.referenceImageUrl, prompt: input.prompt, annotations: [], size: input.size, model: input.model });
  }
  const raw = await tokenstarJsonRequest<RecordValue>("/v1/images/generations", {
    model: GPT_IMAGE_MODEL,
    prompt: input.prompt,
    n: 1,
    size: (input.size || "1024x1024").replace(/×/g, "x"),
    quality: process.env.TOKENSTAR_IMAGE_QUALITY || "low",
    output_format: process.env.TOKENSTAR_IMAGE_OUTPUT_FORMAT || "png",
  });
  const imageUrl = imageFromOpenAIResponse(raw);
  return { imageUrl, status: imageUrl ? "completed" : "failed", raw };
}

export async function generateTokenStarImageRevision(input: GenerateImageRevisionInput): Promise<GenerateImageOutput> {
  const source = await downloadImage(input.sourceImageUrl, "image");
  const form = new FormData();
  form.append("model", GPT_IMAGE_MODEL);
  form.append("image", source.blob, source.filename);
  form.append("prompt", input.prompt || input.instruction || "Revise this image.");
  form.append("n", "1");
  form.append("size", (input.size || "1024x1024").replace(/×/g, "x"));
  form.append("quality", process.env.TOKENSTAR_IMAGE_QUALITY || "low");
  form.append("output_format", process.env.TOKENSTAR_IMAGE_OUTPUT_FORMAT || "png");
  const raw = await tokenstarFormRequest<RecordValue>("/v1/images/edits", form);
  const imageUrl = imageFromOpenAIResponse(raw);
  return { imageUrl, status: imageUrl ? "completed" : "failed", raw };
}
