"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { ImageAnnotationEditor } from "./ImageAnnotationEditor";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";
import type { CanvasNode, CanvasNodeData, ImageAnnotation } from "@/types/canvas";
import type { Strings } from "@/lib/i18n/strings";

const icons: Record<string, string> = { prompt: "✦", text: "T", image: "◈", video: "▶", audio: "♫", storyboard: "▦", reference: "⌁", output: "↗" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

/* ── Collision loader ──────────────────────────────────────────────── */
function CollisionLoader() {
  return (
    <span className="collision-loader" aria-label="generating" title="Generating…">
      <span className="cball cball-a" />
      <span className="cball cball-b" />
    </span>
  );
}

/* ── Video settings panel ─────────────────────────────────────────── */
function VideoSettingsPanel({ data, nodeId, onClose }: { data: CanvasNodeData; nodeId: string; onClose(): void }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const set = (patch: Partial<CanvasNodeData>) => updateNodeData(nodeId, patch);
  const provider = data.videoProvider || "kling";
  const sel = "w-full rounded-lg border border-[#e7eaf0] bg-white px-2.5 py-1.5 text-xs text-[#030303] focus:outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
  return (
    <div className="nodrag absolute inset-0 z-20 flex flex-col overflow-y-auto rounded-xl bg-white p-3 dark:bg-[#101c29]">
      {/* Header */}
      <div className="mb-3 flex items-center gap-1.5">
        <button onClick={onClose} className="text-[#676f7b] hover:text-[#030303] dark:text-slate-400 dark:hover:text-slate-100 text-sm leading-none">←</button>
        <p className="text-xs font-semibold text-[#030303] dark:text-slate-100 truncate">{data.title} · 设置</p>
      </div>

      {/* Provider */}
      <label className="mb-2.5 block">
        <span className="mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400">视频提供商</span>
        <select value={provider} onChange={e => set({ videoProvider: e.target.value as CanvasNodeData["videoProvider"] })} className={sel}>
          <option value="kling">Kling（官方直连）</option>
          <option value="tokenstar">TokenStar 网关</option>
          <option value="302ai">302.ai</option>
        </select>
      </label>

      {/* Kling sub-mode */}
      {provider === "kling" && (
        <label className="mb-2.5 block">
          <span className="mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400">Kling 模式</span>
          <select value={data.klingMode || "image-to-video"} onChange={e => set({ klingMode: e.target.value as CanvasNodeData["klingMode"] })} className={sel}>
            <option value="image-to-video">首帧生视频（image-to-video）</option>
            <option value="reference-image">参考图生视频（主体一致性）</option>
            <option value="text-to-video">文生视频（text-to-video）</option>
            <option value="omni">Omni 视频编辑（kling-v3-omni）</option>
          </select>
        </label>
      )}

      {/* Kling reference note */}
      {provider === "kling" && data.klingMode === "reference-image" && (
        <p className="mb-2.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
          参考图模式需先在属性面板填写主体元素 ID（klingElementId）。
        </p>
      )}

      {/* TokenStar sub-mode */}
      {provider === "tokenstar" && (
        <label className="mb-2.5 block">
          <span className="mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400">TokenStar 模式</span>
          <select value={data.tokenstarMode || "text-to-video"} onChange={e => set({ tokenstarMode: e.target.value as CanvasNodeData["tokenstarMode"] })} className={sel}>
            <option value="text-to-video">Seedance 文生视频</option>
            <option value="asset-video">Seedance 参考素材视频</option>
            <option value="kling-image">Kling 首帧生视频</option>
            <option value="kling-reference">Kling 参考图生视频（主体一致性）</option>
            <option value="kling-text">Kling 文生视频</option>
            <option value="kling-omni">Kling Omni 视频编辑</option>
          </select>
        </label>
      )}

      {/* Resolution */}
      <label className="mb-2.5 block">
        <span className="mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400">分辨率</span>
        <select value={data.resolution || ""} onChange={e => set({ resolution: e.target.value || undefined })} className={sel}>
          <option value="">服务器默认</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
      </label>

      {/* Duration */}
      <label className="mb-2.5 block">
        <span className="mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400">时长</span>
        <select value={String(data.duration ?? "")} onChange={e => set({ duration: e.target.value ? Number(e.target.value) : undefined })} className={sel}>
          <option value="">服务器默认</option>
          <option value="5">5s</option>
          <option value="8">8s</option>
          <option value="10">10s</option>
          <option value="15">15s</option>
        </select>
      </label>

      {/* Aspect ratio */}
      <label className="mb-2.5 block">
        <span className="mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400">画面比例</span>
        <select value={data.aspectRatio || "16:9"} onChange={e => set({ aspectRatio: e.target.value })} className={sel}>
          <option value="16:9">16:9 横屏</option>
          <option value="9:16">9:16 竖屏</option>
          <option value="1:1">1:1 方形</option>
        </select>
      </label>

      {/* Generate audio (tokenstar only) */}
      {provider === "tokenstar" && (
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[10px] text-[#676f7b] dark:text-slate-400">生成音频</span>
          <button
            onClick={() => set({ generateAudio: data.generateAudio === false ? true : false })}
            className={`relative h-5 w-9 rounded-full transition-colors ${data.generateAudio !== false ? "bg-[#030303] dark:bg-cyan-500" : "bg-[#c9ccd1] dark:bg-slate-600"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${data.generateAudio !== false ? "translate-x-[18px]" : "translate-x-0.5"}`} />
          </button>
        </div>
      )}

      {/* Done */}
      <button
        onClick={onClose}
        className="mt-auto w-full rounded-lg bg-[#030303] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1a1a1a] dark:bg-cyan-600 dark:hover:bg-cyan-500"
      >
        Done
      </button>
    </div>
  );
}

function NodePreview({ node, t, onView, onAnnotate }: { node: CanvasNode; t: Strings; onView(url: string): void; onAnnotate(url: string): void }) {
  const value = node.data.output?.value, details = record(value), raw = record(details.raw), rawContent = record(raw.content);
  const imageUrl = text(details.imageUrl) || (typeof value === "string" ? value : "");
  const audioUrl = text(details.audioUrl), videoUrl = text(details.videoUrl) || text(details.resultUrl) || text(details.finalVideoUrl) || text(rawContent.video_url), generatedText = text(details.generatedText);

  if (node.data.nodeType === "image" && imageUrl) return (
    <div className="mt-2">
      <button onClick={() => onView(imageUrl)} className="block w-full overflow-hidden rounded-md border border-[#e7eaf0] hover:border-[#030303] dark:border-slate-700 dark:hover:border-cyan-300">
        <img src={imageUrl} alt="Generated result" className="h-36 w-full object-cover"/>
      </button>
      <div className="mt-2 flex gap-2">
        <button onClick={() => onView(imageUrl)} className="text-[10px] text-[#404040] hover:text-[#030303] dark:text-cyan-300 dark:hover:text-cyan-100">{t.viewFullImage}</button>
        <button onClick={() => onAnnotate(imageUrl)} className="text-[10px] text-violet-600 hover:text-violet-800 dark:text-violet-200 dark:hover:text-violet-100">{t.annotateRefine}</button>
      </div>
    </div>
  );
  if (node.data.nodeType === "audio" && audioUrl) return <audio className="mt-2 w-full" controls src={audioUrl}/>;
  if (node.data.nodeType === "video" && videoUrl) return <video className="mt-2 h-32 w-full rounded-md object-cover" controls src={videoUrl}/>;
  if (node.data.nodeType === "storyboard" && Array.isArray(value)) return (
    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
      {value.map((scene) => {
        const item = record(scene);
        return (
          <div key={String(item.sceneNumber)} className="rounded-md border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-slate-950/50">
            <p className="text-[10px] font-semibold text-[#030303] dark:text-cyan-200">{t.scene} {String(item.sceneNumber)}</p>
            <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a] dark:text-slate-200">{text(item.description)}</p>
            <p className="mt-1 text-[10px] text-[#939393] dark:text-slate-500">{text(item.camera)} · {String(item.duration)}s</p>
          </div>
        );
      })}
    </div>
  );
  if (node.data.nodeType === "output" && text(details.format)) return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-[#030303] dark:text-cyan-200">{text(details.format)}</p>
      <p className="mt-1 text-[10px] text-[#939393] dark:text-slate-500">{Array.isArray(details.assets) ? t.connectedAssets(details.assets.length) : t.noConnectedAssets}</p>
    </div>
  );
  return <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-[#676f7b] dark:text-slate-400">{generatedText || node.data.output?.summary || node.data.prompt || node.data.instruction || node.data.storyBrief || node.data.notes || t.configureNode}</p>;
}

export function AnnotatedCustomNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const removeNode = useCanvasStore((state) => state.removeNode),
    duplicateNode = useCanvasStore((state) => state.duplicateNode),
    createImageRevision = useCanvasStore((state) => state.createImageRevision);
  const { t } = useLang();
  const [viewUrl, setViewUrl] = useState(""); const [annotatingUrl, setAnnotatingUrl] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const node = { id, data } as CanvasNode;
  const isGenerating = data.status === "running" || data.status === "waiting";
  const isWaiting = record(data.output?.value).status === "pending";

  return (
    <>
      <div className={`relative w-[280px] rounded-xl border bg-white shadow-md shadow-black/5 dark:bg-[#101c29] dark:shadow-xl dark:shadow-black/20 ${selected ? "border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        <div className="flex items-center gap-2 border-b border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#f0f1f3] text-sm text-[#030303] dark:bg-cyan-400/10 dark:text-cyan-300">
            {icons[data.nodeType]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#939393] dark:text-slate-500">{data.nodeType}</p>
          </div>
          {/* Gear icon for video nodes */}
          {data.nodeType === "video" && (
            <button
              onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
              className="nodrag mr-0.5 grid h-5 w-5 place-items-center rounded text-[#939393] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
              title="视频设置"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="2.5"/>
                <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
              </svg>
            </button>
          )}
          {isGenerating ? <CollisionLoader /> : <Badge status={data.status}/>}
        </div>
        <div className="min-h-20 px-3 py-2">
          <NodePreview node={node} t={t} onView={setViewUrl} onAnnotate={setAnnotatingUrl}/>
          {isWaiting && !isGenerating && <p className="mt-2 text-[10px] text-sky-600 dark:text-sky-200">{t.waitingGeneration}</p>}
          {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
          {data.revisionOf && <p className="mt-2 text-[10px] text-violet-600 dark:text-violet-200">{t.revisionOf}</p>}
        </div>
        <div className="nodrag flex justify-end gap-1 border-t border-[#e7eaf0] px-2 py-1.5 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-200">{t.duplicate}</button>
          <button onClick={() => removeNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-200">{t.delete}</button>
        </div>
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        {/* Inline video settings overlay */}
        {data.nodeType === "video" && settingsOpen && (
          <VideoSettingsPanel data={data} nodeId={id} onClose={() => setSettingsOpen(false)} />
        )}
      </div>
      {viewUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={() => setViewUrl("")}>
          <div className="max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <img src={viewUrl} alt="Full generated result" className="max-h-[80vh] max-w-full rounded-lg object-contain"/>
            <button onClick={() => setViewUrl("")} className="mx-auto mt-3 block rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">{t.close}</button>
          </div>
        </div>,
        document.body,
      )}
      {annotatingUrl && (
        <ImageAnnotationEditor
          imageUrl={annotatingUrl}
          initialAnnotations={data.annotations as ImageAnnotation[] | undefined}
          initialInstruction={data.revisionInstruction}
          onClose={() => setAnnotatingUrl("")}
          onGenerate={(annotations, instruction) => { void createImageRevision(id, annotations, instruction); setAnnotatingUrl(""); }}
        />
      )}
    </>
  );
}
