export const nodeTypes = ["prompt", "text", "script", "storyboard", "storyboardImage", "image", "video", "videoEdit", "motion", "audio", "reference", "output"] as const;
export type NodeType = (typeof nodeTypes)[number];
export type NodeExecutionStatus = "idle" | "running" | "waiting" | "success" | "error";
