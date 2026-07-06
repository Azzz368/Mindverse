import "server-only";
import { request302, request302OpenAI } from "./302aiClient";
import { AIProviderError } from "./errors";
import { requestChatCompletion, storyboardModel, textModel, textProvider } from "./textLLMClient";
import { professionalStoryboardInstructionFromSkill } from "@/server/workflow/storySkillPrompts";
import type { AIProvider, EditImageWithAnnotationsInput, EditImageWithAnnotationsOutput, GenerateAudioInput, GenerateAudioOutput, GenerateImageInput, GenerateImageOutput, GenerateStoryboardInput, GenerateStoryboardOutput, GenerateTextInput, GenerateTextOutput, GenerateVideoInput, GenerateVideoOutput, StoryboardScene } from "./types";

type RecordValue = Record<string, unknown>;
const compact = (value: RecordValue) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
const object = (value: unknown): RecordValue => value && typeof value === "object" ? value as RecordValue : {};
const string = (value: unknown) => typeof value === "string" ? value : undefined;
const taskStatus = (value: unknown): "completed" | "pending" | "failed" => ["completed", "success", "succeeded", "done"].includes(String(value).toLowerCase()) ? "completed" : ["failed", "error", "cancelled"].includes(String(value).toLowerCase()) ? "failed" : "pending";
const cleanJson = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
const parseJson = (value: string) => {
  const cleaned = cleanJson(value);
  try { return JSON.parse(cleaned) as unknown; } catch {}
  const objectStart = cleaned.indexOf("{"), objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) return JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as unknown;
  const arrayStart = cleaned.indexOf("["), arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1)) as unknown;
  throw new Error("No parseable JSON found.");
};
const sceneArrayFrom = (value: unknown) => {
  const data = object(value);
  const candidates = [value, data.scenes, data.shots, data.storyboard];
  return candidates.find(Array.isArray) as unknown[] | undefined;
};
const normalizeScenes = (value: unknown, fallback: string, requestedCount: number): StoryboardScene[] => {
  const count = Math.max(1, Math.min(30, Math.round(Number(requestedCount) || 1)));
  const scenes = sceneArrayFrom(value) || [];
  const normalized = scenes.map((scene, index) => {
    const item = object(scene);
    const description = string(item.description) || string(item.action) || string(item.summary) || fallback;
    return {
      sceneNumber: Number(item.sceneNumber || item.shotNumber) || index + 1,
      description,
      visualPrompt: string(item.visualPrompt) || string(item.imagePrompt) || description,
      camera: string(item.camera) || string(item.cameraDirection) || "电影感单镜头构图，保持前后连续性",
      duration: Number(item.duration) || 5,
    };
  });
  while (normalized.length < count) {
    const next = normalized.length + 1;
    normalized.push({
      sceneNumber: next,
      description: `第 ${next} 镜：延续前一镜的动作和情绪，继续推进：${fallback}`,
      visualPrompt: `第 ${next} 镜，一张单独电影关键帧画面，保持同一人物、服装、场景、光线和故事连续性：${fallback}`,
      camera: "电影感单镜头构图，保持前后连续性",
      duration: 5,
    });
  }
  return normalized.slice(0, count).map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
};
const imageExtension = (contentType: string | null) => contentType?.includes("jpeg") ? "jpg" : contentType?.includes("webp") ? "webp" : contentType?.includes("gif") ? "gif" : "png";
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const dataImage = (value: string) => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(value);
  return match ? { mime_type: match[1], data: match[2] } : undefined;
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
  return undefined;
};
const geminiImageUrlFrom = (raw: RecordValue) => {
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  for (const candidate of candidates) {
    const partsValue = object(object(candidate).content).parts;
    const parts = Array.isArray(partsValue) ? partsValue : [];
    for (const part of parts) {
      const item = object(part);
      const url = string(item.url) || string(item.image_url) || string(item.file_url);
      if (url) return url;
      const inline = object(item.inline_data);
      const encoded = string(inline.data);
      if (encoded) return `data:${string(inline.mime_type) || "image/png"};base64,${encoded}`;
    }
  }
  return string(raw.url) || string(raw.image_url);
};
const downloadImage = async (url: string, field: "image" | "mask") => {
  if (!/^https:\/\//i.test(url) && !/^data:image\//i.test(url)) throw new AIProviderError("Only HTTPS image URLs or data:image URLs can be used for image editing.", "INVALID_IMAGE_URL", 400);
  let response: Response;
  try { response = await fetch(url, { cache: "no-store" }); }
  catch (error) { throw new AIProviderError(`Could not download the ${field === "image" ? "source image" : "mask image"} for editing: ${error instanceof Error ? error.message : "unknown network error"}`, "IMAGE_DOWNLOAD_FAILED", 400); }
  if (!response.ok) throw new AIProviderError(`Could not download the ${field === "image" ? "source image" : "mask image"} for editing (HTTP ${response.status}).`, "IMAGE_DOWNLOAD_FAILED", 400);
  const blob = await response.blob();
  if (!blob.size) throw new AIProviderError(`The ${field === "image" ? "source image" : "mask image"} is empty.`, "IMAGE_DOWNLOAD_FAILED", 400);
  return { blob, filename: `${field}.${imageExtension(blob.type || response.headers.get("content-type"))}` };
};

export const ai302Provider: AIProvider = {
  name: "302ai",
  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const fallbackModel = input.model || process.env.AI_302_TEXT_MODEL || "gpt-4o-mini";
    const raw = await requestChatCompletion<RecordValue>({ provider: textProvider(), body: { model: textModel(fallbackModel), messages: [{ role: "system", content: input.systemPrompt || "You are a helpful creative AI assistant." }, { role: "user", content: input.prompt }], temperature: input.temperature ?? 0.7 } });
    const choice = Array.isArray(raw.choices) ? object(raw.choices[0]) : {}; const content = string(object(choice.message).content) || string(object(choice.delta).content);
    if (!content) throw new Error("302.AI chat completion did not include message content.");
    return { text: content, raw };
  },
  async generateStoryboard(input: GenerateStoryboardInput): Promise<GenerateStoryboardOutput> {
    const fallbackModel = input.model || process.env.AI_302_STORYBOARD_MODEL || process.env.AI_302_TEXT_MODEL || "gpt-4o-mini";
    const result = await this.generateText({
      model: storyboardModel(fallbackModel),
      temperature: 0.25,
      systemPrompt: "你是一名电影导演、分镜指导和连续性监督。只返回严格 JSON，不要 Markdown。",
      prompt: professionalStoryboardInstructionFromSkill(input.storyBrief, input.numberOfScenes)
    });
    try { return { scenes: normalizeScenes(parseJson(result.text), result.text, input.numberOfScenes), rawText: result.text, raw: result.raw }; }
    catch { return { scenes: normalizeScenes({}, result.text, input.numberOfScenes), rawText: result.text, raw: result.raw }; }
  },
  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const model = input.model || process.env.AI_302_IMAGE_MODEL || "gpt-image-2";
    const size = (input.size || "1024x1024").replace(/×/g, "x");
    if (model === GEMINI_IMAGE_MODEL) {
      const imageUrls = (input.referenceImageUrls?.length ? input.referenceImageUrls : input.referenceImageUrl ? [input.referenceImageUrl] : []).slice(0, 2);
      const imageParts = imageUrls.map((url) => {
        const inlineImage = dataImage(url);
        return inlineImage ? { inline_data: inlineImage } : { image_url: url };
      });
      const raw = await request302<RecordValue>(`/google/v1/models/${GEMINI_IMAGE_MODEL}?response_format=url`, {
        method: "POST",
        body: JSON.stringify({
          contents: [{ parts: [{ text: input.prompt }, ...imageParts] }],
          generationConfig: compact({
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: compact({ aspectRatio: aspectRatioFrom(input.aspectRatio, size) }),
          }),
        }),
      });
      const imageUrl = geminiImageUrlFrom(raw);
      return { imageUrl, status: imageUrl ? "completed" : "failed", raw };
    }
    if (input.referenceImageUrl) {
      const edited = await this.editImageWithAnnotations({
        sourceImageUrl: input.referenceImageUrl,
        prompt: input.prompt,
        size,
        quality: "low",
        outputFormat: "png",
      });
      return { imageUrl: edited.revisedImageUrl, status: edited.status, raw: edited.raw };
    }
    const prompt = input.prompt;
    const isGptImage = /^gpt-image-/i.test(model);
    const raw = isGptImage
      ? await request302OpenAI<RecordValue>("/images/generations", { method: "POST", body: JSON.stringify(compact({ prompt, model, n: 1, size, quality: "auto", background: "auto", moderation: "auto", output_format: "png" })) })
      : await request302<RecordValue>("/302/images/generations", { method: "POST", body: JSON.stringify(compact({ prompt, model, n: 1, response_format: "url", size, aspect_ratio: input.aspectRatio })) });
    const first = Array.isArray(raw.data) ? object(raw.data[0]) : {};
    const encoded = string(first.b64_json) || string(first.base64) || string(first.data);
    const format = string(raw.output_format) || "png";
    const imageUrl = string(first.url) || string(raw.image_url) || string(raw.url) || (encoded ? `data:image/${format};base64,${encoded}` : undefined);
    const taskId = string(raw.task_id) || string(raw.taskId);
    return { imageUrl, taskId, status: imageUrl ? "completed" : taskId ? "pending" : "failed", raw };
  },
  async editImageWithAnnotations(input: EditImageWithAnnotationsInput): Promise<EditImageWithAnnotationsOutput> {
    const image = await downloadImage(input.sourceImageUrl, "image");
    const form = new FormData();
    form.append("image", image.blob, image.filename);
    form.append("prompt", input.prompt);
    form.append("model", "gpt-image-2");
    form.append("quality", input.quality || "low");
    form.append("size", (input.size || "1024x1024").replace(/脳/g, "x"));
    form.append("n", "1");
    form.append("output_format", input.outputFormat || "png");
    if (input.maskImageUrl) { const mask = await downloadImage(input.maskImageUrl, "mask"); form.append("mask", mask.blob, mask.filename); }
    const raw = await request302OpenAI<RecordValue>("/images/edits", { method: "POST", body: form });
    const first = Array.isArray(raw.data) ? object(raw.data[0]) : {};
    const encoded = string(first.b64_json) || string(first.base64) || string(first.data);
    const format = string(raw.output_format) || input.outputFormat || "png";
    const revisedImageUrl = string(first.url) || string(raw.image_url) || (encoded ? `data:image/${format};base64,${encoded}` : undefined);
    return { revisedImageUrl, status: revisedImageUrl ? "completed" : "failed", raw };
  },
  async generateImageRevision(input) { const edited = await this.editImageWithAnnotations({ sourceImageUrl: input.sourceImageUrl, prompt: input.prompt || input.instruction || "Revise this image.", size: input.size }); return { imageUrl: edited.revisedImageUrl, status: edited.status, raw: edited.raw }; },
  async generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
    const model = input.model || process.env.AI_302_VIDEO_MODEL || "minimaxi-t2v-01";
    // T2V models reject an image payload. For them the upstream image's creative context is already folded into the prompt by the canvas.
    const supportsImageInput = input.useImageInput ?? /(?:^|[-_])(?:i2v|img2video|image2video)(?:[-_]|$)|image-to-video/i.test(model);
    const raw = await request302<RecordValue>("/302/v2/video/create?webhook=undefined", { method: "POST", body: JSON.stringify(compact({ model, prompt: input.prompt, negative_prompt: input.negativePrompt, image: supportsImageInput ? input.image : undefined, end_image: supportsImageInput ? input.endImage : undefined, video: input.video, duration: input.duration, resolution: input.resolution, aspect_ratio: input.aspectRatio, fps: input.fps })) });
    const taskId = string(raw.task_id) || string(raw.taskId); const videoUrl = string(raw.video_url) || string(raw.videoUrl); return { taskId, videoUrl, status: videoUrl ? "completed" : taskStatus(raw.status), raw };
  },
  async generateAudio(input: GenerateAudioInput): Promise<GenerateAudioOutput> {
    const raw = await request302<RecordValue>("/302/audio/speech", { method: "POST", body: JSON.stringify(compact({ input: input.text, model: input.model || process.env.AI_302_TTS_MODEL || "doubao", voice: input.voice || process.env.AI_302_TTS_VOICE || "zh_male_beijingxiaoye_emo_v2_mars_bigtts", response_format: input.responseFormat || "mp3", stream_format: "url", emotion: input.emotion, volume: input.volume })) });
    const audioUrl = string(raw.audio_url) || string(raw.audioUrl) || string(raw.url); const taskId = string(raw.task_id) || string(raw.taskId); return { audioUrl, taskId, status: audioUrl ? "completed" : taskId ? "pending" : "failed", raw };
  },
  async listModels() { try { const raw = await request302OpenAI<RecordValue>("/models?llm=1"); return Array.isArray(raw.data) ? raw.data.filter((item): item is { id: string; object?: string; [key: string]: unknown } => typeof object(item).id === "string").map((item) => item as { id: string; object?: string; [key: string]: unknown }) : []; } catch (error) { console.error("302.AI model list request failed", error instanceof Error ? error.message : "Unknown error"); return []; } },
  async pollTask(type, taskId) {
    if (type === "video") { const raw = await request302<RecordValue>(`/302/v2/video/fetch/${encodeURIComponent(taskId)}`); const videoUrl = string(raw.video_url) || string(raw.videoUrl); return { taskId, videoUrl, status: videoUrl ? "completed" : taskStatus(raw.status), raw } satisfies GenerateVideoOutput; }
    if (type === "audio") { const raw = await request302<RecordValue>(`/302/v2/audio/fetch/${encodeURIComponent(taskId)}`); const audioUrl = string(raw.audio_url) || string(raw.audioUrl) || string(raw.url); return { taskId, audioUrl, status: audioUrl ? "completed" : taskStatus(raw.status), raw } satisfies GenerateAudioOutput; }
    return { taskId, status: "pending", raw: { message: "Image task polling is not configured yet." } } satisfies GenerateImageOutput;
  },
};
