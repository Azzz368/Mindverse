import type { Edge, Node } from "@xyflow/react";

export const nodeTypes = ["prompt", "text", "image", "video", "audio", "storyboard", "reference", "output"] as const;
export type NodeType = (typeof nodeTypes)[number];
export type NodeExecutionStatus = "idle" | "running" | "waiting" | "success" | "error";
export type StoryboardScene = { sceneNumber: number; description: string; visualPrompt: string; camera: string; duration: number };
export type NodeOutput = { kind: string; summary: string; value: unknown; createdAt: string };
export type CanvasNodeData = {
  nodeType: NodeType; title: string; status: NodeExecutionStatus; output?: NodeOutput; error?: string;
  prompt?: string; negativePrompt?: string; style?: string; aspectRatio?: string;
  instruction?: string; inputText?: string;
  model?: string; size?: string; referenceImageUrl?: string; temperature?: number;
  duration?: number; voiceStyle?: string; voice?: string; emotion?: string; volume?: number; resolution?: string; fps?: string; videoInputMode?: "text-to-video" | "image-to-video";
  storyBrief?: string; numberOfScenes?: number;
  imageUrl?: string; notes?: string; format?: string; generationContext?: string;
};
export type CanvasNode = Node<CanvasNodeData>;
export type WorkflowEdge = Edge;
export type CanvasSnapshot = { version: 1; projectName: string; nodes: CanvasNode[]; edges: WorkflowEdge[] };
