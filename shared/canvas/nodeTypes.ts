export const nodeTypes = ["prompt", "text", "script", "storyboard", "storyboardImage", "image", "video", "videoFrame", "videoEdit", "motion", "audio", "musicGeneration", "hkgaiTTS", "voiceClone", "voiceTTS", "reference", "output"] as const;
export type NodeType = (typeof nodeTypes)[number];
export type NodeExecutionStatus = "idle" | "running" | "waiting" | "success" | "error";
