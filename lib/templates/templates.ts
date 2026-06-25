import type { CanvasNode, CanvasNodeData, NodeType, WorkflowEdge } from "@/types/canvas";

const defaults: Record<NodeType, Omit<CanvasNodeData, "nodeType" | "title" | "status">> = {
  prompt: { prompt: "Describe an atmospheric creative direction", negativePrompt: "", style: "Cinematic", aspectRatio: "16:9" },
  text: { instruction: "Turn this brief into an engaging creative draft", inputText: "", model: "", temperature: 0.7 },
  script: { storyBrief: "A fictional creative story", scriptTone: "Cinematic, warm, fictional", numberOfScenes: 3, model: "" },
  image: { prompt: "A cinematic editorial image", model: "", size: "1024x1024", referenceImageUrl: "" },
  video: { prompt: "A gentle cinematic movement", duration: 5, aspectRatio: "16:9", referenceImageUrl: "", model: "", resolution: "", fps: "", videoInputMode: "text-to-video", videoProvider: "kling", klingMode: "image-to-video", tokenstarMode: "text-to-video", generateAudio: true, referenceImageAssetUrl: "", referenceVideoAssetUrl: "", referenceAudioAssetUrl: "" },
  audio: { prompt: "A warm, modern ambient bed", voiceStyle: "Atmospheric", duration: 12, model: "", voice: "", emotion: "", volume: 1 },
  storyboard: { storyBrief: "A small transformation told in light and motion", numberOfScenes: 3, model: "" },
  storyboardImage: { aspectRatio: "16:9", negativePrompt: "arrows, labels, UI, watermark, text overlay" },
  reference: { imageUrl: "", notes: "Visual reference and art direction." },
  output: { format: "Creative package" },
};
export function makeNode(type: NodeType, position = { x: 140, y: 120 }): CanvasNode {
  return { id: `${type}-${crypto.randomUUID()}`, type: "creative", position, data: { nodeType: type, title: `New ${type[0].toUpperCase()}${type.slice(1)}`, status: "idle", ...defaults[type] } };
}
export type Template = { id: string; name: string; description: string; types: NodeType[] };
export const templates: Template[] = [
  { id: "story-package", name: "Story to Storyboard Package", description: "Brief to script to shots to keyframe prompts", types: ["prompt", "script", "storyboard", "storyboardImage", "output"] },
  { id: "ad", name: "E-commerce Product Ad", description: "Brief → hero visual → campaign copy", types: ["prompt", "image", "text", "output"] },
  { id: "film", name: "Short Film Storyboard", description: "Brief → scenes → keyframe → motion", types: ["prompt", "storyboard", "image", "video", "output"] },
  { id: "music", name: "Music Video Concept", description: "Mood → visual route → motion concept", types: ["prompt", "audio", "storyboard", "video", "output"] },
  { id: "character", name: "Character Design", description: "Reference → prompt → portrait package", types: ["reference", "prompt", "image", "output"] },
  { id: "social", name: "Social Media Campaign", description: "Strategy → copy → imagery → delivery", types: ["prompt", "text", "image", "output"] },
];
export function buildTemplate(template: Template): { nodes: CanvasNode[]; edges: WorkflowEdge[] } {
  const nodes = template.types.map((type, index) => { const node = makeNode(type, { x: 90 + index * 340, y: 170 + (index % 2) * 80 }); node.data.title = `${template.name}: ${node.data.title.replace("New ", "")}`; return node; });
  return { nodes, edges: nodes.slice(1).map((node, index) => ({ id: `edge-${nodes[index].id}-${node.id}`, source: nodes[index].id, target: node.id, animated: true })) };
}
