import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

const hasMediaOutput = (node: CanvasNode, keys: string[]) => {
  const value = object(node.data.output?.value);
  return keys.some((key) => Boolean(text(value[key]) || text(node.data[key as keyof typeof node.data])));
};

const short = (value: unknown, limit = 180) => {
  const raw = text(value).replace(/\s+/g, " ");
  return raw.length > limit ? `${raw.slice(0, limit)}...` : raw;
};

const importantFields = (node: CanvasNode) => {
  const data = node.data;
  const fields: string[] = [
    `id: ${node.id}`,
    `type: ${data.nodeType}`,
    `label: ${short(data.title, 80)}`,
    `status: ${data.status}`,
  ];
  if (data.prompt) fields.push(`prompt: ${short(data.prompt)}`);
  if (data.editPlan) fields.push(`editPlan: ${short(data.editPlan)}`);
  if (data.nodeType === "videoEdit") fields.push(`preserveAudio: ${data.preserveAudio !== false}`);
  if (data.storyBrief) fields.push(`storyBrief: ${short(data.storyBrief)}`);
  if (data.instruction) fields.push(`instruction: ${short(data.instruction)}`);
  if (data.model) fields.push(`model: ${short(data.model, 80)}`);
  if (data.videoProvider) fields.push(`videoProvider: ${data.videoProvider}`);
  if (data.tokenstarMode) fields.push(`tokenstarMode: ${data.tokenstarMode}`);
  if (data.klingMode) fields.push(`klingMode: ${data.klingMode}`);
  if (data.videoInputMode) fields.push(`videoInputMode: ${data.videoInputMode}`);
  if (data.aspectRatio) fields.push(`aspectRatio: ${data.aspectRatio}`);
  if (data.duration) fields.push(`duration: ${data.duration}`);
  if (data.numberOfScenes) fields.push(`sceneCount: ${data.numberOfScenes}`);
  if (data.size) fields.push(`size: ${data.size}`);
  if (data.format) fields.push(`format: ${data.format}`);
  if (data.workflowId) fields.push(`workflowId: ${data.workflowId}`);
  if (data.workflowOrder) fields.push(`workflowOrder: ${data.workflowOrder}`);
  if (data.workflowTitle) fields.push(`workflowTitle: ${short(data.workflowTitle, 80)}`);
  if (data.workflowLabel) fields.push(`workflowLabel: ${data.workflowLabel}`);
  fields.push(`position: (${Math.round(node.position.x)}, ${Math.round(node.position.y)})`);
  fields.push(`hasOutput: ${Boolean(data.output)}`);
  fields.push(`hasImageOutput: ${hasMediaOutput(node, ["imageUrl", "revisedImageUrl"])}`);
  fields.push(`hasVideoOutput: ${hasMediaOutput(node, ["videoUrl", "resultUrl", "finalVideoUrl"])}`);
  fields.push(`hasAudioOutput: ${hasMediaOutput(node, ["audioUrl", "resultUrl"])}`);
  return `* ${fields.join(", ")}`;
};

export function summarizeCanvasForAgent({
  nodes,
  edges,
  selectedNodeIds,
}: {
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  selectedNodeIds?: string[];
}) {
  const selected = new Set(selectedNodeIds || []);
  const selectedNodes = nodes.filter((node) => selected.has(node.id));
  return [
    "Canvas Summary:",
    "Nodes:",
    nodes.length ? nodes.map(importantFields).join("\n") : "* none",
    "",
    "Edges:",
    edges.length ? edges.map((edge) => `* id: ${edge.id}, ${edge.source} -> ${edge.target}`).join("\n") : "* none",
    "",
    "Selected Nodes:",
    selectedNodes.length ? selectedNodes.map(importantFields).join("\n") : "* none",
    "",
    "Media safety:",
    "* Full base64, data URLs, historical media URLs, task IDs, and output payloads are intentionally omitted.",
  ].join("\n");
}
