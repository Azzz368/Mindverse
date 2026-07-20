import type { Edge, Node } from "@xyflow/react";
import type { NodeExecutionStatus, NodeType } from "./nodeTypes";
import type { StoryboardImagePrompt } from "./story";
import type { MotionComposition } from "@/shared/motion/composition";
import type { VideoModelPresetId } from "@/shared/workflow/videoModelPresets";
import type { QwenTtsLanguageType, QwenVoiceLanguageCode, QwenVoiceProvider } from "@/shared/api/qwenContracts";

export type ImageAnnotation =
  | { id: string; type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; label?: string }
  | { id: string; type: "rectangle" | "circle"; x: number; y: number; width: number; height: number; color: string; label?: string }
  | { id: string; type: "text"; x: number; y: number; text: string; color: string };
export type NodeOutput = { kind: string; summary: string; value: unknown; createdAt: string };
export type CanvasNodeData = {
  nodeType: NodeType; title: string; status: NodeExecutionStatus; output?: NodeOutput; error?: string;
  prompt?: string; negativePrompt?: string; style?: string; aspectRatio?: string;
  instruction?: string; inputText?: string; textContent?: string; wordCount?: number; textSourceMode?: "manual" | "storyboard-scene"; sourceSceneText?: string;
  model?: string; size?: string; referenceImageUrl?: string; imageReferenceNodeIds?: string[]; imagePromptPreset?: "character-turnaround" | "scene-nine-grid" | "scene-top-view"; temperature?: number;
  duration?: number; voiceStyle?: string; voice?: string; emotion?: string; volume?: number; resolution?: string; fps?: string; videoInputMode?: "text-to-video" | "image-to-video";
  targetModel?: string; language?: QwenVoiceLanguageCode | string; languageType?: QwenTtsLanguageType; voiceProvider?: QwenVoiceProvider; preferredName?: string; transcript?: string; consentConfirmed?: boolean; referenceAudioName?: string; fallbackMode?: boolean; fallbackReason?: string; ttsText?: string; audioUrl?: string; audioId?: string; expiresAt?: number;
  editPlan?: string; preserveAudio?: boolean; originalVolume?: number; backgroundVolume?: number; fadeIn?: number; fadeOut?: number; transition?: "none" | "fade";
  compositionJson?: string; motionComposition?: MotionComposition; templateId?: string; motionVariablesJson?: string; motionMode?: "template" | "codex-hyperframes"; codexInstruction?: string; hyperframesProjectDir?: string;
  videoModelPreset?: VideoModelPresetId; videoProvider?: "mock" | "302ai" | "302-sora2" | "tokenstar" | "kling"; tokenstarMode?: "text-to-video" | "asset-video" | "kling-image" | "kling-text" | "kling-omni"; generateAudio?: boolean; referenceImageAssetUrl?: string; referenceVideoAssetUrl?: string; referenceAudioAssetUrl?: string; klingMode?: "text-to-video" | "image-to-video" | "reference-image" | "omni"; klingElementId?: string; referenceVideoUrl?: string; videoReferenceNodeIds?: string[]; taskId?: string; resultUrl?: string; rawStatus?: string; lastPollAt?: string;
  storyBrief?: string; numberOfScenes?: number;
  scriptTone?: string; targetShotCount?: number; storyboardImagePrompts?: StoryboardImagePrompt[]; batchId?: string; shotNumber?: number; sourceStoryboardNodeId?: string; storyboardGenerated?: boolean; storyboardBranchSignature?: string;
  imageUrl?: string; notes?: string; format?: string; generationContext?: string;
  annotations?: ImageAnnotation[]; revisionOf?: string; sourceImageUrl?: string; revisionInstruction?: string;
  workflowId?: string; workflowOrder?: number; workflowTitle?: string; workflowLabel?: string;
  groupId?: string; groupColor?: string; locked?: boolean;
};
export type CanvasNode = Node<CanvasNodeData> & {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};
export type WorkflowEdge = Edge;
