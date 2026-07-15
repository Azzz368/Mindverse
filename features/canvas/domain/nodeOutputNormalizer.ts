import { asRecord, asText } from "./values";
import type { CanvasNode, NodeOutput } from "@/shared/canvas";

export const makeOutput = (kind: string, summary: string, value: unknown): NodeOutput => ({
  kind,
  summary,
  value,
  createdAt: new Date().toISOString(),
});

export const outputFor = (format: string | undefined, upstream: CanvasNode[]) => {
  const assets = upstream.map((node) => ({ type: node.data.nodeType, title: node.data.title, output: node.data.output?.value }));
  if (format === "JSON") return { format: "JSON", assets };
  if (format === "Storyboard package") {
    return {
      format: "Storyboard package",
      disclaimer: "Fictional creative scenario. Not a factual report.",
      script: assets.find((asset) => asset.type === "script")?.output,
      shots: assets.find((asset) => asset.type === "storyboard")?.output,
      imagePrompts: assets.find((asset) => asset.type === "storyboardImage")?.output,
      keyframes: assets.filter((asset) => asset.type === "image"),
      assets,
    };
  }
  if (format === "Production sheet") return { format: "Production sheet", sections: assets.map((asset, index) => `#${index + 1} ${asset.type}: ${asset.title}`), assets };
  if (format === "Campaign brief") return { format: "Campaign brief", sections: ["Creative direction", "Core message", "Visual assets", "Motion / audio assets"], assets };
  return { format: "Creative package", sections: ["Creative brief", "Storyboard", "Key visuals", "Motion and audio", "Final assets"], assets };
};

export const outputFromProvider = (nodeType: CanvasNode["data"]["nodeType"], value: unknown): NodeOutput => {
  const data = asRecord(value);
  if (nodeType === "text") {
    const text = asText(data.text);
    return makeOutput("text", text.slice(0, 90), { generatedText: text });
  }
  if (nodeType === "script") {
    const scenes = Array.isArray(data.scenes) ? data.scenes : [];
    const title = asText(data.title) || "Fictional screenplay created";
    return makeOutput("script", `${title} (${scenes.length} scenes)`, value);
  }
  if (nodeType === "storyboard") {
    const scenes = Array.isArray(data.scenes) ? data.scenes : [];
    return makeOutput("storyboard", `${scenes.length} shots created`, scenes);
  }
  if (nodeType === "motion") {
    const composition = asRecord(data.composition || data.motionComposition);
    const elements = Array.isArray(composition.elements) ? composition.elements.length : 0;
    const url = asText(data.videoUrl || data.resultUrl);
    return makeOutput("motion", url ? `Motion video rendered (${elements} elements)` : `Motion composition prepared (${elements} elements)`, value);
  }
  if (nodeType === "voiceClone") {
    const voice = asText(data.voice);
    return makeOutput("clonedVoice", voice ? `Cloned voice ready: ${voice}` : "Cloned voice is not ready", value);
  }
  if (nodeType === "voiceTTS") {
    const audioUrl = asText(data.audioUrl || data.url || data.resultUrl);
    return makeOutput("audio", audioUrl ? "Cloned voice audio generated" : "Cloned voice TTS request submitted", { ...data, audioUrl, url: asText(data.url) || audioUrl });
  }
  const url = asText(data.imageUrl || data.videoUrl || data.audioUrl || data.resultUrl || data.finalVideoUrl);
  const status = asText(data.status);
  const polling = ["pending", "running"].includes(status);
  const label = `${nodeType[0].toUpperCase()}${nodeType.slice(1)}`;
  return makeOutput(nodeType, url ? `${label} generated` : polling ? "Waiting for generation..." : status === "failed" ? `${label} failed` : `${label} request submitted`, value);
};

export const canRunRemotely = (type: CanvasNode["data"]["nodeType"]) =>
  ["text", "script", "image", "video", "videoEdit", "motion", "audio", "voiceClone", "voiceTTS", "storyboard"].includes(type);
