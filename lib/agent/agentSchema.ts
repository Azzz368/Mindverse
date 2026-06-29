import type { CanvasNode, NodeType, WorkflowEdge } from "@/types/canvas";

export type AgentWorkflowGoal =
  | "story_to_video"
  | "image_to_video"
  | "storyboard_only"
  | "ad_package"
  | "custom";

export type AgentStepKind = NodeType;

export type AgentWorkflowPlan = {
  title: string;
  description?: string;
  goal: AgentWorkflowGoal;
  userPrompt: string;
  style?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  sceneCount?: number;
  includeAudio?: boolean;
  videoProvider?: "tokenstar" | "kling" | "302ai" | "302-sora2";
  steps: AgentWorkflowStep[];
  warnings?: string[];
};

export type AgentWorkflowStep = {
  id: string;
  kind: AgentStepKind;
  label: string;
  purpose?: string;
  prompt?: string;
  dependsOn?: string[];
  params?: Record<string, unknown>;
};

export type CanvasPatch = {
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
};

const goals: AgentWorkflowGoal[] = ["story_to_video", "image_to_video", "storyboard_only", "ad_package", "custom"];
const kinds: AgentStepKind[] = ["prompt", "text", "script", "storyboard", "storyboardImage", "image", "video", "audio", "reference", "output"];
const aspectRatios = ["16:9", "9:16", "1:1"] as const;
const videoProviders = ["tokenstar", "kling", "302ai", "302-sora2"] as const;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : undefined;
const params = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const safeId = (value: string, fallback: string) => {
  const id = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return id || fallback;
};
const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);
const fallbackLabel = (kind: AgentStepKind, index: number, zh: boolean) => {
  if (!zh) return `${kind[0].toUpperCase()}${kind.slice(1)} ${index + 1}`;
  const labels: Record<AgentStepKind, string> = {
    prompt: "创意输入",
    text: "文本生成",
    script: "完整剧本",
    storyboard: "分镜设计",
    storyboardImage: "关键帧提示词",
    image: "关键帧图像",
    video: "视频生成",
    audio: "音频生成",
    reference: "参考素材",
    output: "最终输出",
  };
  return `${labels[kind]} ${index + 1}`;
};

export function validateAgentPlan(value: unknown): AgentWorkflowPlan {
  const raw = object(value);
  const title = text(raw.title, "Mindverse Agent Workflow");
  const userPrompt = text(raw.userPrompt);
  const zh = hasChinese(userPrompt);
  const goal = goals.includes(raw.goal as AgentWorkflowGoal) ? raw.goal as AgentWorkflowGoal : "custom";
  const aspectRatio = aspectRatios.includes(raw.aspectRatio as typeof aspectRatios[number]) ? raw.aspectRatio as AgentWorkflowPlan["aspectRatio"] : "16:9";
  const videoProvider = videoProviders.includes(raw.videoProvider as typeof videoProviders[number]) ? raw.videoProvider as AgentWorkflowPlan["videoProvider"] : "tokenstar";
  const sceneCount = Math.max(1, Math.min(12, Number(raw.sceneCount) || 3));
  const seen = new Set<string>();
  const steps: AgentWorkflowStep[] = [];
  if (Array.isArray(raw.steps)) raw.steps.forEach((item, index) => {
    const step = object(item);
    const kind = kinds.includes(step.kind as AgentStepKind) ? step.kind as AgentStepKind : undefined;
    if (!kind) return;
    let id = safeId(text(step.id), `${kind}-${index + 1}`);
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    steps.push({
      id,
      kind,
      label: text(step.label, fallbackLabel(kind, index, zh)),
      purpose: text(step.purpose) || undefined,
      prompt: text(step.prompt) || undefined,
      dependsOn: stringArray(step.dependsOn),
      params: params(step.params),
    });
  });
  if (!userPrompt) throw new Error("Agent plan is missing userPrompt.");
  if (!steps.length) throw new Error("Agent plan must include at least one step.");
  const ids = new Set(steps.map((step) => step.id));
  const normalizedSteps = steps.map((step, index) => ({
    ...step,
    dependsOn: step.dependsOn?.filter((id) => ids.has(id) && id !== step.id) || (index > 0 ? [steps[index - 1].id] : undefined),
  }));
  return {
    title,
    description: text(raw.description) || undefined,
    goal,
    userPrompt,
    style: text(raw.style) || undefined,
    aspectRatio,
    sceneCount,
    includeAudio: typeof raw.includeAudio === "boolean" ? raw.includeAudio : false,
    videoProvider,
    steps: normalizedSteps,
    warnings: stringArray(raw.warnings) || [],
  };
}
