import type { NodeType } from "@/shared/canvas";

export const capabilityKinds = ["skill", "tool", "model", "runtime"] as const;
export type CapabilityKind = (typeof capabilityKinds)[number];

export const capabilityRisks = ["read", "write", "costly"] as const;
export type CapabilityRisk = (typeof capabilityRisks)[number];

export const capabilityAvailabilities = ["available", "unconfigured", "disabled"] as const;
export type CapabilityAvailability = (typeof capabilityAvailabilities)[number];

export const mediaRoles = [
  "text_query",
  "prompt",
  "story_brief",
  "script",
  "storyboard",
  "source_text",
  "source_image",
  "reference_image",
  "source_video",
  "reference_video",
  "source_audio",
  "reference_audio",
  "background_music",
  "image_candidates",
  "image",
  "video",
  "audio",
  "workflow_plan",
  "canvas_output",
] as const;
export type MediaRole = (typeof mediaRoles)[number];

export type CapabilityConstraints = {
  minDuration?: number;
  maxDuration?: number;
  allowedDurations?: number[];
  aspectRatios?: string[];
  resolutions?: string[];
  maxImages?: number;
  maxVideos?: number;
  maxAudios?: number;
  maxTextInputs?: number;
  [key: string]: unknown;
};

export type CapabilityRecord = {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  capabilities: string[];
  aliases?: string[];
  accepts: MediaRole[];
  produces: MediaRole[];
  constraints?: CapabilityConstraints;
  risk: CapabilityRisk;
  requiresApproval: boolean;
  availability: CapabilityAvailability;
  executorRef: string;
  metadata?: Record<string, unknown>;
};

export type AgentPlanInput = {
  source: "canvas_node" | "step_output" | "user_input";
  role: MediaRole;
  nodeId?: string;
  stepId?: string;
  key?: string;
};

export type AgentRouteOperation =
  | "create_workflow"
  | "transform_media"
  | "generate_media"
  | "organize_canvas"
  | "retrieve_reference"
  | "develop_idea"
  | "custom";

export type AgentSemanticRoute = {
  route: "plan" | "clarify" | "dialogue" | "tool" | "organize";
  operation: AgentRouteOperation;
  objective: string;
  targetNodeIds: string[];
  requiredCapabilities: string[];
  constraints: Record<string, unknown>;
  successCriteria: string[];
  missingInformation: string[];
  questions: string[];
  confidence: number;
  resumePending: boolean;
  reason?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
};

export type CapabilityRetrievalFilters = {
  inputImages?: number;
  inputVideos?: number;
  inputAudios?: number;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  projectId?: string;
  tenantId?: string;
  availability?: CapabilityAvailability[];
};

export type CapabilityRetrievalRequest = {
  query: string;
  domains: Array<"capability" | "project" | "repair" | "workflow">;
  requiredCapabilities: string[];
  filters: CapabilityRetrievalFilters;
  limit?: number;
};

export type CapabilityEvidence = {
  id: string;
  documentId?: string;
  sourceType: string;
  sourceId: string;
  title: string;
  excerpt: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type CapabilityCandidate = {
  id: string;
  kind: CapabilityKind;
  name: string;
  score: number;
  reason: string;
  supports: string[];
  accepts: MediaRole[];
  produces: MediaRole[];
  constraints?: CapabilityConstraints;
  availability: CapabilityAvailability;
  risk: CapabilityRisk;
  requiresApproval: boolean;
  executorRef: string;
  evidenceIds: string[];
};

export type CapabilityEvidenceBundle = {
  query: CapabilityRetrievalRequest;
  capabilities: CapabilityCandidate[];
  skills: CapabilityCandidate[];
  tools: CapabilityCandidate[];
  models: CapabilityCandidate[];
  evidence: CapabilityEvidence[];
  retrievalMode: "catalog" | "postgres-hybrid";
  generatedAt: string;
};

export type AgentSkillUsage = {
  id: string;
  name: string;
  source: "rag" | "active" | "catalog";
  evidenceIds: string[];
  supports: string[];
};

const nodeKindByCapability: Record<string, NodeType> = {
  prompt_authoring: "prompt",
  text_generation: "text",
  script_generation: "script",
  storyboard_generation: "storyboard",
  image_generation: "image",
  image_revision: "image",
  video_generation: "video",
  text_to_video: "video",
  image_to_video: "video",
  multi_reference_video: "video",
  multi_image_video_generation: "video",
  video_edit: "videoEdit",
  video_concat: "videoEdit",
  background_music: "videoEdit",
  motion_graphics: "motion",
  title_overlay: "motion",
  caption_overlay: "motion",
  audio_generation: "audio",
  voice_clone: "voiceClone",
  speech_synthesis: "voiceTTS",
  reference_material: "reference",
  deliver_output: "output",
};

const capabilityByNodeKind: Partial<Record<NodeType, string>> = {
  prompt: "prompt_authoring",
  text: "text_generation",
  script: "script_generation",
  storyboard: "storyboard_generation",
  image: "image_generation",
  video: "video_generation",
  videoEdit: "video_edit",
  motion: "motion_graphics",
  audio: "audio_generation",
  voiceClone: "voice_clone",
  voiceTTS: "speech_synthesis",
  reference: "reference_material",
  output: "deliver_output",
};

export const nodeKindForCapability = (capability: string): NodeType | undefined => nodeKindByCapability[capability];

export const capabilityForNodeKind = (kind: NodeType): string => capabilityByNodeKind[kind] || kind;
