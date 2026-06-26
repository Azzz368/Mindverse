"use client";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCanvasStore } from "@/store/canvasStore";
import type { CanvasNodeData } from "@/types/canvas";

type Field = { key: keyof CanvasNodeData; label: string; kind?: "textarea" | "number" | "select"; options?: string[] };
const outputPreview = (value: unknown) => {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const fields: Record<string, Field[]> = {
  prompt: [{ key: "title", label: "Title" }, { key: "prompt", label: "Prompt", kind: "textarea" }, { key: "negativePrompt", label: "Avoid", kind: "textarea" }, { key: "style", label: "Style" }, { key: "aspectRatio", label: "Aspect ratio", kind: "select", options: ["1:1", "16:9", "9:16", "4:5"] }],
  text: [{ key: "title", label: "Title" }, { key: "instruction", label: "Instruction", kind: "textarea" }, { key: "inputText", label: "Starting text", kind: "textarea" }, { key: "model", label: "Model override" }, { key: "temperature", label: "Temperature", kind: "number" }],
  script: [{ key: "title", label: "Title" }, { key: "storyBrief", label: "Creative brief", kind: "textarea" }, { key: "scriptTone", label: "Tone" }, { key: "numberOfScenes", label: "Target scene count", kind: "number" }, { key: "model", label: "Model override" }],
  image: [{ key: "title", label: "Title" }, { key: "prompt", label: "Image prompt", kind: "textarea" }, { key: "referenceImageUrl", label: "Reference image URL" }, { key: "model", label: "Model override (blank = server default)" }, { key: "size", label: "Size", kind: "select", options: ["1024x1024", "1536x1024", "1024x1536", "auto"] }],
  video: [{ key: "title", label: "Title" }, { key: "videoProvider", label: "Video provider", kind: "select", options: ["", "mock", "302ai", "302-sora2", "tokenstar"] }, { key: "prompt", label: "Motion prompt", kind: "textarea" }, { key: "model", label: "Model override (not used by 302-sora2)" }, { key: "tokenstarMode", label: "TokenStar mode", kind: "select", options: ["text-to-video", "asset-video", "kling-text-to-video", "kling-image-to-video", "kling-omni"] }, { key: "klingElementId", label: "Kling ElementId (optional)" }, { key: "referenceImageAssetUrl", label: "Existing image asset URL (asset:// optional)", kind: "textarea" }, { key: "referenceVideoAssetUrl", label: "Existing video asset URL (asset:// optional)", kind: "textarea" }, { key: "referenceAudioAssetUrl", label: "Existing audio asset URL (asset:// optional)", kind: "textarea" }, { key: "videoInputMode", label: "302 generation mode", kind: "select", options: ["text-to-video", "image-to-video"] }, { key: "duration", label: "Duration (Sora: 4, 8, or 12)", kind: "number" }, { key: "resolution", label: "Resolution (Sora: 720p or 1080p)" }, { key: "fps", label: "FPS" }, { key: "aspectRatio", label: "Aspect ratio", kind: "select", options: ["16:9", "9:16", "1:1"] }, { key: "generateAudio", label: "Generate audio", kind: "select", options: ["true", "false"] }],
  audio: [{ key: "title", label: "Title" }, { key: "prompt", label: "Audio prompt", kind: "textarea" }, { key: "model", label: "Model override" }, { key: "voice", label: "Voice override" }, { key: "emotion", label: "Emotion" }, { key: "volume", label: "Volume", kind: "number" }, { key: "duration", label: "Duration (seconds)", kind: "number" }],
  storyboard: [{ key: "title", label: "Title" }, { key: "storyBrief", label: "Story brief", kind: "textarea" }, { key: "targetShotCount", label: "Target shot count (1-30)", kind: "number" }, { key: "model", label: "Model override" }],
  storyboardImage: [{ key: "title", label: "Title" }, { key: "aspectRatio", label: "Aspect ratio", kind: "select", options: ["16:9", "9:16", "1:1"] }, { key: "negativePrompt", label: "Avoid", kind: "textarea" }],
  reference: [{ key: "title", label: "Title" }, { key: "notes", label: "Notes", kind: "textarea" }],
  output: [{ key: "title", label: "Title" }, { key: "format", label: "Deliverable format", kind: "select", options: ["Creative package", "Storyboard package", "Campaign brief", "Production sheet", "JSON"] }],
};

export function PropertyPanel() {
  const { nodes, selectedNodeId, updateNodeData, createKeyframeBatch } = useCanvasStore();
  const node = nodes.find((item) => item.id === selectedNodeId);
  if (!node) return <aside className="w-72 shrink-0 border-l border-slate-800 bg-[#0c1622] p-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Inspector</p><p className="mt-5 text-sm leading-6 text-slate-500">Select a node to edit its settings and review generated output.</p></aside>;
  const change = (key: keyof CanvasNodeData, value: string) => updateNodeData(node.id, { [key]: key === "duration" || key === "numberOfScenes" || key === "targetShotCount" || key === "temperature" || key === "volume" ? Number(value) : key === "generateAudio" ? value === "true" : value });
  const prompts = Array.isArray((node.data.output?.value as { prompts?: unknown })?.prompts) ? (node.data.output?.value as { prompts: unknown[] }).prompts : [];
  return <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-800 bg-[#0c1622] p-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Inspector</p><div className="mt-4 space-y-4">{fields[node.data.nodeType].map((field) => <label className="block" key={field.key}><span className="mb-1.5 block text-xs text-slate-400">{field.label}</span>{field.kind === "textarea" ? <Textarea value={String(node.data[field.key] ?? "")} onChange={(event) => change(field.key, event.target.value)} /> : field.kind === "select" ? <Select value={String(node.data[field.key] ?? "")} onChange={(event) => change(field.key, event.target.value)}>{field.options?.map((option) => <option key={option}>{option || "Server default"}</option>)}</Select> : <Input type={field.kind === "number" ? "number" : "text"} value={String(node.data[field.key] ?? "")} onChange={(event) => change(field.key, event.target.value)} />}</label>)}</div>{node.data.nodeType === "storyboardImage" && <button type="button" disabled={!prompts.length} onClick={() => createKeyframeBatch(node.id)} className="mt-5 w-full rounded-md border border-violet-400/60 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-100 disabled:opacity-40">Generate {prompts.length || ""} keyframes</button>}{node.data.output && <div className="mt-6 border-t border-slate-800 pt-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Last output</p><p className="mt-2 text-xs leading-5 text-slate-300">{node.data.output.summary}</p><pre className="mt-3 max-h-96 overflow-auto rounded-md border border-slate-800 bg-slate-950/70 p-3 text-[11px] leading-5 text-slate-200 whitespace-pre-wrap">{outputPreview(node.data.output.value)}</pre></div>}</aside>;
}
