import { asRecord, asText } from "./values";
import { DEFAULT_QWEN_VOICE_MODEL, qwenTtsLanguageTypes } from "@/shared/api/qwenContracts";
import { imagePromptWithPreset } from "@/shared/workflow/imagePromptPresets";
import { videoAspectRatioForPreset, videoInputPortsForPreset, videoModelPatch, videoModelPresetIdFromData, videoPromptMaxLengthForPreset, videoReferenceLimitForPreset, type VideoInputPortKind } from "@/shared/workflow/videoModelPresets";
import { clampStoryboardSceneCount, storyboardSceneFromValue, storyboardScenesFromValue, storyboardSceneTextFrom } from "@/shared/workflow/storyPipeline";
import type { CanvasNode, CanvasNodeData, ImageAnnotation, WorkflowEdge } from "@/shared/canvas";

const MAX_PROVIDER_PROMPT_LENGTH = 2400;
const MAX_STORY_PROMPT_LENGTH = 12_000;

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
  storyboardScenesFromValue(value).length
    ? storyboardScenesFromValue(value)
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
  return archivedMediaUrlFrom(node, "audio") || asText(value.audioUrl) || asText(value.url) || asText(value.resultUrl) || asText(raw.audio_url) || asText(raw.audioUrl) || asText(raw.url) || asText(data.audioUrl) || asText(data.resultUrl);
};

const ownPromptFrom = (data: CanvasNodeData) =>
  [data.prompt, data.instruction, data.textContent ?? data.inputText, data.storyBrief].filter(Boolean).join("\n\n");

const storyboardScenePromptFrom = (node: CanvasNode, upstream: CanvasNode[]) => {
  const storyboard = upstream.find((source) =>
    source.data.nodeType === "storyboard"
    && (!node.data.sourceStoryboardNodeId || source.id === node.data.sourceStoryboardNodeId));
  const scene = storyboardSceneFromValue(storyboard?.data.output?.value, Number(node.data.shotNumber) || 1);
  return scene ? storyboardSceneTextFrom(scene) : "";
};

const isStoryboardSceneTextNode = (node: CanvasNode, upstream: CanvasNode[]) =>
  node.data.nodeType === "text"
  && (node.data.textSourceMode === "storyboard-scene"
    || (Number(node.data.shotNumber) > 0 && upstream.some((source) => source.data.nodeType === "storyboard")));

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
        return `Text direction: ${asText(asRecord(value).generatedText) || source.data.textContent || source.data.inputText || ""}`;
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

export const promptFrom = (node: CanvasNode, upstream: CanvasNode[]) => {
  const ownPrompt = ownPromptFrom(node.data);
  const storyboardSceneText = isStoryboardSceneTextNode(node, upstream);
  const isolatesStoryboardScene = node.data.nodeType === "image" || storyboardSceneText;
  if (!isolatesStoryboardScene) {
    return [ownPrompt, contextFrom(upstream)].filter(Boolean).join("\n\n");
  }

  // Scene branches must never receive the complete storyboard as hidden context.
  const nonStoryboardContext = contextFrom(upstream.filter((source) => source.data.nodeType !== "storyboard"));
  if (storyboardSceneText) {
    const editableSceneText = (node.data.textContent ?? node.data.inputText ?? node.data.sourceSceneText ?? "").trim();
    const matchingScenePrompt = storyboardScenePromptFrom(node, upstream) || node.data.sourceSceneText || "";
    return [node.data.instruction, editableSceneText || matchingScenePrompt, nonStoryboardContext].filter(Boolean).join("\n\n");
  }

  const matchingScenePrompt = ownPrompt || nonStoryboardContext ? "" : storyboardScenePromptFrom(node, upstream);
  return [ownPrompt, nonStoryboardContext, matchingScenePrompt].filter(Boolean).join("\n\n");
};

type MediaReferenceKind = "image" | "video" | "audio";

const mediaReferenceKindForNode = (node: CanvasNode): MediaReferenceKind | undefined => {
  if (node.data.nodeType === "image" || node.data.nodeType === "reference" || node.data.nodeType === "videoFrame") return "image";
  if (node.data.nodeType === "video" || node.data.nodeType === "videoRegeneration" || node.data.nodeType === "videoEdit" || node.data.nodeType === "motion") return "video";
  if (node.data.nodeType === "audio" || node.data.nodeType === "musicGeneration" || node.data.nodeType === "hkgaiTTS" || node.data.nodeType === "voiceTTS") return "audio";
  return undefined;
};

const videoPromptReferences = (prompt: string, orderedReferences: CanvasNode[]) =>
  prompt.replace(/@(?:image[_\s-]?|video[_\s-]?|audio[_\s-]?|图|视频|音频|素材)?(\d+)/gi, (_, index: string) => {
    const number = Number(index);
    const kind = mediaReferenceKindForNode(orderedReferences[number - 1]) || "image";
    return `<<<${kind}_${number}>>>`;
  });

const imagePromptReferences = (prompt: string) =>
  prompt.replace(/@(?:image[_\s-]?|素材|图片|reference[_\s-]?image[_\s-]?|ref[_\s-]?)?(\d+)/gi, (_, index: string) => `reference image ${Number(index)}`);

const referencedImageUrlsFrom = (node: CanvasNode, upstream: CanvasNode[], ids = node.data.videoReferenceNodeIds || []) => {
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

const selectedSourcesForKind = (sources: CanvasNode[], selectedIds: string[], strictSelection = false) => {
  const selectedSources = sources.filter((source) => selectedIds.includes(source.id));
  // Older workflows only stored selected image IDs. Keep their existing video/audio behaviour
  // until a video or audio reference has actually been explicitly selected.
  return strictSelection || selectedSources.length ? selectedSources : sources;
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
  if (source.data.nodeType === "image" || source.data.nodeType === "reference" || source.data.nodeType === "videoFrame") return "image";
  if (source.data.nodeType === "video" || source.data.nodeType === "videoEdit" || source.data.nodeType === "motion") return "video";
  if (source.data.nodeType === "audio" || source.data.nodeType === "musicGeneration" || source.data.nodeType === "hkgaiTTS" || source.data.nodeType === "voiceTTS") return "audio";
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

const generatedTextFrom = (node: CanvasNode) => {
  const value = asRecord(node.data.output?.value);
  if (node.data.nodeType === "script") {
    const scenes = Array.isArray(value.scenes) ? value.scenes : [];
    return [
      asText(value.title),
      asText(value.logline),
      ...scenes.map((scene, index) => {
        const item = asRecord(scene);
        return [`Scene ${asText(item.sceneNumber) || index + 1}`, asText(item.action), asText(item.visualDirection), asText(item.description)].filter(Boolean).join("\n");
      }),
    ].filter(Boolean).join("\n\n");
  }
  if (node.data.nodeType === "storyboard") return scenesFrom(node.data.output?.value);
  if (node.data.nodeType === "prompt") return asText(value.prompt) || node.data.prompt || "";
  return node.data.textContent || node.data.inputText || asText(value.generatedText) || asText(value.text) || "";
};

const voiceFrom = (node: CanvasNode) => {
  const value = asRecord(node.data.output?.value);
  return {
    voice: asText(value.voice) || node.data.voice || "",
    targetModel: asText(value.targetModel) || node.data.targetModel || DEFAULT_QWEN_VOICE_MODEL,
    voiceProvider: asText(value.voiceProvider) || node.data.voiceProvider,
    language: asText(value.language) || node.data.language,
    fallbackMode: typeof value.fallbackMode === "boolean" ? value.fallbackMode : node.data.fallbackMode,
    fallbackReason: asText(value.fallbackReason) || node.data.fallbackReason,
  };
};

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
  const upstreamImageUrls = upstream.filter((source) => source.data.nodeType === "image" || source.data.nodeType === "videoFrame").map(imageUrlFrom).filter(Boolean);
  const upstreamReferenceImageUrls = upstream.filter((source) => source.data.nodeType === "reference").map(imageUrlFrom).filter(Boolean);
  const explicitReferenceImageUrls = referencedImageUrlsFrom(node, upstream);

  if (d.nodeType === "script") {
    // Script output is rendered separately from the editable brief. Never feed a
    // previous generated screenplay back into the next run as hidden input.
    const scriptBrief = [d.storyBrief, contextFrom(upstream)].filter(Boolean).join("\n\n");
    return {
      storyBrief: limitProviderPrompt(scriptBrief, MAX_STORY_PROMPT_LENGTH),
      scriptTone: d.scriptTone,
      numberOfScenes: clampStoryboardSceneCount(d.numberOfScenes),
    };
  }

  if (d.nodeType === "text") {
    const storyboardSceneText = isStoryboardSceneTextNode(node, upstream);
    return {
      prompt: limitProviderPrompt(prompt),
      temperature: d.temperature,
      upstreamContext: storyboardSceneText ? undefined : inputs,
    };
  }

  if (d.nodeType === "image") {
    const upstreamRefImageUrls = [...upstreamReferenceImageUrls, ...upstreamImageUrls].filter(Boolean);
    const selectedRefImageUrls = referencedImageUrlsFrom(node, upstream, d.imageReferenceNodeIds || []);
    const nodeReferenceImageUrls = selectedRefImageUrls.length ? selectedRefImageUrls : upstreamRefImageUrls;
    const referenceImageUrls = [...(d.referenceImageUrl ? [d.referenceImageUrl] : []), ...nodeReferenceImageUrls].filter(Boolean).slice(0, 4);
    const upstreamRefImageUrl = referenceImageUrls[0] || upstreamRefImageUrls[0] || upstreamImage || "";

    return {
      prompt: limitProviderPrompt(imagePromptWithPreset(d.imagePromptPreset, imagePromptReferences(prompt))),
      negativePrompt: d.negativePrompt,
      model: d.model === "Mock Vision" ? undefined : d.model,
      size: d.size,
      aspectRatio: d.aspectRatio,
      resolution: d.resolution,
      referenceImageUrl: d.referenceImageUrl || upstreamRefImageUrl,
      referenceImageUrls,
    };
  }

  if (d.nodeType === "video") {
    const activeVideoModel = videoModelPresetIdFromData(d);
    const activeVideoPatch = videoModelPatch(activeVideoModel);
    const supportedKinds = new Set(videoInputPortsForPreset(activeVideoModel).map((port) => port.kind));
    const connections = upstreamConnectionsFrom(upstream, incomingEdges);
    const hasExplicitReferenceSelection = d.videoReferenceSelectionActive === true;
    const textSources = videoSourcesForKind(connections, "text", supportedKinds);
    const imageSources = videoSourcesForKind(connections, "image", supportedKinds);
    const videoSources = videoSourcesForKind(connections, "video", supportedKinds);
    const audioSources = videoSourcesForKind(connections, "audio", supportedKinds);
    const handleImageUrls = imageSources.map(imageUrlFrom).filter(Boolean);
    const selectedImageUrls = explicitReferenceImageUrls.filter((url) => handleImageUrls.includes(url));
    const allReferenceImageUrls = supportedKinds.has("image")
      ? [...(d.referenceImageUrl ? [d.referenceImageUrl] : []), ...(hasExplicitReferenceSelection ? selectedImageUrls : selectedImageUrls.length ? selectedImageUrls : handleImageUrls)].filter(Boolean)
      : [];
    const imageLimit = videoReferenceLimitForPreset(activeVideoModel, "image");
    const videoLimit = videoReferenceLimitForPreset(activeVideoModel, "video");
    const audioLimit = videoReferenceLimitForPreset(activeVideoModel, "audio");
    const referenceImageUrls = imageLimit === undefined ? allReferenceImageUrls : allReferenceImageUrls.slice(0, imageLimit);
    const allReferenceVideoUrls = supportedKinds.has("video") ? selectedSourcesForKind(videoSources, d.videoReferenceNodeIds || [], hasExplicitReferenceSelection).map(videoUrlFrom).filter(Boolean) : [];
    const allReferenceAudioUrls = supportedKinds.has("audio") ? selectedSourcesForKind(audioSources, d.videoReferenceNodeIds || [], hasExplicitReferenceSelection).map(audioUrlFrom).filter(Boolean) : [];
    const referenceVideoUrls = videoLimit === undefined ? allReferenceVideoUrls : allReferenceVideoUrls.slice(0, videoLimit);
    const referenceAudioUrls = audioLimit === undefined ? allReferenceAudioUrls : allReferenceAudioUrls.slice(0, audioLimit);
    const promptSources = textSources.length ? textSources : supportedKinds.has("text") ? upstream.filter((source) => nodeKind(source) === "text") : [];
    const videoPrompt = ownPromptFrom(d) || promptFrom(node, promptSources);
    const promptMaxLength = videoPromptMaxLengthForPreset(activeVideoModel);
    const orderedPromptReferences = (d.videoReferenceNodeIds || [])
      .map((referenceId) => upstream.find((source) => source.id === referenceId))
      .filter((source): source is CanvasNode => Boolean(source));
    const compiledVideoPrompt = activeVideoModel === "minimax-h3-hkgai"
      ? imagePromptReferences(videoPrompt)
      : videoPromptReferences(videoPrompt, orderedPromptReferences);
    // A selected TalkingData asset:// reference has already passed through the
    // private trusted-material flow. Do not also send a connected public image
    // URL, because the provider will evaluate that URL as a separate image and
    // can reject a real-person photo before the private asset is considered.
    const useTalkingDataPrivateImage = activeVideoModel === "talkingdata-yunzhu80" && Boolean(d.referenceImageAssetUrl);

    return {
      prompt: limitProviderPrompt(compiledVideoPrompt, promptMaxLength),
      videoModelPreset: activeVideoModel,
      negativePrompt: d.negativePrompt,
      model: activeVideoPatch.model,
      image: useTalkingDataPrivateImage ? undefined : supportedKinds.has("image") ? d.referenceImageUrl || referenceImageUrls[0] : undefined,
      referenceImageUrls: useTalkingDataPrivateImage ? [] : referenceImageUrls,
      referenceVideoUrls,
      referenceAudioUrls,
      useImageInput: activeVideoPatch.videoInputMode === "image-to-video",
      duration: d.duration,
      audioFlowShift: d.audioFlowShift,
      resolution: d.resolution,
      aspectRatio: videoAspectRatioForPreset(activeVideoModel, d.aspectRatio),
      fps: d.fps,
      videoProvider: activeVideoPatch.videoProvider,
      tokenstarMode: activeVideoPatch.tokenstarMode,
      mode: activeVideoPatch.tokenstarMode,
      generateAudio: d.generateAudio,
      referenceImageAssetUrl: d.referenceImageAssetUrl,
      referenceVideoAssetUrl: d.referenceVideoAssetUrl,
      referenceAudioAssetUrl: d.referenceAudioAssetUrl,
      talkingDataImageMode: d.talkingDataImageMode,
      talkingDataEndImageUrl: d.talkingDataEndImageUrl,
      talkingDataOmniReferenceTaskType: d.talkingDataOmniReferenceTaskType,
      talkingDataOutputFormat: d.talkingDataOutputFormat,
      talkingDataWatermark: d.talkingDataWatermark,
      talkingDataReturnLastFrame: d.talkingDataReturnLastFrame,
      talkingDataWebSearch: d.talkingDataWebSearch,
      klingMode: activeVideoPatch.klingMode || "image-to-video",
      klingElementId: d.klingElementId,
      referenceVideoUrl: supportedKinds.has("video") ? d.referenceVideoUrl || referenceVideoUrls[0] || undefined : undefined,
    };
  }

  if (d.nodeType === "videoEdit") {
    const upstreamVideoUrls = upstream
      .filter((source) => source.data.nodeType === "video" || source.data.nodeType === "videoRegeneration" || source.data.nodeType === "videoEdit" || source.data.nodeType === "motion")
      .map(videoUrlFrom);
    const upstreamAudioUrls = upstream
      .filter((source) => source.data.nodeType === "audio" || source.data.nodeType === "musicGeneration" || source.data.nodeType === "hkgaiTTS" || source.data.nodeType === "voiceTTS")
      .map(audioUrlFrom);
    return {
      prompt: limitProviderPrompt(ownPromptFrom(d) || prompt),
      // editPlan is executable JSON consumed locally by the FFmpeg runner, not
      // a provider prompt. Truncating it can turn a valid plan into invalid JSON.
      editPlan: d.editPlan || "",
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
    const motionPrompt = limitProviderPrompt(ownPromptFrom(d) || prompt);
    const previousOutput = asRecord(d.output?.value);
    const previousProjectDir = asText(previousOutput.hyperframesProjectDir);
    const previousProjectId = d.hyperframesProjectId
      || asText(previousOutput.hyperframesProjectId)
      || previousProjectDir.split(/[\\/]/).filter(Boolean).at(-1)
      || "";
    const referenceVideoUrls = upstream
      .filter((source) => source.data.nodeType === "video" || source.data.nodeType === "videoRegeneration" || source.data.nodeType === "videoEdit")
      .map(videoUrlFrom)
      .filter(Boolean);
    const referenceImageUrls = upstream
      .filter((source) => source.data.nodeType === "image" || source.data.nodeType === "reference")
      .map(imageUrlFrom)
      .filter(Boolean);
    const referenceAudioUrls = upstream
      .filter((source) => source.data.nodeType === "audio" || source.data.nodeType === "musicGeneration" || source.data.nodeType === "hkgaiTTS" || source.data.nodeType === "voiceTTS")
      .map(audioUrlFrom)
      .filter(Boolean);
    return {
      prompt: motionPrompt,
      compositionJson: d.compositionJson,
      motionMode: "codex-hyperframes",
      codexInstruction: motionPrompt,
      hyperframesProjectId: previousProjectId || undefined,
      referenceVideoUrls,
      referenceImageUrls,
      referenceAudioUrls,
    };
  }

  if (d.nodeType === "voiceClone") {
    return {
      voice: d.voice,
      targetModel: d.targetModel || DEFAULT_QWEN_VOICE_MODEL,
      language: d.language,
      fallbackMode: d.fallbackMode,
      fallbackReason: d.fallbackReason,
    };
  }

  if (d.nodeType === "voiceTTS") {
    const connections = upstreamConnectionsFrom(upstream, incomingEdges);
    const manualText = (d.ttsText || d.inputText || "").trim();
    const textSource = connections.find((connection) => connection.targetHandle === "text")?.node
      || connections.find((connection) => ["text", "prompt", "script", "storyboard"].includes(connection.node.data.nodeType))?.node;
    const voiceSource = connections.find((connection) => connection.targetHandle === "voice")?.node
      || connections.find((connection) => connection.node.data.nodeType === "voiceClone")?.node;
    const clonedVoice = voiceSource ? voiceFrom(voiceSource) : undefined;
    const languageType = qwenTtsLanguageTypes.includes(d.languageType || "Auto") ? d.languageType || "Auto" : "Auto";
    return {
      text: manualText || (textSource ? generatedTextFrom(textSource) : limitProviderPrompt(prompt)),
      voice: clonedVoice?.voice || d.voice,
      targetModel: clonedVoice?.targetModel || d.targetModel || DEFAULT_QWEN_VOICE_MODEL,
      voiceProvider: clonedVoice?.voiceProvider || d.voiceProvider,
      languageType,
    };
  }

  if (d.nodeType === "videoRegeneration") {
    const connections = upstreamConnectionsFrom(upstream, incomingEdges);
    const sourcesForHandle = (handle: string) => connections.filter((connection) => connection.targetHandle === handle).map((connection) => connection.node);
    const baseVideoSources = sourcesForHandle("base-video");
    const baseVideos = baseVideoSources.map(videoUrlFrom).filter(Boolean);
    const textSources = sourcesForHandle("text");
    const firstFrameUrl = sourcesForHandle("first-frame").map(imageUrlFrom).find(Boolean);
    const lastFrameUrl = sourcesForHandle("last-frame").map(imageUrlFrom).find(Boolean);
    const referenceImageUrls = sourcesForHandle("reference-image").map(imageUrlFrom).filter(Boolean);
    const referenceVideoUrls = sourcesForHandle("reference-video").map(videoUrlFrom).filter(Boolean);
    const referenceAudioUrls = sourcesForHandle("reference-audio").map(audioUrlFrom).filter(Boolean);
    return {
      mode: d.regenerationMode || "base-video",
      sourceTaskId: d.sourceTaskId,
      prompt: limitProviderPrompt(ownPromptFrom(d) || (textSources[0] ? generatedTextFrom(textSources[0]) : "") || baseVideoSources[0]?.data.prompt || baseVideoSources[0]?.data.generationContext || "", 40_000),
      baseVideoUrl: baseVideos[0],
      baseVideoCount: baseVideos.length,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls,
      referenceVideoUrls,
      referenceAudioUrls,
      aigcWatermark: d.aigcWatermark === true,
    };
  }

  if (d.nodeType === "musicGeneration") {
    const connections = upstreamConnectionsFrom(upstream, incomingEdges);
    const textSource = connections.find((connection) => connection.targetHandle === "text")?.node
      || connections.find((connection) => ["text", "prompt", "script", "storyboard"].includes(connection.node.data.nodeType))?.node;
    return {
      name: d.musicName || "mindverse_track",
      tags: d.musicTags || "",
      userPrompt: (d.prompt || "").trim() || (textSource ? generatedTextFrom(textSource) : limitProviderPrompt(prompt)),
    };
  }

  if (d.nodeType === "hkgaiTTS") {
    const connections = upstreamConnectionsFrom(upstream, incomingEdges);
    const textSource = connections.find((connection) => connection.targetHandle === "text")?.node
      || connections.find((connection) => ["text", "prompt", "script", "storyboard"].includes(connection.node.data.nodeType))?.node;
    return {
      text: (d.ttsText || d.inputText || "").trim() || (textSource ? generatedTextFrom(textSource) : limitProviderPrompt(prompt)),
      voiceId: d.voice || "",
      instructions: d.ttsInstructions,
      xVectorOnly: d.xVectorOnly !== false,
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
    storyBrief: limitProviderPrompt(prompt, MAX_STORY_PROMPT_LENGTH),
    numberOfScenes: clampStoryboardSceneCount(d.targetShotCount ?? d.numberOfScenes),
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
