import type { Edge, Node } from "@xyflow/react";

export const nodeTypes = ["prompt", "text", "script", "storyboard", "storyboardImage", "image", "video", "audio", "reference", "output"] as const;
export type NodeType = (typeof nodeTypes)[number];
export type NodeExecutionStatus = "idle" | "running" | "waiting" | "success" | "error";
export type StoryboardScene = {
  sceneNumber: number; shotNumber?: number; description: string; visualPrompt: string; imagePrompt?: string; camera: string; duration: number;
  cinematicLanguage?: string; blocking?: string; visualContinuity?: string; characterContinuity?: string; sceneContinuity?: string; composition?: string; lens?: string; cameraMovement?: string; lighting?: string; colorPalette?: string; mood?: string; actionRhythm?: string; soundCue?: string; transition?: string; negativePrompt?: string;
};
export type ScriptScene = { sceneNumber: number; location: string; timeOfDay: string; action: string; dialogue: string[]; visualDirection: string; emotionalBeat?: string; storyPurpose?: string; soundDesign?: string; transition?: string };
export type ScriptOutput = { title: string; disclaimer: string; logline: string; tone: string; genre?: string; theme?: string; visualStyle?: string; characters: Array<{ name: string; description: string; wardrobe: string; motivation?: string; consistencyNotes?: string }>; scenes: ScriptScene[] };
export type StoryboardImagePrompt = { shotNumber: number; title: string; prompt: string; negativePrompt: string; aspectRatio: string };
export type ImageAnnotation =
  | { id: string; type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; label?: string }
  | { id: string; type: "rectangle" | "circle"; x: number; y: number; width: number; height: number; color: string; label?: string }
  | { id: string; type: "text"; x: number; y: number; text: string; color: string };
export type NodeOutput = { kind: string; summary: string; value: unknown; createdAt: string };
export type CanvasNodeData = {
  nodeType: NodeType; title: string; status: NodeExecutionStatus; output?: NodeOutput; error?: string;
  prompt?: string; negativePrompt?: string; style?: string; aspectRatio?: string;
  instruction?: string; inputText?: string;
  model?: string; size?: string; referenceImageUrl?: string; temperature?: number;
  duration?: number; voiceStyle?: string; voice?: string; emotion?: string; volume?: number; resolution?: string; fps?: string; videoInputMode?: "text-to-video" | "image-to-video";
  videoProvider?: "mock" | "302ai" | "302-sora2" | "tokenstar"; tokenstarMode?: "text-to-video" | "asset-video" | "kling-text-to-video" | "kling-image-to-video" | "kling-omni"; generateAudio?: boolean; referenceImageAssetUrl?: string; referenceVideoAssetUrl?: string; referenceAudioAssetUrl?: string; klingElementId?: string; taskId?: string; resultUrl?: string; rawStatus?: string; lastPollAt?: string;
  storyBrief?: string; numberOfScenes?: number;
  scriptTone?: string; targetShotCount?: number; storyboardImagePrompts?: StoryboardImagePrompt[]; batchId?: string; shotNumber?: number; sourceStoryboardNodeId?: string;
  imageUrl?: string; notes?: string; format?: string; generationContext?: string;
  annotations?: ImageAnnotation[]; revisionOf?: string; sourceImageUrl?: string; revisionInstruction?: string;
};
export type CanvasNode = Node<CanvasNodeData>;
export type WorkflowEdge = Edge;
export type CanvasSnapshot = { version: 1; projectName: string; nodes: CanvasNode[]; edges: WorkflowEdge[] };
