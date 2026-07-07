import type { Edge, Node } from "@xyflow/react";
import type { NodeExecutionStatus, NodeType } from "./nodeTypes";
import type { StoryboardImagePrompt } from "./story";
import type { VideoModelPresetId } from "@/shared/workflow/videoModelPresets";

export type ImageAnnotation =
  | { id: string; type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; label?: string }
  | { id: string; type: "rectangle" | "circle"; x: number; y: number; width: number; height: number; color: string; label?: string }
  | { id: string; type: "text"; x: number; y: number; text: string; color: string };
export type NodeOutput = { kind: string; summary: string; value: unknown; createdAt: string };
export type CanvasNodeData = {
  nodeType: NodeType; title: string; status: NodeExecutionStatus; output?: NodeOutput; error?: string;
  prompt?: string; negativePrompt?: string; style?: string; aspectRatio?: string;
  instruction?: string; inputText?: string; wordCount?: number;
  model?: string; size?: string; referenceImageUrl?: string; imagePromptPreset?: "character-turnaround" | "scene-nine-grid" | "scene-top-view"; temperature?: number;
  duration?: number; voiceStyle?: string; voice?: string; emotion?: string; volume?: number; resolution?: string; fps?: string; videoInputMode?: "text-to-video" | "image-to-video";
  videoModelPreset?: VideoModelPresetId; videoProvider?: "mock" | "302ai" | "302-sora2" | "tokenstar" | "kling"; tokenstarMode?: "text-to-video" | "asset-video" | "kling-image" | "kling-text" | "kling-omni"; generateAudio?: boolean; referenceImageAssetUrl?: string; referenceVideoAssetUrl?: string; referenceAudioAssetUrl?: string; klingMode?: "text-to-video" | "image-to-video" | "reference-image" | "omni"; klingElementId?: string; referenceVideoUrl?: string; taskId?: string; resultUrl?: string; rawStatus?: string; lastPollAt?: string;
  storyBrief?: string; numberOfScenes?: number;
  scriptTone?: string; targetShotCount?: number; storyboardImagePrompts?: StoryboardImagePrompt[]; batchId?: string; shotNumber?: number; sourceStoryboardNodeId?: string;
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
