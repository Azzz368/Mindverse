import type { CanvasNodeData, NodeType } from "@/shared/canvas";
import { videoTargetHandleForNodeType } from "./videoModelPresets";

const textSourceTypes = new Set<NodeType>(["prompt", "text", "script", "storyboard"]);
const imageSourceTypes = new Set<NodeType>(["image", "reference"]);
const videoSourceTypes = new Set<NodeType>(["video", "videoEdit", "motion"]);
const audioSourceTypes = new Set<NodeType>(["audio", "voiceTTS"]);

export const targetHandleForNodeConnection = (
  sourceType: NodeType,
  targetData: CanvasNodeData,
  preferredHandle?: string | null,
) => {
  if (targetData.nodeType === "image") {
    if (textSourceTypes.has(sourceType)) return "text";
    if (imageSourceTypes.has(sourceType)) {
      return preferredHandle?.startsWith("ref-image-") ? preferredHandle : "ref-image-1";
    }
    return undefined;
  }

  if (targetData.nodeType === "text" || targetData.nodeType === "script") {
    return textSourceTypes.has(sourceType) ? "input-1" : undefined;
  }

  if (targetData.nodeType === "video") {
    return videoTargetHandleForNodeType(sourceType, targetData);
  }

  if (targetData.nodeType === "videoEdit") {
    if (audioSourceTypes.has(sourceType)) return "audio";
    if (videoSourceTypes.has(sourceType)) return "video";
    return undefined;
  }

  if (targetData.nodeType === "voiceTTS") {
    if (sourceType === "voiceClone") return "voice";
    return textSourceTypes.has(sourceType) ? "text" : undefined;
  }

  return preferredHandle || undefined;
};
