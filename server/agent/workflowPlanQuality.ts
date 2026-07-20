import type { AgentWorkflowPlan, CanvasPatch } from "@/shared/agent/agentSchema";

const renderedKinds = new Set(["video", "videoEdit", "motion", "output"]);
const processingKinds = new Set(["script", "storyboard", "video", "videoEdit", "motion", "output", "voiceTTS"]);

export function stabilizeWorkflowPlanDependencies(plan: AgentWorkflowPlan): AgentWorkflowPlan {
  const steps = plan.steps.map((step) => ({ ...step, dependsOn: [...(step.dependsOn || [])], params: step.params ? { ...step.params } : undefined }));
  const byId = new Map(steps.map((step) => [step.id, step]));
  const indexById = new Map(steps.map((step, index) => [step.id, index]));
  const dependenciesFor = (stepId: string) => byId.get(stepId)?.dependsOn || [];
  const nearestBefore = (stepId: string, kinds: Set<string>) => {
    const index = indexById.get(stepId) || 0;
    return steps.slice(0, index).reverse().find((candidate) => kinds.has(candidate.kind));
  };
  const dependsTransitivelyOn = (stepId: string, targetIds: Set<string>, visited = new Set<string>()): boolean => {
    if (visited.has(stepId)) return false;
    visited.add(stepId);
    return dependenciesFor(stepId).some((dependencyId) =>
      targetIds.has(dependencyId) || dependsTransitivelyOn(dependencyId, targetIds, new Set(visited)),
    );
  };
  const unique = (values: string[]) => [...new Set(values.filter((id) => byId.has(id)))];

  steps.filter((step) => step.kind === "script" && !step.dependsOn?.length).forEach((step) => {
    const source = nearestBefore(step.id, new Set(["prompt", "text"]));
    if (source) step.dependsOn = [source.id];
  });
  steps.filter((step) => step.kind === "storyboard" && !step.dependsOn?.length).forEach((step) => {
    const source = nearestBefore(step.id, new Set(["script", "text", "prompt"]));
    if (source) step.dependsOn = [source.id];
  });

  const storyboardSteps = steps.filter((step) => step.kind === "storyboard");
  const storyboardIds = new Set(storyboardSteps.map((step) => step.id));
  const imageSteps = steps.filter((step) => step.kind === "image");
  if (storyboardSteps.length) {
    const sceneTextSteps = steps.filter((step) =>
      step.kind === "text"
      && (step.dependsOn || []).some((id) => storyboardIds.has(id))
      && Number(step.params?.shotNumber) > 0);
    imageSteps.forEach((image) => {
      const dependencies = image.dependsOn || [];
      const chainedToImage = dependencies.some((id) => byId.get(id)?.kind === "image");
      if (sceneTextSteps.length === imageSteps.length) {
        const imageIndex = imageSteps.indexOf(image);
        const sceneText = sceneTextSteps.find((step) => Number(step.params?.shotNumber) === Number(image.params?.shotNumber))
          || sceneTextSteps[imageIndex];
        const extras = dependencies.filter((id) => ["reference"].includes(byId.get(id)?.kind || ""));
        image.dependsOn = sceneText ? unique([sceneText.id, ...extras]) : dependencies;
      } else if (!dependencies.length || chainedToImage || !dependsTransitivelyOn(image.id, storyboardIds)) {
        const storyboard = nearestBefore(image.id, new Set(["storyboard"])) || storyboardSteps[0];
        image.dependsOn = storyboard ? [storyboard.id] : [];
      }
    });
  }

  const videoSteps = steps.filter((step) => step.kind === "video");
  videoSteps.forEach((video, videoIndex) => {
    const validExplicitDependencies = (video.dependsOn || []).filter((id) => {
      const kind = byId.get(id)?.kind;
      return kind === "prompt" || kind === "text" || kind === "image" || kind === "reference" || kind === "video" || kind === "audio" || kind === "voiceTTS";
    });
    const explicitImageDependencies = validExplicitDependencies.filter((id) => byId.get(id)?.kind === "image");
    if (explicitImageDependencies.length) {
      video.dependsOn = unique(validExplicitDependencies);
    } else if (videoSteps.length === 1 && imageSteps.length) {
      video.dependsOn = unique([...imageSteps.map((image) => image.id), ...validExplicitDependencies]);
    } else if (imageSteps.length) {
      const requestedShot = Number(video.params?.shotNumber);
      const matchingImage = imageSteps.find((image) => requestedShot > 0 && Number(image.params?.shotNumber) === requestedShot)
        || imageSteps[Math.min(videoIndex, imageSteps.length - 1)];
      video.dependsOn = matchingImage ? unique([matchingImage.id, ...validExplicitDependencies]) : unique(validExplicitDependencies);
    } else {
      video.dependsOn = unique(validExplicitDependencies);
    }
    const hasImageDependency = (video.dependsOn || []).some((id) => ["image", "reference"].includes(byId.get(id)?.kind || ""));
    if (hasImageDependency && video.params?.tokenstarMode === "text-to-video") {
      video.params = { ...video.params, tokenstarMode: "asset-video" };
    }
  });

  const videoIds = videoSteps.map((step) => step.id);
  const videoEditSteps = steps.filter((step) => step.kind === "videoEdit");
  if (videoSteps.length > 1 && videoEditSteps.length === 1) {
    const edit = videoEditSteps[0];
    const audioDependencies = (edit.dependsOn || []).filter((id) => ["audio", "voiceTTS"].includes(byId.get(id)?.kind || ""));
    edit.dependsOn = unique([...videoIds, ...audioDependencies]);
  }

  const motionSteps = steps.filter((step) => step.kind === "motion");
  if (videoSteps.length > 1 && motionSteps.length === 1 && !videoEditSteps.length) {
    const motion = motionSteps[0];
    const extraMedia = (motion.dependsOn || []).filter((id) => ["audio", "voiceTTS", "image", "reference"].includes(byId.get(id)?.kind || ""));
    motion.dependsOn = unique([...videoIds, ...extraMedia]);
  }

  steps.filter((step) => step.kind === "output" && !step.dependsOn?.length).forEach((output) => {
    const source = nearestBefore(output.id, new Set(["motion", "videoEdit", "video", "audio", "image"]));
    if (source) output.dependsOn = [source.id];
  });

  return { ...plan, steps };
}

export function workflowPlanQualityIssues(plan: AgentWorkflowPlan): string[] {
  const storyboardSteps = plan.steps.filter((step) => step.kind === "storyboard");
  const storyboardIds = new Set(storyboardSteps.map((step) => step.id));
  const imageSteps = plan.steps.filter((step) => step.kind === "image");
  const videoSteps = plan.steps.filter((step) => step.kind === "video");
  const videoEditSteps = plan.steps.filter((step) => step.kind === "videoEdit");
  const motionSteps = plan.steps.filter((step) => step.kind === "motion");
  const producesRenderedMedia = plan.steps.some((step) => renderedKinds.has(step.kind));
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const dependenciesFor = (stepId: string) => byId.get(stepId)?.dependsOn || [];
  const dependsTransitivelyOn = (stepId: string, targetIds: Set<string>, visited = new Set<string>()): boolean => {
    if (visited.has(stepId)) return false;
    visited.add(stepId);
    return dependenciesFor(stepId).some((dependencyId) =>
      targetIds.has(dependencyId) || dependsTransitivelyOn(dependencyId, targetIds, visited),
    );
  };
  const issues: string[] = [];

  plan.steps.forEach((step) => {
    if (processingKinds.has(step.kind) && step !== plan.steps[0] && !dependenciesFor(step.id).length) {
      issues.push(`${step.kind} step "${step.label}" has no valid dependsOn ids. Dependencies must be explicit and must reference exact step ids from this plan.`);
    }
  });

  if (storyboardSteps.length && plan.goal !== "storyboard_only" && producesRenderedMedia) {
    const expectedImages = Math.max(1, plan.sceneCount || 1);
    if (imageSteps.length < expectedImages) {
      issues.push(
        `The plan contains a storyboard and produces rendered media, but only ${imageSteps.length} explicit image steps exist for ${expectedImages} scenes. ` +
        "The applied canvas must be a complete reusable template: add one editable image step per scene before the relevant video steps. Do not rely on running Storyboard to create nodes later.",
      );
    }
    const sceneTextSteps = plan.steps.filter((step) =>
      step.kind === "text"
      && dependenciesFor(step.id).some((id) => storyboardIds.has(id))
      && Number(step.params?.shotNumber) > 0);
    if (sceneTextSteps.length < expectedImages) {
      issues.push(
        `The storyboard workflow has ${sceneTextSteps.length} isolated scene text steps for ${expectedImages} scenes. ` +
        "Create one editable text step per scene with params.shotNumber and connect each directly after the storyboard.",
      );
    }
    const sceneTextShotNumbers = sceneTextSteps.map((step) => Number(step.params?.shotNumber));
    if (new Set(sceneTextShotNumbers).size !== sceneTextShotNumbers.length) {
      issues.push("Storyboard scene text steps must use unique params.shotNumber values so each branch binds to one scene.");
    }
    sceneTextSteps.filter((step) => !step.prompt?.trim()).forEach((step) => {
      issues.push(`Scene text step "${step.label}" needs its own scene-specific prompt. Do not fall back to the complete user request.`);
    });
    const usedSceneTexts = new Set<string>();
    imageSteps.forEach((image) => {
      const dependencies = dependenciesFor(image.id);
      const sceneTextDependencies = dependencies.filter((id) => sceneTextSteps.some((step) => step.id === id));
      if (dependencies.some((id) => byId.get(id)?.kind === "image")) {
        issues.push(`Image step "${image.label}" depends on another image. Storyboard scene images must be parallel branches, never an image-to-image chain.`);
      }
      if (sceneTextDependencies.length !== 1) {
        issues.push(`Image step "${image.label}" must depend on exactly one isolated scene text step, not directly on the complete storyboard.`);
      }
      sceneTextDependencies.forEach((id) => usedSceneTexts.add(id));
      if (!dependsTransitivelyOn(image.id, storyboardIds)) {
        issues.push(`Image step "${image.label}" is not connected to the storyboard. Connect every planned scene image to its storyboard branch explicitly.`);
      }
    });
    if (sceneTextSteps.length >= expectedImages && usedSceneTexts.size < Math.min(expectedImages, imageSteps.length)) {
      issues.push("Each storyboard scene image must use its own scene text step; scene text dependencies cannot be shared across image branches.");
    }
  }

  videoSteps.forEach((video) => {
    const dependencies = dependenciesFor(video.id);
    const imageDependencies = dependencies.filter((id) => {
      const kind = byId.get(id)?.kind;
      return kind === "image" || kind === "reference";
    });
    if (imageSteps.length && storyboardSteps.length && !imageDependencies.length) {
      issues.push(`Video step "${video.label}" has no image dependency even though this storyboard workflow contains explicit scene images.`);
    }
    if (imageDependencies.length && video.params?.tokenstarMode === "text-to-video") {
      issues.push(`Video step "${video.label}" depends on an image but requests TokenStar text-to-video. Use an image-capable asset or Kling mode.`);
    }
  });

  if (videoSteps.length === 1 && imageSteps.length > 1 && storyboardSteps.length) {
    const connectedImageIds = new Set(dependenciesFor(videoSteps[0].id).filter((id) => byId.get(id)?.kind === "image"));
    const missingImages = imageSteps.filter((image) => !connectedImageIds.has(image.id));
    if (missingImages.length) {
      issues.push(
        `The plan requests one storyboard video but does not connect all planned scene images to it. Missing: ${missingImages.map((image) => image.label).join(", ")}. ` +
        "For a multi-image-to-one-video workflow, the single video step must explicitly depend on every relevant scene image.",
      );
    }
  }

  const perSceneVideoSteps = imageSteps.length > 1
    && imageSteps.length === videoSteps.length
    && videoSteps.every((video) => Number(video.params?.shotNumber) > 0);
  if (perSceneVideoSteps) {
    const usedImages = new Set<string>();
    videoSteps.forEach((video) => {
      const dependencies = dependenciesFor(video.id).filter((id) => byId.get(id)?.kind === "image");
      if (dependencies.length !== 1) {
        issues.push(`Video step "${video.label}" must depend on exactly one corresponding scene image in this one-image-per-clip workflow.`);
      }
      const expectedShot = Number(video.params?.shotNumber);
      if (dependencies.length === 1 && Number(byId.get(dependencies[0])?.params?.shotNumber) !== expectedShot) {
        issues.push(`Video step "${video.label}" must use the image with matching params.shotNumber=${expectedShot}.`);
      }
      dependencies.forEach((id) => usedImages.add(id));
    });
    if (usedImages.size !== imageSteps.length) {
      issues.push("The scene image-to-video mapping is incomplete or reuses the wrong image. Map every scene image to one corresponding video clip.");
    }
  }

  if (videoSteps.length > 1 && motionSteps.length === 1 && !videoEditSteps.length) {
    const motionVideoDependencies = new Set(dependenciesFor(motionSteps[0].id).filter((id) => byId.get(id)?.kind === "video"));
    const missingVideos = videoSteps.filter((video) => !motionVideoDependencies.has(video.id));
    if (missingVideos.length) {
      issues.push(`The single motion assembly step must depend on every generated clip. Missing: ${missingVideos.map((video) => video.label).join(", ")}.`);
    }
  }

  if (videoSteps.length > 1 && videoEditSteps.length === 1) {
    const editVideoDependencies = new Set(dependenciesFor(videoEditSteps[0].id).filter((id) => byId.get(id)?.kind === "video"));
    const missingVideos = videoSteps.filter((video) => !editVideoDependencies.has(video.id));
    if (missingVideos.length) {
      issues.push(`The single videoEdit assembly step must depend on every generated clip. Missing: ${missingVideos.map((video) => video.label).join(", ")}.`);
    }
  }

  return issues;
}

export function assertWorkflowPatchMatchesPlan(plan: AgentWorkflowPlan, patch: CanvasPatch): void {
  if (patch.nodes.length !== plan.steps.length) {
    throw new Error(`Workflow compiler changed the plan structure: ${plan.steps.length} preview steps became ${patch.nodes.length} canvas nodes.`);
  }

  plan.steps.forEach((step, index) => {
    const node = patch.nodes[index];
    if (!node || node.data.nodeType !== step.kind || node.data.title !== step.label) {
      throw new Error(`Workflow compiler changed step ${index + 1} (${step.label}). The preview and canvas patch must match exactly.`);
    }
  });

  const nodeIdByStepId = new Map(plan.steps.map((step, index) => [step.id, patch.nodes[index]?.id]));
  plan.steps.forEach((step) => {
    (step.dependsOn || []).forEach((dependencyId) => {
      const source = nodeIdByStepId.get(dependencyId);
      const target = nodeIdByStepId.get(step.id);
      const edge = patch.edges.find((candidate) => candidate.source === source && candidate.target === target);
      if (!edge) throw new Error(`Workflow compiler omitted dependency ${dependencyId} -> ${step.id}.`);
      if (step.kind === "video" && !edge.targetHandle) {
        throw new Error(`Video dependency ${dependencyId} -> ${step.id} is incompatible with the selected video input mode.`);
      }
    });
  });
}
