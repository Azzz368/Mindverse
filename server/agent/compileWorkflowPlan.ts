import { makeNode } from "@/shared/templates/templates";
import type { AgentWorkflowPlan, CanvasPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, CanvasNodeData, NodeType, WorkflowEdge } from "@/shared/canvas";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const bool = (value: unknown) => typeof value === "boolean" ? value : undefined;
const safeId = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "step";
const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);
const tokenstarMode = (value: string) => value === "kling-reference" || value === "kling-image-to-video" ? "kling-image" : value === "kling-text-to-video" ? "kling-text" : value;
const sceneCountFor = (plan: AgentWorkflowPlan, params: Record<string, unknown>) =>
  Math.max(1, Math.min(30, Math.round(plan.sceneCount || number(params.targetShotCount) || number(params.numberOfScenes) || 3)));
const asksForMultipleVideos = (prompt: string) =>
  /每个(?:分镜|镜头|场景).*视频|(?:分别|各自).*视频|多个视频|多段视频|视频片段|片段视频|per[-\s]?shot|each shot|multiple videos|clips|segments/i.test(prompt);

const patchForStep = (plan: AgentWorkflowPlan, step: AgentWorkflowPlan["steps"][number], upstreamKinds: NodeType[]): Partial<CanvasNodeData> => {
  const params = object(step.params);
  const prompt = step.prompt || plan.userPrompt;
  const aspectRatio = text(params.aspectRatio) || plan.aspectRatio || "16:9";
  const zh = hasChinese(plan.userPrompt);
  const cinematicStyle = zh ? "电影感、港风、完整叙事" : "Cinematic";
  if (step.kind === "prompt") return { title: step.label, prompt, style: plan.style || text(params.style) || cinematicStyle, aspectRatio };
  if (step.kind === "text") return { title: step.label, instruction: step.purpose || (zh ? "扩展创作方向。" : "Expand the creative direction."), inputText: prompt, model: text(params.model), temperature: number(params.temperature) ?? 0.7 };
  if (step.kind === "script") return { title: step.label, storyBrief: prompt, scriptTone: plan.style || text(params.scriptTone) || (zh ? "电影感、喜剧节奏、完整可拍摄剧本" : "Cinematic, fictional"), numberOfScenes: sceneCountFor(plan, params), model: text(params.model) };
  if (step.kind === "storyboard") { const count = sceneCountFor(plan, params); return { title: step.label, storyBrief: prompt, numberOfScenes: count, targetShotCount: count, model: text(params.model) }; }
  if (step.kind === "storyboardImage") return { title: step.label, aspectRatio, negativePrompt: text(params.negativePrompt) || "拼贴图, 分屏, 四宫格, 分镜板, 漫画分格, 多面板, 多个画面, 多张图出现在同一张图里, collage, split screen, contact sheet, storyboard grid, comic panels, multiple panels, multiple frames, four images in one image, arrows, labels, UI, watermark, text overlay" };
  if (step.kind === "image") return { title: step.label, prompt, negativePrompt: text(params.negativePrompt) || "拼贴图, 分屏, 四宫格, 分镜板, 漫画分格, 多面板, 多个画面, 多张图出现在同一张图里, collage, split screen, contact sheet, storyboard grid, comic panels, multiple panels, multiple frames, four images in one image, arrows, labels, UI, watermark, text overlay", model: text(params.model) || "gpt-image-2", size: text(params.size) || "1536x1024", aspectRatio, referenceImageUrl: "", shotNumber: number(params.shotNumber) };
  if (step.kind === "video") {
    const provider = text(params.videoProvider) || plan.videoProvider || "tokenstar";
    const hasImageInput = upstreamKinds.includes("image") || upstreamKinds.includes("reference");
    const hasVideoInput = upstreamKinds.includes("video");
    const selectedTokenstarMode = tokenstarMode(text(params.tokenstarMode) || (provider === "tokenstar" ? hasVideoInput ? "kling-omni" : "kling-image" : ""));
    return {
      title: step.label,
      prompt: step.prompt || step.purpose || plan.userPrompt,
      negativePrompt: text(params.negativePrompt),
      duration: number(params.duration) || 10,
      aspectRatio,
      model: text(params.model),
      resolution: text(params.resolution) || "480p",
      fps: text(params.fps),
      referenceImageUrl: "",
      videoInputMode: provider === "tokenstar" && !hasVideoInput ? "image-to-video" : hasImageInput ? "image-to-video" : "text-to-video",
      videoProvider: provider === "kling" || provider === "302ai" || provider === "302-sora2" ? provider : "tokenstar",
      tokenstarMode: selectedTokenstarMode === "asset-video" || selectedTokenstarMode === "kling-image" || selectedTokenstarMode === "kling-text" || selectedTokenstarMode === "kling-omni" ? selectedTokenstarMode : "text-to-video",
      klingMode: hasVideoInput ? "omni" : "image-to-video",
      generateAudio: bool(params.generateAudio) ?? plan.includeAudio ?? true,
      referenceImageAssetUrl: "",
      referenceVideoAssetUrl: "",
      referenceAudioAssetUrl: "",
      klingElementId: "",
      referenceVideoUrl: "",
    };
  }
  if (step.kind === "audio") return { title: step.label, prompt, duration: number(params.duration) || 12, voiceStyle: text(params.voiceStyle) || (zh ? "氛围感" : "Atmospheric"), model: text(params.model), voice: text(params.voice), emotion: text(params.emotion), volume: number(params.volume) || 1 };
  if (step.kind === "reference") return { title: step.label, imageUrl: "", notes: step.purpose || prompt };
  return { title: step.label, format: text(params.format) || (zh ? "创作包" : "Creative package") };
};

export function compileWorkflowPlanToCanvas(plan: AgentWorkflowPlan): CanvasPatch {
  const steps = normalizeVideoSteps(plan);
  const groupId = `agent-${crypto.randomUUID()}`;
  const groupColor = undefined;
  const stepIdToNodeId = new Map<string, string>();
  const dependencyMap = buildDependencyMap(steps);
  const levelMap = buildLevelMap(steps, dependencyMap);
  const rowsByLevel = new Map<number, number>();
  const nodes: CanvasNode[] = steps.map((step, index) => {
    const dependsOn = dependencyMap.get(step.id) || [];
    const upstreamKinds = dependsOn.map((id) => steps.find((candidate) => candidate.id === id)?.kind).filter((kind): kind is NodeType => Boolean(kind));
    const level = levelMap.get(step.id) || 0;
    const row = rowsByLevel.get(level) || 0;
    rowsByLevel.set(level, row + 1);
    const node = makeNode(step.kind, positionFor(step.kind, level, row));
    const nodeId = `agent-${safeId(step.id)}-${crypto.randomUUID()}`;
    stepIdToNodeId.set(step.id, nodeId);
    const data: CanvasNodeData = {
      ...node.data,
      ...patchForStep(plan, step, upstreamKinds),
      nodeType: step.kind,
      status: "idle",
      output: undefined,
      error: undefined,
      imageUrl: step.kind === "reference" ? "" : undefined,
      taskId: undefined,
      resultUrl: undefined,
      rawStatus: undefined,
      lastPollAt: undefined,
      groupId,
      groupColor,
    };
    return { ...node, id: nodeId, data };
  });
  const edges: WorkflowEdge[] = [];
  steps.forEach((step, index) => {
    const dependencies = dependencyMap.get(step.id) || (index > 0 ? [steps[index - 1].id] : []);
    dependencies.forEach((sourceStepId) => {
      const source = stepIdToNodeId.get(sourceStepId);
      const target = stepIdToNodeId.get(step.id);
      if (source && target) edges.push({ id: `edge-${source}-${target}`, source, target, animated: true });
    });
  });
  return { nodes, edges };
}

function normalizeVideoSteps(plan: AgentWorkflowPlan) {
  const videoSteps = plan.steps.filter((step) => step.kind === "video");
  if (videoSteps.length <= 1 || asksForMultipleVideos(plan.userPrompt)) return plan.steps;
  const keeper = videoSteps[0];
  const removed = new Set(videoSteps.slice(1).map((step) => step.id));
  return plan.steps
    .filter((step) => !removed.has(step.id))
    .map((step, index, steps) => {
      const dependsOn = unique((step.dependsOn || (index > 0 ? [steps[index - 1].id] : []))
        .map((id) => removed.has(id) ? keeper.id : id)
        .filter((id) => id !== step.id));
      return { ...step, dependsOn: dependsOn.length ? dependsOn : undefined };
    });
}

function buildDependencyMap(steps: AgentWorkflowPlan["steps"]) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const map = new Map<string, string[]>();
  steps.forEach((step, index) => {
    const explicit = (step.dependsOn || []).filter((id) => byId.has(id) && id !== step.id);
    const previous = index > 0 ? [steps[index - 1].id] : [];
    const fallback = explicit.length ? explicit : previous;
    const storyboardImage = lastStepBefore(steps, index, "storyboardImage");

    if (step.kind === "image" && storyboardImage) {
      const nonImageDependencies = explicit.filter((id) => byId.get(id)?.kind !== "image" && id !== storyboardImage.id);
      map.set(step.id, unique([storyboardImage.id, ...nonImageDependencies]));
      return;
    }

  if (step.kind === "video") {
    const keyframes = keyframeStepsBeforeVideo(steps, index);
    if (keyframes.length) {
        map.set(step.id, keyframes.map((item) => item.id));
        return;
      }
    }

    map.set(step.id, fallback);
  });
  return map;
}

function buildLevelMap(steps: AgentWorkflowPlan["steps"], dependencyMap: Map<string, string[]>) {
  const levels = new Map<string, number>();
  const visiting = new Set<string>();
  const levelFor = (id: string): number => {
    if (levels.has(id)) return levels.get(id) || 0;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const dependencies = dependencyMap.get(id) || [];
    const level = dependencies.length ? Math.max(...dependencies.map(levelFor)) + 1 : 0;
    visiting.delete(id);
    levels.set(id, level);
    return level;
  };
  steps.forEach((step) => levelFor(step.id));
  return levels;
}

function lastStepBefore(steps: AgentWorkflowPlan["steps"], index: number, kind: NodeType) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (steps[i].kind === kind) return steps[i];
  }
  return undefined;
}

function keyframeStepsBeforeVideo(steps: AgentWorkflowPlan["steps"], videoIndex: number) {
  const storyboardIndex = (() => {
    for (let i = videoIndex - 1; i >= 0; i -= 1) {
      if (steps[i].kind === "storyboardImage") return i;
    }
    return -1;
  })();
  const start = storyboardIndex >= 0 ? storyboardIndex + 1 : 0;
  return steps.slice(start, videoIndex).filter((step) => step.kind === "image");
}

function positionFor(kind: NodeType, level: number, row: number) {
  const x = level * 300;
  if (kind === "image") return { x, y: 180 + row * 190 };
  if (kind === "video") return { x, y: 90 + row * 190 };
  return { x, y: row * 170 };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
