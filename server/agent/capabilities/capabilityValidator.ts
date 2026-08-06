import "server-only";

import type { AgentWorkflowPlan } from "@/shared/agent/agentSchema";
import { capabilityForNodeKind, type CapabilityCandidate, type CapabilityEvidenceBundle, type MediaRole } from "@/shared/agent/capabilityTypes";
import type { CanvasNode } from "@/shared/canvas";
import { DEFAULT_VIDEO_MODEL_PRESET_ID } from "@/shared/workflow/videoModelPresets";
import { MAX_STORYBOARD_SCENE_COUNT } from "@/shared/workflow/storyPipeline";

const roleFamily = (role: MediaRole) => role.includes("image") ? "image"
  : role.includes("video") ? "video"
    : role.includes("audio") || role === "background_music" ? "audio"
      : role.includes("text") || role === "prompt" || role === "story_brief" || role === "script" || role === "storyboard" ? "text"
        : role;

const acceptsRole = (candidate: CapabilityCandidate, role: MediaRole) =>
  candidate.accepts.some((accepted) => accepted === role || (
    accepted !== "background_music"
    && role !== "background_music"
    && roleFamily(accepted) === roleFamily(role)
  ));

const countInputs = (roles: MediaRole[]) => ({
  images: roles.filter((role) => roleFamily(role) === "image").length,
  videos: roles.filter((role) => roleFamily(role) === "video").length,
  audios: roles.filter((role) => roleFamily(role) === "audio").length,
});

const constraintIssues = (candidate: CapabilityCandidate, params: Record<string, unknown>, roles: MediaRole[]) => {
  const issues: string[] = [];
  const constraints = candidate.constraints || {};
  const counts = countInputs(roles);
  const duration = Number(params.duration);
  const aspectRatio = typeof params.aspectRatio === "string" ? params.aspectRatio : undefined;
  const resolution = typeof params.resolution === "string" ? params.resolution : undefined;
  if (typeof constraints.maxImages === "number" && counts.images > constraints.maxImages) issues.push(`accepts at most ${constraints.maxImages} image inputs, received ${counts.images}`);
  if (typeof constraints.maxVideos === "number" && counts.videos > constraints.maxVideos) issues.push(`accepts at most ${constraints.maxVideos} video inputs, received ${counts.videos}`);
  if (typeof constraints.maxAudios === "number" && counts.audios > constraints.maxAudios) issues.push(`accepts at most ${constraints.maxAudios} audio inputs, received ${counts.audios}`);
  if (Number.isFinite(duration)) {
    if (typeof constraints.minDuration === "number" && duration < constraints.minDuration) issues.push(`duration ${duration}s is below ${constraints.minDuration}s`);
    if (typeof constraints.maxDuration === "number" && duration > constraints.maxDuration) issues.push(`duration ${duration}s exceeds ${constraints.maxDuration}s`);
    if (constraints.allowedDurations?.length && !constraints.allowedDurations.includes(duration)) issues.push(`duration ${duration}s is not one of ${constraints.allowedDurations.join(", ")}`);
  }
  if (aspectRatio && constraints.aspectRatios?.length && !constraints.aspectRatios.includes(aspectRatio)) issues.push(`aspect ratio ${aspectRatio} is unsupported`);
  if (resolution && constraints.resolutions?.length && !constraints.resolutions.includes(resolution)) issues.push(`resolution ${resolution} is unsupported`);
  return issues;
};

const editPlanObject = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const candidate = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] || trimmed;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
};

const editPlanSourceNumber = (value: unknown) => {
  const parsed = Number(typeof value === "string" ? value.replace(/^@/, "") : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const videoEditPlanIssues = (step: AgentWorkflowPlan["steps"][number]) => {
  if (step.kind !== "videoEdit") return [];
  const issues: string[] = [];
  const rawPlan = step.params?.editPlan;
  const plan = editPlanObject(rawPlan);
  if (!plan) {
    return [`Video Edit step ${step.id} must put a structured JSON object in params.editPlan; do not put the natural-language instruction there.`];
  }
  const clips = Array.isArray(plan.clips) ? plan.clips : [];
  if (!clips.length) issues.push(`Video Edit step ${step.id} params.editPlan.clips must contain at least one clip.`);
  const videoInputCount = (step.inputs || []).filter((input) => roleFamily(input.role) === "video").length;
  clips.forEach((clip, index) => {
    if (!clip || typeof clip !== "object" || Array.isArray(clip)) {
      issues.push(`Video Edit step ${step.id} clip ${index + 1} must be an object.`);
      return;
    }
    const clipData = clip as Record<string, unknown>;
    const source = editPlanSourceNumber(clipData.source);
    if (!source) issues.push(`Video Edit step ${step.id} clip ${index + 1} needs a positive 1-based source number.`);
    else if (videoInputCount && source > videoInputCount) issues.push(`Video Edit step ${step.id} clip ${index + 1} references video source ${source}, but only ${videoInputCount} video inputs are connected.`);
    const speed = clipData.speed === undefined ? 1 : Number(clipData.speed);
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) issues.push(`Video Edit step ${step.id} clip ${index + 1} speed must be between 0.5 and 2.`);
    const rotate = clipData.rotate === undefined ? 0 : Number(clipData.rotate);
    if (![0, 90, 180, 270].includes(rotate)) issues.push(`Video Edit step ${step.id} clip ${index + 1} rotate must be 0, 90, 180, or 270.`);
    if (clipData.fit !== undefined && !["contain", "cover", "stretch"].includes(String(clipData.fit))) issues.push(`Video Edit step ${step.id} clip ${index + 1} fit must be contain, cover, or stretch.`);
    ["fadeIn", "fadeOut"].forEach((key) => {
      if (clipData[key] === undefined) return;
      const duration = Number(clipData[key]);
      if (!Number.isFinite(duration) || duration < 0 || duration > 10) issues.push(`Video Edit step ${step.id} clip ${index + 1} ${key} must be between 0 and 10 seconds.`);
    });
  });
  if (plan.backgroundAudio !== undefined) {
    const backgroundAudio = plan.backgroundAudio;
    if (!backgroundAudio || typeof backgroundAudio !== "object" || Array.isArray(backgroundAudio)) {
      issues.push(`Video Edit step ${step.id} params.editPlan.backgroundAudio must be an object.`);
    } else {
      const source = editPlanSourceNumber((backgroundAudio as Record<string, unknown>).source);
      const audioInputCount = (step.inputs || []).filter((input) => roleFamily(input.role) === "audio").length;
      if (!source) issues.push(`Video Edit step ${step.id} backgroundAudio needs a positive 1-based source number.`);
      else if (audioInputCount && source > audioInputCount) issues.push(`Video Edit step ${step.id} references audio source ${source}, but only ${audioInputCount} audio inputs are connected.`);
      if (!audioInputCount) issues.push(`Video Edit step ${step.id} requests backgroundAudio but has no connected audio input.`);
    }
  }
  if (plan.subtitles !== undefined && !Array.isArray(plan.subtitles)) {
    issues.push(`Video Edit step ${step.id} params.editPlan.subtitles must be an array.`);
  }
  if (Number(plan.fadeIn) > 0 || Number(plan.fadeOut) > 0) {
    issues.push(`Video Edit step ${step.id} must put entrance/exit fades on the first/last clip instead of duplicating them as root-level fadeIn/fadeOut.`);
  }
  return issues;
};

const executableCandidateForStep = (
  candidate: CapabilityCandidate | undefined,
  step: AgentWorkflowPlan["steps"][number],
) => Boolean(
  candidate
  && (candidate.kind === "model" || candidate.kind === "runtime")
  && candidate.availability === "available"
  && candidate.supports.includes(step.capability)
  && (step.inputs || []).every((input) => acceptsRole(candidate, input.role))
  && !constraintIssues(candidate, step.params || {}, (step.inputs || []).map((input) => input.role)).length,
);

const executableCandidateSupports = (candidate: CapabilityCandidate, capability: string) =>
  (candidate.kind === "model" || candidate.kind === "runtime")
  && candidate.availability === "available"
  && candidate.supports.includes(capability);

const normalizeInputsForCandidate = (
  inputs: AgentWorkflowPlan["steps"][number]["inputs"],
  candidate: CapabilityCandidate,
) => (inputs || []).map((input) => {
  if (acceptsRole(candidate, input.role)) return input;
  const compatibleRole = candidate.accepts.find((accepted) => roleFamily(accepted) === roleFamily(input.role));
  return compatibleRole ? { ...input, role: compatibleRole } : input;
});

const inputRolesForCanvasNode = (node: CanvasNode, stepCapability: string): MediaRole[] => {
  switch (node.data.nodeType) {
    case "prompt": return ["prompt", "source_text", "story_brief"];
    case "text": return ["source_text", "prompt"];
    case "script": return ["script", "source_text", "prompt"];
    case "storyboard": return ["storyboard", "source_text", "prompt"];
    case "storyboardImage":
    case "image":
    case "reference": return ["reference_image", "source_image", "image"];
    case "video":
    case "videoEdit":
    case "motion": return ["source_video", "reference_video", "video"];
    case "audio":
    case "voiceTTS": return stepCapability === "background_music"
      ? ["background_music", "source_audio", "reference_audio", "audio"]
      : ["source_audio", "reference_audio", "audio", "background_music"];
    default: return [];
  }
};

const capabilityIsRelevantToCanvasNode = (node: CanvasNode, capability: string) => {
  switch (node.data.nodeType) {
    case "storyboardImage":
    case "image":
    case "reference": return /image|reference/.test(capability);
    case "video":
    case "videoEdit":
    case "motion": return /video|motion|title|caption|overlay|subtitle/.test(capability);
    case "audio":
    case "voiceTTS": return /audio|music|speech|voice/.test(capability);
    case "prompt":
    case "text":
    case "script":
    case "storyboard": return /prompt|text|script|storyboard/.test(capability);
    default: return false;
  }
};

export function bindPlanCapabilities(plan: AgentWorkflowPlan, bundle: CapabilityEvidenceBundle): AgentWorkflowPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      const hasExecutorForRequestedCapability = bundle.capabilities.some((candidate) => executableCandidateSupports(candidate, step.capability));
      const fallbackCapability = capabilityForNodeKind(step.kind);
      const capability = hasExecutorForRequestedCapability || !fallbackCapability ? step.capability : fallbackCapability;
      const normalizedStep = { ...step, capability };
      const explicit = step.providerCapabilityId
        ? bundle.capabilities.find((candidate) => candidate.id === step.providerCapabilityId)
        : undefined;
      const preferredId = capability === "text_to_video"
        ? "model:video:seedance-2.0"
        : /video_generation|image_to_video|multi_reference_video/.test(capability)
          ? `model:video:${DEFAULT_VIDEO_MODEL_PRESET_ID}`
          : undefined;
      const preferred = preferredId
        ? bundle.capabilities.find((candidate) => candidate.id === preferredId)
        : undefined;
      const candidates = [explicit, preferred, ...bundle.capabilities]
        .filter((candidate): candidate is CapabilityCandidate => Boolean(candidate))
        .filter((candidate, index, list) => list.findIndex((item) => item.id === candidate.id) === index);
      let selectedEntry: { candidate: CapabilityCandidate; step: AgentWorkflowPlan["steps"][number] } | undefined;
      for (const candidate of candidates) {
        const candidateStep = { ...normalizedStep, inputs: normalizeInputsForCandidate(normalizedStep.inputs, candidate) };
        if (executableCandidateForStep(candidate, candidateStep)) {
          selectedEntry = { candidate, step: candidateStep };
          break;
        }
      }
      const selected = selectedEntry?.candidate;
      const boundStep = selectedEntry?.step || normalizedStep;
      const citedEvidenceIds = step.evidenceIds || [];
      const evidenceMatchesSelected = Boolean(selected && citedEvidenceIds.some((id) => selected.evidenceIds.includes(id)));
      return {
        ...boundStep,
        providerCapabilityId: selected?.id,
        evidenceIds: selected
          ? (evidenceMatchesSelected ? citedEvidenceIds : selected.evidenceIds)
          : step.evidenceIds,
      };
    }),
  };
}

export function bindRoutedCanvasInputs(
  plan: AgentWorkflowPlan,
  bundle: CapabilityEvidenceBundle,
  canvasNodes: CanvasNode[],
  targetNodeIds: string[],
  preferredCapabilities: string[] = [],
): AgentWorkflowPlan {
  if (!targetNodeIds.length) return plan;
  const candidates = new Map(bundle.capabilities.map((candidate) => [candidate.id, candidate]));
  const targets = canvasNodes.filter((node) => targetNodeIds.includes(node.id));
  const referenced = new Set(plan.steps.flatMap((step) => (step.inputs || [])
    .filter((input) => input.source === "canvas_node" && input.nodeId)
    .map((input) => input.nodeId!)));
  const steps = plan.steps.map((step) => ({ ...step, inputs: [...(step.inputs || [])] }));

  targets.filter((node) => !referenced.has(node.id)).forEach((node) => {
    const compatible = steps.flatMap((step, index) => {
      const candidate = step.providerCapabilityId ? candidates.get(step.providerCapabilityId) : undefined;
      if (!candidate) return [];
      const roleOptions = inputRolesForCanvasNode(node, step.capability);
      const role = roleOptions.find((item) => candidate.accepts.includes(item))
        || roleOptions.find((item) => acceptsRole(candidate, item));
      if (!role) return [];
      const nextRoles = [...(step.inputs || []).map((input) => input.role), role];
      if (constraintIssues(candidate, step.params || {}, nextRoles).length) return [];
      const sameFamilyInputs = (step.inputs || []).filter((input) => input.source === "canvas_node" && roleFamily(input.role) === roleFamily(role)).length;
      const preferredMatch = candidate.supports.some((capability) =>
        preferredCapabilities.includes(capability) && capabilityIsRelevantToCanvasNode(node, capability));
      const score = (preferredMatch ? 1_000 : 0)
        + (candidate.accepts.includes(role) ? 100 : 0)
        + sameFamilyInputs * 10;
      return [{ step, index, role, score }];
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    if (!compatible.length) return;
    if (compatible.length > 1 && compatible[0].score === compatible[1].score) return;
    const selected = compatible[0];
    selected.step.inputs = [...(selected.step.inputs || []), { source: "canvas_node", nodeId: node.id, role: selected.role }];
    referenced.add(node.id);
  });

  return { ...plan, steps };
}

export function capabilityPlanIssues(plan: AgentWorkflowPlan, bundle: CapabilityEvidenceBundle): string[] {
  const candidates = new Map(bundle.capabilities.map((candidate) => [candidate.id, candidate]));
  const evidenceIds = new Set(bundle.evidence.map((evidence) => evidence.id));
  const issues: string[] = [];
  plan.steps.forEach((step) => {
    if (!step.capability) issues.push(`Step ${step.id} is missing capability.`);
    issues.push(...videoEditPlanIssues(step));
    const provider = step.providerCapabilityId ? candidates.get(step.providerCapabilityId) : undefined;
    if (!provider) {
      issues.push(`Step ${step.id} must reference one providerCapabilityId from the retrieved Evidence Bundle.`);
      return;
    }
    if (provider.kind !== "model" && provider.kind !== "runtime") issues.push(`Capability ${provider.id} is guidance or a pre-planning tool, not a canvas step executor.`);
    if (!provider.supports.includes(step.capability)) issues.push(`Capability ${provider.id} does not support ${step.capability} for step ${step.id}.`);
    if (provider.availability !== "available") issues.push(`Capability ${provider.id} is ${provider.availability}.`);
    const citedEvidenceIds = step.evidenceIds || [];
    if (!citedEvidenceIds.length) issues.push(`Step ${step.id} must cite evidenceIds for capability ${provider.id}.`);
    if (citedEvidenceIds.length && !citedEvidenceIds.some((id) => provider.evidenceIds.includes(id))) {
      issues.push(`Step ${step.id} does not cite evidence attached to capability ${provider.id}.`);
    }
    const roles = (step.inputs || []).map((input) => input.role);
    roles.filter((role) => !acceptsRole(provider, role)).forEach((role) => issues.push(`Capability ${provider.id} does not accept input role ${role} for step ${step.id}.`));
    constraintIssues(provider, step.params || {}, roles).forEach((issue) => issues.push(`Capability ${provider.id} ${issue} for step ${step.id}.`));
    citedEvidenceIds.filter((id) => !evidenceIds.has(id) && !id.startsWith("catalog:")).forEach((id) => issues.push(`Step ${step.id} cites unknown evidence ${id}.`));
  });
  return [...new Set(issues)];
}

export function capabilityPlanGraphIssues(plan: AgentWorkflowPlan, bundle: CapabilityEvidenceBundle): string[] {
  const issues: string[] = [];
  const steps = new Map(plan.steps.map((step) => [step.id, step]));
  const candidates = new Map(bundle.capabilities.map((candidate) => [candidate.id, candidate]));
  const state = new Map<string, "visiting" | "visited">();
  const storyboardImageShots = plan.steps
    .filter((step) => step.kind === "image")
    .map((step) => Number(step.params?.shotNumber))
    .filter((shotNumber) => Number.isFinite(shotNumber) && shotNumber > 0);
  if (storyboardImageShots.some((shotNumber) => shotNumber > MAX_STORYBOARD_SCENE_COUNT) || new Set(storyboardImageShots).size > MAX_STORYBOARD_SCENE_COUNT) {
    issues.push(`Capability plan exceeds the ${MAX_STORYBOARD_SCENE_COUNT}-scene storyboard limit.`);
  }

  const visit = (stepId: string, path: string[]) => {
    const current = state.get(stepId);
    if (current === "visiting") {
      issues.push(`Capability plan contains a dependency cycle: ${[...path, stepId].join(" -> ")}.`);
      return;
    }
    if (current === "visited") return;
    state.set(stepId, "visiting");
    const step = steps.get(stepId);
    (step?.dependsOn || []).forEach((dependencyId) => visit(dependencyId, [...path, stepId]));
    state.set(stepId, "visited");
  };

  plan.steps.forEach((step) => {
    const typedDependencies = new Set((step.inputs || [])
      .filter((input) => input.source === "step_output" && input.stepId)
      .map((input) => input.stepId!));
    (step.dependsOn || []).forEach((dependencyId) => {
      if (!steps.has(dependencyId)) issues.push(`Step ${step.id} depends on unknown step ${dependencyId}.`);
      if (!typedDependencies.has(dependencyId)) issues.push(`Step ${step.id} dependency ${dependencyId} is missing a typed step_output input.`);
    });
    (step.inputs || []).forEach((input) => {
      if (input.source !== "step_output" || !input.stepId) return;
      const sourceStep = steps.get(input.stepId);
      if (!sourceStep) {
        issues.push(`Step ${step.id} references unknown step_output ${input.stepId}.`);
        return;
      }
      const sourceCapability = sourceStep.providerCapabilityId ? candidates.get(sourceStep.providerCapabilityId) : undefined;
      if (sourceCapability && !sourceCapability.produces.some((role) => role === input.role || roleFamily(role) === roleFamily(input.role))) {
        issues.push(`Step ${step.id} expects ${input.role} from ${input.stepId}, but ${sourceCapability.id} produces ${sourceCapability.produces.join(", ") || "no compatible media"}.`);
      }
    });
    visit(step.id, []);
  });

  return [...new Set(issues)];
}

export const approvalRequiredStepIds = (plan: AgentWorkflowPlan, bundle: CapabilityEvidenceBundle) => {
  const candidates = new Map(bundle.capabilities.map((candidate) => [candidate.id, candidate]));
  return plan.steps.filter((step) => step.providerCapabilityId && candidates.get(step.providerCapabilityId)?.requiresApproval).map((step) => step.id);
};
