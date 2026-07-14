import { asRecord, asText } from "./values";
import { imagePromptWithPreset } from "@/shared/workflow/imagePromptPresets";
import { videoInputPortsForPreset, videoModelPresetIdFromData, type VideoInputPortKind } from "@/shared/workflow/videoModelPresets";
import type { CanvasNode, CanvasNodeData, ImageAnnotation, WorkflowEdge } from "@/shared/canvas";

const MAX_PROVIDER_PROMPT_LENGTH = 2400;

export const limitProviderPrompt = (value: string, maxLength = MAX_PROVIDER_PROMPT_LENGTH) => {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const sliced = trimmed.slice(0, maxLength);
  const boundaries = ["\n", "。", "！", "？", ".", "!", "?"];
  const boundary = Math.max(...boundaries.map((item) => sliced.lastIndexOf(item)));
  return (boundary > Math.floor(maxLength * 0.72) ? sliced.slice(0, boundary + 1) : sliced).trim();
};

export const scenesFrom = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((scene) => {
          const item = asRecord(scene);
          return `Scene ${asText(item.sceneNumber)}: ${asText(item.description)}. Visual: ${asText(item.visualPrompt)}. Camera: ${asText(item.camera)}.`;
        })
        .join("\n")
    : "";

const archivedMediaUrlFrom = (node: CanvasNode, mediaType: "image" | "video" | "audio") => {
  const archivedMedia = asRecord(node.data.output?.value).archivedMedia;
  if (!Array.isArray(archivedMedia)) return "";
  const archived = archivedMedia
    .map(asRecord)
    .find((item) => asText(item.mediaType) === mediaType && asText(item.cdnUrl));
  return asText(archived?.cdnUrl);
};

export const imageUrlFrom = (node: CanvasNode) => archivedMediaUrlFrom(node, "image") || asText(asRecord(node.data.output?.value).imageUrl) || node.data.imageUrl || "";

export const videoUrlFrom = (node: CanvasNode) => {
  const value = asRecord(node.data.output?.value);
  const raw = asRecord(value.raw);
  const content = asRecord(raw.content);
  const data = asRecord(node.data);
  return archivedMediaUrlFrom(node, "video") || asText(value.videoUrl) || asText(value.resultUrl) || asText(value.finalVideoUrl) || asText(content.video_url) || asText(data.resultUrl);
};

export const audioUrlFrom = (node: CanvasNode) => {
  const value = asRecord(node.data.output?.value);
  const raw = asRecord(value.raw);
  const data = asRecord(node.data);
  return archivedMediaUrlFrom(node, "audio") || asText(value.audioUrl) || asText(value.resultUrl) || asText(raw.audio_url) || asText(raw.audioUrl) || asText(raw.url) || asText(data.audioUrl) || asText(data.resultUrl);
};

const ownPromptFrom = (data: CanvasNodeData) =>
  [data.prompt, data.instruction, data.textContent ?? data.inputText, data.storyBrief].filter(Boolean).join("\n\n");

export const contextFrom = (upstream: CanvasNode[]) =>
  upstream
    .map((source) => {
      const value = source.data.output?.value;
      if (source.data.nodeType === "script") {
        return `Fictional screenplay JSON:\n${JSON.stringify(value)}`;
      }

      if (source.data.nodeType === "storyboard") {
        return `Storyboard:\n${scenesFrom(value)}`;
      }

      if (source.data.nodeType === "image") {
        return `Image direction: ${source.data.generationContext || source.data.prompt || "Generated visual"}`;
      }

      if (source.data.nodeType === "text") {
        return `Text direction: ${source.data.textContent ?? source.data.inputText ?? asText(asRecord(value).generatedText)}`;
      }

      if (source.data.nodeType === "prompt") {
        return `Creative brief: ${asText(asRecord(value).prompt) || source.data.prompt || ""}`;
      }

      if (source.data.nodeType === "reference") {
        return `Reference notes: ${source.data.notes || ""}`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");

export const promptFrom = (node: CanvasNode, upstream: CanvasNode[]) =>
  [ownPromptFrom(node.data), contextFrom(upstream)].filter(Boolean).join("\n\n");

const videoPromptReferences = (prompt: string) =>
  prompt.replace(/@(?:image[_\s-]?|图|素材)?(\d+)/gi, (_, index: string) => `<<<image_${Number(index)}>>>`);

const referencedImageUrlsFrom = (node: CanvasNode, upstream: CanvasNode[]) => {
  const ids = node.data.videoReferenceNodeIds || [];
  if (!ids.length) {
    return [];
  }

  const byId = new Map(upstream.map((item) => [item.id, item]));
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is CanvasNode => Boolean(item))
    .map(imageUrlFrom)
    .filter(Boolean);
};

type UpstreamConnection = { node: CanvasNode; targetHandle?: string | null };

const legacyVideoHandleKind = (handleId: string | undefined | null): VideoInputPortKind | undefined => {
  if (!handleId) return undefined;
  if (handleId === "text") return "text";
  if (handleId === "image" || handleId === "start-frame" || handleId === "ref-image" || handleId.startsWith("ref-image-")) return "image";
  if (handleId === "video" || handleId === "reference-video") return "video";
  if (handleId === "audio" || handleId === "reference-audio") return "audio";
  return undefined;
};

const nodeKind = (source: CanvasNode): VideoInputPortKind | undefined => {
  if (source.data.nodeType === "image" || source.data.nodeType === "reference") return "image";
  if (source.data.nodeType === "video" || source.data.nodeType === "videoEdit" || source.data.nodeType === "motion") return "video";
  if (source.data.nodeType === "audio") return "audio";
  if (["text", "prompt", "script", "storyboard"].includes(source.data.nodeType)) return "text";
  return undefined;
};

const upstreamConnectionsFrom = (upstream: CanvasNode[], incomingEdges: WorkflowEdge[] = []): UpstreamConnection[] => {
  if (!incomingEdges.length) return upstream.map((source) => ({ node: source }));
  return upstream.map((source) => ({
    node: source,
    targetHandle: incomingEdges.find((edge) => edge.source === source.id)?.targetHandle,
  }));
};

const videoSourcesForKind = (connections: UpstreamConnection[], kind: VideoInputPortKind, supportedKinds: Set<VideoInputPortKind>) =>
  connections
    .filter(({ node, targetHandle }) => {
      const handleKind = legacyVideoHandleKind(targetHandle);
      if (handleKind) return handleKind === kind;
      return supportedKinds.has(kind) && nodeKind(node) === kind;
    })
    .map(({ node }) => node);

export const percentage = (value: number) => `${Math.round(value * 100)}%`;

export const revisionPromptFrom = (sourcePrompt: string | undefined, annotations: ImageAnnotation[], instruction: string) => {
  const describe = (annotation: ImageAnnotation, index: number) => {
    if (annotation.type === "arrow") {
      return `Annotation ${index + 1}: the ${annotation.color} arrow points from (${percentage(annotation.x1)}, ${percentage(annotation.y1)}) to (${percentage(annotation.x2)}, ${percentage(annotation.y2)}). Requested change: ${annotation.label || "Apply the indicated change."}`;
    }

    if (annotation.type === "text") {
      return `Annotation ${index + 1}: text note at (${percentage(annotation.x)}, ${percentage(annotation.y)}): ${annotation.text}.`;
    }

    return `Annotation ${index + 1}: ${annotation.type} region from (${percentage(annotation.x)}, ${percentage(annotation.y)}) covering ${percentage(annotation.width)} by ${percentage(annotation.height)}. Requested change: ${annotation.label || "Apply the indicated change."}`;
  };

  return limitProviderPrompt(
    [
      "Revise the supplied source image, not a new unrelated image.",
      sourcePrompt ? `Original visual direction: ${sourcePrompt}` : "Preserve the source image's established visual direction.",
      ...annotations.map(describe),
      instruction ? `Overall revision instruction: ${instruction}` : "Keep all unmarked areas visually consistent with the source image.",
      "Apply only the requested visual edits. The final image must not contain arrows, circles, rectangles, text notes, labels, or any annotation UI.",
    ].join("\n"),
  );
};

export const inputFor = (node: CanvasNode, upstream: CanvasNode[], incomingEdges: WorkflowEdge[] = []) => {
  const d = node.data;
  const prompt = promptFrom(node, upstream);
  const inputs = upstream.map((source) => source.data.output?.value).filter((value) => value !== undefined);
  const upstreamImage = upstream.map(imageUrlFrom).find(Boolean);
  const upstreamImageUrls = upstream.filter((source) => source.data.nodeType === "image").map(imageUrlFrom).filter(Boolean);
  const upstreamReferenceImageUrls = upstream.filter((source) => source.data.nodeType === "reference").map(imageUrlFrom).filter(Boolean);
  const explicitReferenceImageUrls = referencedImageUrlsFrom(node, upstream);

  if (d.nodeType === "script") {
    return {
      storyBrief: limitProviderPrompt(prompt),
      scriptTone: d.scriptTone,
      numberOfScenes: d.numberOfScenes ?? 3,
      model: d.model,
    };
  }

  if (d.nodeType === "text") {
    return {
      prompt: limitProviderPrompt(prompt),
      model: d.model,
      temperature: d.temperature,
      upstreamContext: inputs,
    };
  }

  if (d.nodeType === "image") {
    const upstreamRefImageUrls = [...upstreamReferenceImageUrls, ...upstreamImageUrls].filter(Boolean);
    const upstreamRefImageUrl = upstreamRefImageUrls[0] || upstreamImage || "";
    const referenceImageUrls = [...(d.referenceImageUrl ? [d.referenceImageUrl] : []), ...upstreamRefImageUrls].filter(Boolean).slice(0, 2);

    return {
      prompt: limitProviderPrompt(imagePromptWithPreset(d.imagePromptPreset, prompt)),
      negativePrompt: d.negativePrompt,
      model: d.model === "Mock Vision" ? undefined : d.model,
      size: d.size,
      aspectRatio: d.aspectRatio,
      referenceImageUrl: d.referenceImageUrl || upstreamRefImageUrl,
      referenceImageUrls,
    };
  }

  if (d.nodeType === "video") {
    const activeVideoModel = videoModelPresetIdFromData(d);
    const supportedKinds = new Set(videoInputPortsForPreset(activeVideoModel).map((port) => port.kind));
    const connections = upstreamConnectionsFrom(upstream, incomingEdges);
    const textSources = videoSourcesForKind(connections, "text", supportedKinds);
    const imageSources = videoSourcesForKind(connections, "image", supportedKinds);
    const videoSources = videoSourcesForKind(connections, "video", supportedKinds);
    const audioSources = videoSourcesForKind(connections, "audio", supportedKinds);
    const handleImageUrls = [
      ...imageSources.filter((source) => source.data.nodeType === "image").map(imageUrlFrom),
      ...imageSources.filter((source) => source.data.nodeType === "reference").map(imageUrlFrom),
    ].filter(Boolean);
    const selectedImageUrls = explicitReferenceImageUrls.filter((url) => handleImageUrls.includes(url));
    const referenceImageUrls = supportedKinds.has("image")
      ? [...(d.referenceImageUrl ? [d.referenceImageUrl] : []), ...(selectedImageUrls.length ? selectedImageUrls : handleImageUrls)].filter(Boolean)
      : [];
    const referenceVideoUrls = supportedKinds.has("video") ? videoSources.map(videoUrlFrom).filter(Boolean) : [];
    const referenceAudioUrls = supportedKinds.has("audio") ? audioSources.map(audioUrlFrom).filter(Boolean) : [];
    const promptSources = textSources.length ? textSources : supportedKinds.has("text") ? upstream.filter((source) => nodeKind(source) === "text") : [];
    const videoPrompt = ownPromptFrom(d) || promptFrom(node, promptSources);

    return {
      prompt: limitProviderPrompt(videoPromptReferences(videoPrompt)),
      negativePrompt: d.negativePrompt,
      model: d.model,
      image: supportedKinds.has("image") ? d.referenceImageUrl || referenceImageUrls[0] : undefined,
      referenceImageUrls,
      referenceVideoUrls,
      referenceAudioUrls,
      useImageInput: d.videoInputMode === "image-to-video",
      duration: d.duration,
      resolution: d.resolution,
      aspectRatio: d.aspectRatio,
      fps: d.fps,
      videoProvider: d.videoProvider,
      tokenstarMode: d.tokenstarMode,
      mode: d.tokenstarMode,
      generateAudio: d.generateAudio,
      referenceImageAssetUrl: d.referenceImageAssetUrl,
      referenceVideoAssetUrl: d.referenceVideoAssetUrl,
      referenceAudioAssetUrl: d.referenceAudioAssetUrl,
      klingMode: d.klingMode || "image-to-video",
      klingElementId: d.klingElementId,
      referenceVideoUrl: supportedKinds.has("video") ? d.referenceVideoUrl || referenceVideoUrls[0] || undefined : undefined,
    };
  }

  if (d.nodeType === "videoEdit") {
    const upstreamVideoUrls = upstream
      .filter((source) => source.data.nodeType === "video" || source.data.nodeType === "videoEdit" || source.data.nodeType === "motion")
      .map(videoUrlFrom)
      .filter(Boolean);
    const upstreamAudioUrls = upstream
      .filter((source) => source.data.nodeType === "audio")
      .map(audioUrlFrom)
      .filter(Boolean);
    return {
      prompt: limitProviderPrompt(ownPromptFrom(d) || prompt),
      editPlan: limitProviderPrompt(d.editPlan || ""),
      referenceVideoUrls: upstreamVideoUrls,
      referenceAudioUrls: upstreamAudioUrls,
      preserveAudio: d.preserveAudio !== false,
      originalVolume: d.originalVolume,
      backgroundVolume: d.backgroundVolume,
      fadeIn: d.fadeIn,
      fadeOut: d.fadeOut,
      transition: d.transition || "none",
      resolution: d.resolution || "720p",
      aspectRatio: d.aspectRatio || "16:9",
      fps: d.fps || "30",
    };
  }

  if (d.nodeType === "motion") {
    const referenceVideoUrls = upstream
      .filter((source) => source.data.nodeType === "video" || source.data.nodeType === "videoEdit")
      .map(videoUrlFrom)
      .filter(Boolean);
    const referenceImageUrls = upstream
      .filter((source) => source.data.nodeType === "image" || source.data.nodeType === "reference")
      .map(imageUrlFrom)
      .filter(Boolean);
    const referenceAudioUrls = upstream
      .filter((source) => source.data.nodeType === "audio")
      .map(audioUrlFrom)
      .filter(Boolean);
    return {
      prompt: limitProviderPrompt(ownPromptFrom(d) || prompt),
      compositionJson: d.compositionJson,
      templateId: d.templateId,
      motionVariablesJson: d.motionVariablesJson,
      motionMode: d.motionMode,
      codexInstruction: d.codexInstruction,
      referenceVideoUrls,
      referenceImageUrls,
      referenceAudioUrls,
    };
  }

  if (d.nodeType === "audio") {
    return {
      text: limitProviderPrompt(prompt),
      model: d.model,
      voice: d.voice,
      emotion: d.emotion,
      volume: d.volume,
      responseFormat: "mp3",
    };
  }

  return {
    storyBrief: limitProviderPrompt(prompt),
    numberOfScenes: Math.max(1, Math.min(30, d.targetShotCount ?? d.numberOfScenes ?? 6)),
    model: d.model,
  };
};

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
