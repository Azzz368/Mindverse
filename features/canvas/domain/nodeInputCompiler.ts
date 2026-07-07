import { asRecord, asText } from "./values";
import { imagePromptWithPreset } from "@/shared/workflow/imagePromptPresets";
import type { CanvasNode, CanvasNodeData, ImageAnnotation } from "@/shared/canvas";

export const scenesFrom = (value: unknown) => Array.isArray(value) ? value.map((scene) => { const item = asRecord(scene); return `Scene ${asText(item.sceneNumber)}: ${asText(item.description)}. Visual: ${asText(item.visualPrompt)}. Camera: ${asText(item.camera)}.`; }).join("\n") : "";
export const imageUrlFrom = (node: CanvasNode) => asText(asRecord(node.data.output?.value).imageUrl) || node.data.imageUrl || "";
export const videoUrlFrom = (node: CanvasNode) => { const value = asRecord(node.data.output?.value), raw = asRecord(value.raw), content = asRecord(raw.content); return asText(value.videoUrl) || asText(value.resultUrl) || asText(value.finalVideoUrl) || asText(content.video_url); };
export const audioUrlFrom = (node: CanvasNode) => { const value = asRecord(node.data.output?.value), raw = asRecord(value.raw); return asText(value.audioUrl) || asText(value.resultUrl) || asText(raw.audio_url) || asText(raw.audioUrl) || asText(raw.url); };
export const contextFrom = (upstream: CanvasNode[]) => upstream.map((source) => { const value = source.data.output?.value; if (source.data.nodeType === "script") return `Fictional screenplay JSON:\n${JSON.stringify(value)}`; if (source.data.nodeType === "storyboard") return `Storyboard:\n${scenesFrom(value)}`; if (source.data.nodeType === "image") return `Image direction: ${source.data.generationContext || source.data.prompt || "Generated visual"}`; if (source.data.nodeType === "text") return `Text direction: ${asText(asRecord(value).generatedText)}`; if (source.data.nodeType === "prompt") return `Creative brief: ${asText(asRecord(value).prompt) || source.data.prompt || ""}`; if (source.data.nodeType === "reference") return `Reference notes: ${source.data.notes || ""}`; return ""; }).filter(Boolean).join("\n\n");
export const promptFrom = (node: CanvasNode, upstream: CanvasNode[]) => [node.data.prompt, node.data.instruction, node.data.inputText, node.data.storyBrief, contextFrom(upstream)].filter(Boolean).join("\n\n");
export const percentage = (value: number) => `${Math.round(value * 100)}%`;
export const revisionPromptFrom = (sourcePrompt: string | undefined, annotations: ImageAnnotation[], instruction: string) => {
  const describe = (annotation: ImageAnnotation, index: number) => {
    if (annotation.type === "arrow") return `Annotation ${index + 1}: the ${annotation.color} arrow points from (${percentage(annotation.x1)}, ${percentage(annotation.y1)}) to (${percentage(annotation.x2)}, ${percentage(annotation.y2)}). Requested change: ${annotation.label || "Apply the indicated change."}`;
    if (annotation.type === "text") return `Annotation ${index + 1}: text note at (${percentage(annotation.x)}, ${percentage(annotation.y)}): ${annotation.text}.`;
    return `Annotation ${index + 1}: ${annotation.type} region from (${percentage(annotation.x)}, ${percentage(annotation.y)}) covering ${percentage(annotation.width)} by ${percentage(annotation.height)}. Requested change: ${annotation.label || "Apply the indicated change."}`;
  };
  return [
    "Revise the supplied source image, not a new unrelated image.",
    sourcePrompt ? `Original visual direction: ${sourcePrompt}` : "Preserve the source image's established visual direction.",
    ...annotations.map(describe),
    instruction ? `Overall revision instruction: ${instruction}` : "Keep all unmarked areas visually consistent with the source image.",
    "Apply only the requested visual edits. The final image must not contain arrows, circles, rectangles, text notes, labels, or any annotation UI."
  ].join("\n");
};
export const inputFor = (node: CanvasNode, upstream: CanvasNode[]) => { const d = node.data, prompt = promptFrom(node, upstream), inputs = upstream.map((source) => source.data.output?.value).filter((value) => value !== undefined), upstreamImage = upstream.map(imageUrlFrom).find(Boolean), upstreamImageUrls = upstream.filter((source) => source.data.nodeType === "image").map(imageUrlFrom).filter(Boolean), upstreamReferenceImageUrls = upstream.filter((source) => source.data.nodeType === "reference").map(imageUrlFrom).filter(Boolean), upstreamVideoUrls = upstream.filter((source) => source.data.nodeType === "video").map(videoUrlFrom).filter(Boolean), upstreamAudioUrls = upstream.filter((source) => source.data.nodeType === "audio").map(audioUrlFrom).filter(Boolean); if (d.nodeType === "script") return { storyBrief: prompt, scriptTone: d.scriptTone, numberOfScenes: d.numberOfScenes ?? 3, model: d.model }; if (d.nodeType === "text") return { prompt, model: d.model, temperature: d.temperature, upstreamContext: inputs }; if (d.nodeType === "image") { const upstreamRefImageUrls = [...upstreamReferenceImageUrls, ...upstreamImageUrls].filter(Boolean), upstreamRefImageUrl = upstreamRefImageUrls[0] || upstreamImage || "", referenceImageUrls = [...(d.referenceImageUrl ? [d.referenceImageUrl] : []), ...upstreamRefImageUrls].filter(Boolean).slice(0, 2); return { prompt: imagePromptWithPreset(d.imagePromptPreset, prompt), negativePrompt: d.negativePrompt, model: d.model === "Mock Vision" ? undefined : d.model, size: d.size, aspectRatio: d.aspectRatio, referenceImageUrl: d.referenceImageUrl || upstreamRefImageUrl, referenceImageUrls }; } if (d.nodeType === "video") { const referenceImageUrls = [...(d.referenceImageUrl ? [d.referenceImageUrl] : []), ...upstreamImageUrls, ...upstreamReferenceImageUrls].filter(Boolean); return { prompt, negativePrompt: d.negativePrompt, model: d.model, image: d.referenceImageUrl || upstreamImage, referenceImageUrls, referenceVideoUrls: upstreamVideoUrls, referenceAudioUrls: upstreamAudioUrls, useImageInput: d.videoInputMode === "image-to-video", duration: d.duration, resolution: d.resolution, aspectRatio: d.aspectRatio, fps: d.fps, videoProvider: d.videoProvider, tokenstarMode: d.tokenstarMode, mode: d.tokenstarMode, generateAudio: d.generateAudio, referenceImageAssetUrl: d.referenceImageAssetUrl, referenceVideoAssetUrl: d.referenceVideoAssetUrl, referenceAudioAssetUrl: d.referenceAudioAssetUrl, klingMode: d.klingMode || "image-to-video", klingElementId: d.klingElementId, referenceVideoUrl: d.referenceVideoUrl || upstreamVideoUrls[0] || undefined }; } if (d.nodeType === "audio") return { text: prompt, model: d.model, voice: d.voice, emotion: d.emotion, volume: d.volume, responseFormat: "mp3" }; return { storyBrief: prompt, numberOfScenes: Math.max(1, Math.min(30, d.targetShotCount ?? d.numberOfScenes ?? 6)), model: d.model }; };
export type KeyframePatch = Partial<CanvasNodeData> & Pick<CanvasNodeData, "title" | "status">;
export const keyframePatchFromPrompt = (item: Record<string, unknown>, index: number, sourceId: string, batchId: string): KeyframePatch => ({
  title: `${asText(item.title) || `Shot ${index + 1}`} — Keyframe`,
  status: "idle",
  output: undefined,
  error: undefined,
  prompt: asText(item.prompt),
  negativePrompt: asText(item.negativePrompt),
  aspectRatio: asText(item.aspectRatio) || "16:9",
  size: "1536x1024",
  batchId,
  shotNumber: Number(item.shotNumber) || index + 1,
  sourceStoryboardNodeId: sourceId,
});
