import { makeNode } from "@/shared/templates/templates";
import type { AgentWorkflowPlan, CanvasPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, CanvasNodeData, NodeType, WorkflowEdge } from "@/shared/canvas";
import { defaultMotionComposition, motionCompositionToJson } from "@/shared/motion/composition";
import { defaultMotionTemplateVariablesJson, getMotionTemplate } from "@/shared/motion/templates";
import { videoModelPresetIdFromData } from "@/shared/workflow/videoModelPresets";
import { targetHandleForNodeConnection } from "@/shared/workflow/connectionHandles";
import { DEFAULT_QWEN_VOICE_MODEL, DEFAULT_QWEN_VOICE_PROVIDER, qwenTtsLanguageTypes } from "@/shared/api/qwenContracts";
import { assertWorkflowPatchMatchesPlan } from "@/server/agent/workflowPlanQuality";
import { nodeParamsForCapability } from "@/server/agent/capabilities/capabilityCatalog";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const bool = (value: unknown) => typeof value === "boolean" ? value : undefined;
const qwenLanguageType = (value: unknown): CanvasNodeData["languageType"] => {
  const normalized = text(value);
  return qwenTtsLanguageTypes.includes(normalized as NonNullable<CanvasNodeData["languageType"]>) ? normalized as NonNullable<CanvasNodeData["languageType"]> : "Auto";
};
const jsonText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return "";
};
const safeId = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "step";
const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);
const tokenstarMode = (value: string) => value === "kling-reference" || value === "kling-image-to-video" ? "kling-image" : value === "kling-text-to-video" ? "kling-text" : value;
const targetHandleFor = (sourceNode: CanvasNode | undefined, targetNode: CanvasNode | undefined) =>
  sourceNode && targetNode ? targetHandleForNodeConnection(sourceNode.data.nodeType, targetNode.data) : undefined;
const DEFAULT_AGENT_IMAGE_MODEL = "gpt-image-2(tokenstar)";
const sceneCountFor = (plan: AgentWorkflowPlan, params: Record<string, unknown>) =>
  Math.max(1, Math.min(30, Math.round(plan.sceneCount || number(params.targetShotCount) || number(params.numberOfScenes) || 3)));
const patchForStep = (plan: AgentWorkflowPlan, step: AgentWorkflowPlan["steps"][number], upstreamKinds: NodeType[]): Partial<CanvasNodeData> => {
  const params = { ...nodeParamsForCapability(step.providerCapabilityId), ...object(step.params) };
  const stepPrompt = step.prompt?.trim() || "";
  const prompt = stepPrompt || plan.userPrompt;
  const aspectRatio = text(params.aspectRatio) || plan.aspectRatio || "16:9";
  const zh = hasChinese(plan.userPrompt);
  const cinematicStyle = zh ? "电影感、港风、完整叙事" : "Cinematic";
  if (step.kind === "prompt") return { title: step.label, prompt, style: plan.style || text(params.style) || cinematicStyle, aspectRatio };
  if (step.kind === "text") {
    const shotNumber = number(params.shotNumber);
    const storyboardScene = upstreamKinds.includes("storyboard") && Boolean(shotNumber);
    return {
      title: step.label,
      instruction: step.purpose || (storyboardScene
        ? `Refine only storyboard scene ${shotNumber}. Do not include or summarize any other scene.`
        : zh ? "扩展创作方向。" : "Expand the creative direction."),
      inputText: storyboardScene ? stepPrompt : prompt,
      textContent: storyboardScene ? stepPrompt : undefined,
      textSourceMode: storyboardScene ? "storyboard-scene" : "manual",
      model: text(params.model),
      temperature: number(params.temperature) ?? 0.7,
      shotNumber,
    };
  }
  if (step.kind === "script") return { title: step.label, storyBrief: prompt, scriptTone: plan.style || text(params.scriptTone) || (zh ? "电影感、喜剧节奏、完整可拍摄剧本" : "Cinematic, fictional"), numberOfScenes: sceneCountFor(plan, params), model: text(params.model) };
  if (step.kind === "storyboard") { const count = sceneCountFor(plan, params); return { title: step.label, storyBrief: prompt, numberOfScenes: count, targetShotCount: count, model: text(params.model) }; }
  if (step.kind === "image") { const shotNumber = number(params.shotNumber); return { title: step.label, prompt: shotNumber ? stepPrompt : prompt, negativePrompt: text(params.negativePrompt) || "拼贴图, 分屏, 四宫格, 分镜板, 漫画分格, 多面板, 多个画面, 多张图出现在同一张图里, collage, split screen, contact sheet, storyboard grid, comic panels, multiple panels, multiple frames, four images in one image, arrows, labels, UI, watermark, text overlay", model: text(params.model) || DEFAULT_AGENT_IMAGE_MODEL, size: text(params.size) || "1536x1024", aspectRatio, referenceImageUrl: "", shotNumber }; }
  if (step.kind === "video") {
    const provider = text(params.videoProvider) || plan.videoProvider || "tokenstar";
    const hasImageInput = upstreamKinds.includes("image") || upstreamKinds.includes("reference");
    const hasVideoInput = upstreamKinds.includes("video");
    const hasAssetInput = hasImageInput || hasVideoInput || upstreamKinds.includes("audio") || upstreamKinds.includes("voiceTTS");
    const requestedTokenstarMode = tokenstarMode(text(params.tokenstarMode));
    const requestedModeAcceptsAssets = requestedTokenstarMode === "asset-video" || requestedTokenstarMode === "kling-image" || requestedTokenstarMode === "kling-omni";
    const selectedTokenstarMode = provider === "tokenstar"
      ? hasAssetInput && !requestedModeAcceptsAssets ? "asset-video" : requestedTokenstarMode || (hasAssetInput ? "asset-video" : "text-to-video")
      : requestedTokenstarMode;
    const fallbackModel = selectedTokenstarMode === "asset-video" ? "seedance-2.0-asset-fast"
      : selectedTokenstarMode === "kling-omni" ? "kling-v3-omni"
      : selectedTokenstarMode === "kling-image" || selectedTokenstarMode === "kling-text" ? "kling-v3"
      : "";
    const videoProvider = provider === "kling" || provider === "302ai" || provider === "302-sora2" ? provider : "tokenstar";
    const model = text(params.model) || fallbackModel;
    const normalizedTokenstarMode = selectedTokenstarMode === "asset-video" || selectedTokenstarMode === "kling-image" || selectedTokenstarMode === "kling-text" || selectedTokenstarMode === "kling-omni" ? selectedTokenstarMode : "text-to-video";
    const klingMode = selectedTokenstarMode === "kling-omni" ? "omni" : selectedTokenstarMode === "kling-text" ? "text-to-video" : "image-to-video";
    const videoModelPreset = videoModelPresetIdFromData({ videoProvider, model, tokenstarMode: normalizedTokenstarMode, klingMode });
    return {
      title: step.label,
      prompt: step.prompt || step.purpose || plan.userPrompt,
      negativePrompt: text(params.negativePrompt),
      duration: number(params.duration) || 10,
      aspectRatio,
      model,
      resolution: text(params.resolution) || "480p",
      fps: text(params.fps),
      referenceImageUrl: "",
      videoInputMode: hasImageInput || hasVideoInput ? "image-to-video" : "text-to-video",
      videoProvider,
      videoModelPreset,
      tokenstarMode: normalizedTokenstarMode,
      klingMode,
      generateAudio: bool(params.generateAudio) ?? plan.includeAudio ?? true,
      shotNumber: number(params.shotNumber),
      referenceImageAssetUrl: "",
      referenceVideoAssetUrl: "",
      referenceAudioAssetUrl: "",
      klingElementId: "",
      referenceVideoUrl: "",
    };
  }
  if (step.kind === "videoEdit") return {
    title: step.label,
    prompt: step.purpose || "",
    editPlan: text(params.editPlan) || step.prompt || plan.userPrompt,
    preserveAudio: bool(params.preserveAudio) ?? true,
    originalVolume: number(params.originalVolume) ?? 1,
    backgroundVolume: number(params.backgroundVolume) ?? 0.2,
    fadeIn: number(params.fadeIn) ?? 0,
    fadeOut: number(params.fadeOut) ?? 0,
    transition: text(params.transition) === "fade" ? "fade" : "none",
    resolution: text(params.resolution) || "720p",
    fps: text(params.fps) || "30",
    aspectRatio,
  };
  if (step.kind === "motion") return {
    title: step.label,
    prompt: step.prompt || step.purpose || plan.userPrompt,
    compositionJson: jsonText(params.compositionJson) || motionCompositionToJson(defaultMotionComposition(step.label)),
    templateId: text(params.templateId) || "basic-title",
    motionVariablesJson: jsonText(params.motionVariablesJson) || jsonText(params.motionVariables) || defaultMotionTemplateVariablesJson(getMotionTemplate(text(params.templateId))?.id || "basic-title"),
    motionMode: text(params.motionMode) === "codex-hyperframes" ? "codex-hyperframes" : "template",
    codexInstruction: text(params.codexInstruction),
  };
  if (step.kind === "audio") return { title: step.label, prompt, duration: number(params.duration) || 12, voiceStyle: text(params.voiceStyle) || (zh ? "氛围感" : "Atmospheric"), model: text(params.model), voice: text(params.voice), emotion: text(params.emotion), volume: number(params.volume) || 1 };
  if (step.kind === "voiceClone") return { title: step.label, preferredName: text(params.preferredName) || "voice_1", targetModel: text(params.targetModel) || DEFAULT_QWEN_VOICE_MODEL, voiceProvider: DEFAULT_QWEN_VOICE_PROVIDER, language: text(params.language) || "zh", transcript: text(params.transcript), consentConfirmed: false };
  if (step.kind === "voiceTTS") return { title: step.label, ttsText: step.prompt || text(params.text), voice: text(params.voice), targetModel: text(params.targetModel) || DEFAULT_QWEN_VOICE_MODEL, voiceProvider: DEFAULT_QWEN_VOICE_PROVIDER, languageType: qwenLanguageType(params.languageType) };
  if (step.kind === "reference") return { title: step.label, imageUrl: "", notes: step.purpose || prompt };
  return { title: step.label, format: text(params.format) || (zh ? "创作包" : "Creative package") };
};

export function compileWorkflowPlanToCanvas(plan: AgentWorkflowPlan): CanvasPatch {
  const steps = plan.steps;
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
      const sourceNode = source ? nodes.find((node) => node.id === source) : undefined;
      const targetNode = target ? nodes.find((node) => node.id === target) : undefined;
      const targetHandle = targetHandleFor(sourceNode, targetNode);
      if (source && target) edges.push({ id: `edge-${source}-${target}`, source, target, ...(targetHandle ? { targetHandle } : {}) });
    });
  });
  const patch = { nodes, edges };
  assertWorkflowPatchMatchesPlan(plan, patch);
  return patch;
}

function buildDependencyMap(steps: AgentWorkflowPlan["steps"]) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const map = new Map<string, string[]>();
  steps.forEach((step) => {
    const explicit = (step.dependsOn || []).filter((id) => byId.has(id) && id !== step.id);
    map.set(step.id, explicit);
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

function positionFor(kind: NodeType, level: number, row: number) {
  const x = level * 300;
  if (kind === "image") return { x, y: 180 + row * 190 };
  if (kind === "video") return { x, y: 90 + row * 190 };
  if (kind === "videoEdit") return { x, y: 90 + row * 190 };
  if (kind === "motion") return { x, y: 110 + row * 190 };
  if (kind === "voiceClone" || kind === "voiceTTS") return { x, y: 120 + row * 190 };
  return { x, y: row * 170 };
}
