import type { AgentObservationReport, AgentObservedNode } from "@/shared/agent/agentAutonomy";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
import type { AgentMediaProbe } from "./probeAgentMedia";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const expectedAspectRatioFrom = (instruction: string) => {
  const explicit = instruction.match(/(\d{1,2})\s*[:：xX]\s*(\d{1,2})/);
  if (explicit) return `${explicit[1]}:${explicit[2]}`;
  if (/竖屏|vertical|portrait/i.test(instruction)) return "9:16";
  if (/横屏|landscape/i.test(instruction)) return "16:9";
  if (/方形|square/i.test(instruction)) return "1:1";
  return undefined;
};

const expectedDurationFrom = (instruction: string) => {
  const match = instruction.match(/(\d+(?:\.\d+)?)\s*(?:秒|s|sec|secs|second|seconds)(?:\s|，|。|,|\.|$)/i);
  return match ? finiteNumber(match[1]) : undefined;
};

const mediaDimensions = (value: Record<string, unknown>) => ({
  width: finiteNumber(value.width),
  height: finiteNumber(value.height),
});

const ratioMatches = (width: number, height: number, expected: string) => {
  const [expectedWidth, expectedHeight] = expected.split(":").map(Number);
  if (!expectedWidth || !expectedHeight || !width || !height) return true;
  return Math.abs(width / height - expectedWidth / expectedHeight) <= 0.035;
};

const hasMediaResult = (value: Record<string, unknown>) =>
  ["imageUrl", "revisedImageUrl", "videoUrl", "finalVideoUrl", "audioUrl", "resultUrl", "url"]
    .some((key) => Boolean(text(value[key])));

const observeNode = (node: CanvasNode, probe?: AgentMediaProbe): AgentObservedNode => {
  const value = record(node.data.output?.value);
  const codexRun = record(value.codexRun);
  const dimensions = mediaDimensions(value);
  return {
    id: node.id,
    type: node.data.nodeType,
    title: node.data.title || node.id,
    status: node.data.status,
    outputSummary: node.data.output?.summary,
    error: node.data.error || text(value.error) || undefined,
    aspectRatio: node.data.aspectRatio,
    duration: probe?.duration ?? finiteNumber(value.duration) ?? node.data.duration,
    width: probe?.width ?? dimensions.width,
    height: probe?.height ?? dimensions.height,
    codexOk: typeof codexRun.ok === "boolean" ? codexRun.ok : undefined,
  };
};

const hasConnectedType = (nodeId: string, type: string, nodes: CanvasNode[], edges: WorkflowEdge[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges.some((edge) => edge.target === nodeId && byId.get(edge.source)?.data.nodeType === type);
};

export function observeAgentRun({
  userMessage,
  nodes,
  edges,
  executedNodeIds,
  mediaProbes,
}: {
  userMessage: string;
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  executedNodeIds: string[];
  mediaProbes?: Map<string, AgentMediaProbe>;
}): AgentObservationReport {
  const expectedAspectRatio = expectedAspectRatioFrom(userMessage);
  const expectedDuration = expectedDurationFrom(userMessage);
  const requested = new Set(executedNodeIds);
  const targetNodes = nodes.filter((node) => requested.has(node.id));
  const observed = targetNodes.map((node) => observeNode(node, mediaProbes?.get(node.id)));
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!observed.length) issues.push("No executed nodes were available for verification.");

  targetNodes.forEach((node, index) => {
    const item = observed[index];
    const value = record(node.data.output?.value);
    if (item.status === "error") issues.push(`${item.title} failed: ${item.error || "unknown node error"}`);
    if (item.status === "idle" || item.status === "running" || item.status === "waiting") {
      issues.push(`${item.title} did not reach a terminal state (status: ${item.status}).`);
    }
    if (item.status === "success" && !node.data.output) issues.push(`${item.title} reported success without an output payload.`);
    if (item.status === "success" && ["image", "video", "videoEdit", "motion", "audio", "voiceTTS"].includes(item.type) && !hasMediaResult(value)) {
      warnings.push(`${item.title} completed but its output does not expose a media URL.`);
    }
    if (node.data.nodeType === "motion" && node.data.motionMode === "codex-hyperframes" && item.codexOk === false) {
      issues.push(`${item.title} rendered without a successful Codex edit pass.`);
    }
    if (expectedAspectRatio && item.width && item.height && !ratioMatches(item.width, item.height, expectedAspectRatio)) {
      issues.push(`${item.title} rendered at ${item.width}x${item.height}, which does not match requested ${expectedAspectRatio}.`);
    }
    if (expectedAspectRatio && ["video", "videoEdit", "motion"].includes(item.type) && item.aspectRatio && item.aspectRatio !== expectedAspectRatio) {
      warnings.push(`${item.title} is configured as ${item.aspectRatio}, while the request asks for ${expectedAspectRatio}.`);
    }
    if (expectedDuration && item.duration && Math.abs(item.duration - expectedDuration) > 1) {
      warnings.push(`${item.title} duration is ${item.duration}s, while the request asks for about ${expectedDuration}s.`);
    }
  });

  const asksForMotion = /标题|字幕|动效|包装|转场|progress|caption|title|motion|hyperframes/i.test(userMessage);
  if (asksForMotion && targetNodes.length && !targetNodes.some((node) => node.data.nodeType === "motion")) {
    issues.push("The request asks for visible motion/title treatment, but no Motion node was executed.");
  }

  const asksForBackgroundAudio = /背景音乐|配乐|background\s*music|bgm/i.test(userMessage);
  const editTargets = targetNodes.filter((node) => node.data.nodeType === "videoEdit" || node.data.nodeType === "motion");
  if (asksForBackgroundAudio && editTargets.length && !editTargets.some((node) => hasConnectedType(node.id, "audio", nodes, edges) || hasConnectedType(node.id, "voiceTTS", nodes, edges))) {
    issues.push("The request asks for background audio, but the executed edit has no connected audio source.");
  }

  const allTerminal = observed.length > 0 && observed.every((node) => node.status === "success" || node.status === "error");
  const allSuccessful = observed.length > 0 && observed.every((node) => node.status === "success") && issues.length === 0;
  return { expectedAspectRatio, expectedDuration, nodes: observed, issues, warnings, allTerminal, allSuccessful };
}
