import type { CanvasNode, CanvasNodeData, NodeType, WorkflowEdge } from "@/shared/canvas";
import { videoModelPatch, videoTargetHandleForNodeType } from "@/shared/workflow/videoModelPresets";

const defaults: Record<NodeType, Omit<CanvasNodeData, "nodeType" | "title" | "status">> = {
  prompt: { prompt: "Describe an atmospheric creative direction", negativePrompt: "", style: "Cinematic", aspectRatio: "16:9" },
  text: { instruction: "Turn this brief into an engaging creative draft", model: "", temperature: 0.7 },
  script: { storyBrief: "A fictional creative story", scriptTone: "Cinematic, warm, fictional", numberOfScenes: 3, model: "" },
  image: { prompt: "A cinematic editorial image", model: "gpt-image-2(tokenstar)", size: "2048x2048", referenceImageUrl: "" },
  video: { prompt: "A gentle cinematic movement", aspectRatio: "16:9", referenceImageUrl: "", fps: "", ...videoModelPatch("seedance-2.0"), referenceImageAssetUrl: "", referenceVideoAssetUrl: "", referenceAudioAssetUrl: "" },
  videoEdit: { prompt: "", editPlan: "", preserveAudio: true, transition: "none", resolution: "720p", fps: "30", aspectRatio: "16:9" },
  audio: { prompt: "A warm, modern ambient bed", voiceStyle: "Atmospheric", duration: 12, model: "", voice: "", emotion: "", volume: 1 },
  storyboard: { storyBrief: "A small transformation told in light and motion", numberOfScenes: 3, model: "" },
  storyboardImage: { aspectRatio: "16:9", negativePrompt: "拼贴图, 分屏, 四宫格, 分镜板, 漫画分格, 多面板, 多个画面, 多张图出现在同一张图里, collage, split screen, contact sheet, storyboard grid, comic panels, multiple panels, multiple frames, four images in one image, arrows, labels, UI, watermark, text overlay" },
  reference: { imageUrl: "", notes: "Visual reference and art direction." },
  output: { format: "Creative package" },
};
export function makeNode(type: NodeType, position = { x: 140, y: 120 }): CanvasNode {
  const prefix = type === "videoEdit" ? "Video" : `${type[0].toUpperCase()}${type.slice(1)}`;
  const title = type === "image" ? "Image* GPT Image 2 (TokenStar)" : `${prefix}* New ${prefix}`;
  return { id: `${type}-${crypto.randomUUID()}`, type: "creative", position, data: { nodeType: type, title, status: "idle", ...defaults[type] } };
}
export type Template = { id: string; name: string; description: string; types: NodeType[] };
export const templates: Template[] = [
  { id: "story-package", name: "Story to Storyboard Package", description: "Brief to script to storyboard scenes", types: ["prompt", "script", "storyboard", "output"] },
  { id: "ad", name: "E-commerce Product Ad", description: "Brief → hero visual → campaign copy", types: ["prompt", "image", "text", "output"] },
  { id: "film", name: "Short Film Storyboard", description: "Brief → scenes → keyframe → motion", types: ["prompt", "storyboard", "image", "video", "output"] },
  { id: "music", name: "Music Video Concept", description: "Mood → visual route → motion concept", types: ["prompt", "audio", "storyboard", "video", "output"] },
  { id: "character", name: "Character Design", description: "Reference → prompt → portrait package", types: ["reference", "prompt", "image", "output"] },
  { id: "social", name: "Social Media Campaign", description: "Strategy → copy → imagery → delivery", types: ["prompt", "text", "image", "output"] },
];
export function buildTemplate(template: Template): { nodes: CanvasNode[]; edges: WorkflowEdge[] } {
  const nodes = template.types.map((type, index) => { const node = makeNode(type, { x: 90 + index * 340, y: 170 + (index % 2) * 80 }); const prefix = type === "videoEdit" ? "Video" : `${type[0].toUpperCase()}${type.slice(1)}`; node.data.title = `${prefix}* ${template.name}`; return node; });
  nodes.forEach((node, index) => {
    if (node.data.nodeType !== "video") return;
    const hasUpstreamMedia = nodes.slice(0, index).some((source) => ["image", "reference", "video", "audio"].includes(source.data.nodeType));
    if (hasUpstreamMedia) node.data = { ...node.data, ...videoModelPatch("seedance-2.0-assets") };
  });
  return { nodes, edges: nodes.slice(1).map((node, index) => {
    const source = nodes[index];
    const targetHandle = node.data.nodeType === "video" ? videoTargetHandleForNodeType(source.data.nodeType, node.data) : undefined;
    return { id: `edge-${source.id}-${node.id}`, source: source.id, target: node.id, ...(targetHandle ? { targetHandle } : {}) };
  }) };
}
