"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import type { CanvasNode } from "@/shared/canvas";

const icons: Record<string, string> = { prompt: "✦", text: "T", image: "◈", video: "▶", audio: "♫", storyboard: "▦", reference: "⌁", output: "↗" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

function preview(node: CanvasNode, openImage: (url: string) => void) {
  const d = node.data, value = d.output?.value, details = record(value),
    imageUrl = typeof value === "string" ? value : typeof details.imageUrl === "string" ? details.imageUrl : "",
    audioUrl = typeof details.audioUrl === "string" ? details.audioUrl : "",
    videoUrl = typeof details.videoUrl === "string" ? details.videoUrl : "",
    generatedText = typeof details.generatedText === "string" ? details.generatedText : "";

  if (d.nodeType === "output" && typeof details.format === "string") return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-[#030303] dark:text-cyan-200">{details.format}</p>
      {Array.isArray(details.sections) && <ul className="mt-1 space-y-1 text-[10px] text-[#676f7b] dark:text-slate-400">{details.sections.map((s) => <li key={String(s)}>• {String(s)}</li>)}</ul>}
      <p className="mt-2 text-[10px] text-[#939393] dark:text-slate-500">{Array.isArray(details.assets) ? `${details.assets.length} connected asset(s)` : "No connected assets"}</p>
    </div>
  );
  if (d.nodeType === "image" && imageUrl) return (
    <div className="mt-2">
      <button onClick={() => openImage(imageUrl)} className="block w-full overflow-hidden rounded-md border border-[#e7eaf0] hover:border-[#030303] dark:border-slate-700 dark:hover:border-cyan-300">
        <img src={imageUrl} alt="Generated result" className="h-36 w-full object-cover"/>
      </button>
      <button onClick={() => openImage(imageUrl)} className="mt-1 text-[10px] text-[#404040] hover:text-[#030303] dark:text-cyan-300 dark:hover:text-cyan-100">View full image</button>
    </div>
  );
  if (d.nodeType === "audio" && audioUrl) return <audio className="mt-2 w-full" controls src={audioUrl}>Your browser does not support audio.</audio>;
  if (d.nodeType === "video" && videoUrl) return <video className="mt-2 h-32 w-full rounded-md object-cover" controls src={videoUrl}/>;
  if (d.nodeType === "storyboard" && Array.isArray(value)) return (
    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
      {value.map((scene) => {
        const item = scene as { sceneNumber?: number; description?: string; visualPrompt?: string; camera?: string; duration?: number };
        return (
          <div key={item.sceneNumber} className="rounded-md border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-slate-950/50">
            <p className="text-[10px] font-semibold text-[#030303] dark:text-cyan-200">SCENE {item.sceneNumber}</p>
            <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a] dark:text-slate-200">{item.description}</p>
            <p className="mt-1 text-[10px] text-[#939393] dark:text-slate-500">{item.camera} · {item.duration}s</p>
          </div>
        );
      })}
    </div>
  );
  return <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-[#676f7b] dark:text-slate-400">{generatedText || d.output?.summary || d.prompt || d.instruction || d.storyBrief || d.notes || "Configure this node in the inspector."}</p>;
}

export function CustomNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const removeNode = useCanvasStore((state) => state.removeNode), duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const [imageUrl, setImageUrl] = useState("");
  const node = { id, data } as CanvasNode;
  const isWaiting = record(data.output?.value).status === "pending";

  return (
    <>
      <div className={`w-[280px] rounded-xl border bg-white shadow-md shadow-black/5 dark:bg-[#101c29] dark:shadow-xl dark:shadow-black/20 ${selected ? "border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        <div className="flex items-center gap-2 border-b border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#f0f1f3] text-sm text-[#030303] dark:bg-cyan-400/10 dark:text-cyan-300">
            {icons[data.nodeType]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#939393] dark:text-slate-500">{data.nodeType}</p>
          </div>
          <Badge status={data.status}/>
        </div>
        <div className="min-h-20 px-3 py-2">
          {preview(node, setImageUrl)}
          {isWaiting && <p className="mt-2 text-[10px] text-sky-600 dark:text-sky-200">Waiting for generation…</p>}
          {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
        </div>
        <div className="nodrag flex justify-end gap-1 border-t border-[#e7eaf0] px-2 py-1.5 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-200">Duplicate</button>
          <button onClick={() => removeNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-200">Delete</button>
        </div>
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
      </div>
      {imageUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={() => setImageUrl("")}>
          <div className="max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <img src={imageUrl} alt="Full generated result" className="max-h-[80vh] max-w-full rounded-lg object-contain"/>
            <button onClick={() => setImageUrl("")} className="mx-auto mt-3 block rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Close</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
