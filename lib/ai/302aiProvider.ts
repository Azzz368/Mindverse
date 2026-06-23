import "server-only";
import { request302, request302OpenAI } from "./302aiClient";
import { AIProviderError } from "./errors";
import type { AIProvider, EditImageWithAnnotationsInput, EditImageWithAnnotationsOutput, GenerateAudioInput, GenerateAudioOutput, GenerateImageInput, GenerateImageOutput, GenerateStoryboardInput, GenerateStoryboardOutput, GenerateTextInput, GenerateTextOutput, GenerateVideoInput, GenerateVideoOutput, StoryboardScene } from "./types";

type RecordValue = Record<string, unknown>;
const compact = (value: RecordValue) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
const object = (value: unknown): RecordValue => value && typeof value === "object" ? value as RecordValue : {};
const string = (value: unknown) => typeof value === "string" ? value : undefined;
const taskStatus = (value: unknown): "completed" | "pending" | "failed" => ["completed", "success", "succeeded", "done"].includes(String(value).toLowerCase()) ? "completed" : ["failed", "error", "cancelled"].includes(String(value).toLowerCase()) ? "failed" : "pending";
const cleanJson = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
const normalizeScenes = (value: unknown, fallback: string): StoryboardScene[] => {
  const scenes = object(value).scenes;
  if (!Array.isArray(scenes)) return [{ sceneNumber: 1, description: fallback, visualPrompt: fallback, camera: "Creative framing", duration: 5 }];
  return scenes.map((scene, index) => { const item = object(scene); return { sceneNumber: Number(item.sceneNumber) || index + 1, description: string(item.description) || fallback, visualPrompt: string(item.visualPrompt) || string(item.description) || fallback, camera: string(item.camera) || "Creative framing", duration: Number(item.duration) || 5 }; });
};
const imageExtension = (contentType: string | null) => contentType?.includes("jpeg") ? "jpg" : contentType?.includes("webp") ? "webp" : contentType?.includes("gif") ? "gif" : "png";
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
    const raw = await request302OpenAI<RecordValue>("/chat/completions", { method: "POST", body: JSON.stringify({ model: input.model || process.env.AI_302_TEXT_MODEL || "gpt-4o-mini", messages: [{ role: "system", content: input.systemPrompt || "You are a helpful creative AI assistant." }, { role: "user", content: input.prompt }], temperature: input.temperature ?? 0.7 }) });
    const choice = Array.isArray(raw.choices) ? object(raw.choices[0]) : {}; const content = string(object(choice.message).content) || string(object(choice.delta).content);
    if (!content) throw new Error("302.AI chat completion did not include message content.");
    return { text: content, raw };
  },
  async generateStoryboard(input: GenerateStoryboardInput): Promise<GenerateStoryboardOutput> {
    const result = await this.generateText({ model: input.model || process.env.AI_302_STORYBOARD_MODEL || process.env.AI_302_TEXT_MODEL, temperature: 0.3, systemPrompt: "You create production-ready storyboards. Return only valid JSON, with no Markdown.", prompt: `Create exactly ${input.numberOfScenes} storyboard scenes for this brief. Return strict JSON only: {"scenes":[{"sceneNumber":1,"description":"...","visualPrompt":"...","camera":"...","duration":5}]}. Brief: ${input.storyBrief}` });
    try { return { scenes: normalizeScenes(JSON.parse(cleanJson(result.text)), result.text), rawText: result.text, raw: result.raw }; }
    catch { return { scenes: normalizeScenes({}, result.text), rawText: result.text, raw: result.raw }; }
  },
  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const prompt = input.referenceImageUrl ? `${input.prompt}\nReference image context: ${input.referenceImageUrl}` : input.prompt; // TODO: use image editing once a reference-image endpoint is selected.
    const model = input.model || process.env.AI_302_IMAGE_MODEL || "gpt-image-2";
    const size = (input.size || "1024x1024").replace(/×/g, "x");
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
    form.append("quality", input.quality || "auto");
    form.append("size", (input.size || "1024x1024").replace(/脳/g, "x"));
    form.append("n", "1");
    form.append("background", "auto");
    form.append("output_format", input.outputFormat || "png");
    form.append("output_compression", "100");
    form.append("partial_images", "0");
    if (input.maskImageUrl) { const mask = await downloadImage(input.maskImageUrl, "mask"); form.append("mask", mask.blob, mask.filename); }
    const raw = await request302OpenAI<RecordValue>("/images/edits?response_format=url", { method: "POST", body: form });
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
