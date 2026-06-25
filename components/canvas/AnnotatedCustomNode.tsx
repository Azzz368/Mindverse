"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { ImageAnnotationEditor } from "./ImageAnnotationEditor";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";
import type { CanvasNode, CanvasNodeData, ImageAnnotation } from "@/types/canvas";
import type { Strings } from "@/lib/i18n/strings";

const icons: Record<string, string> = { prompt: "\u2726", text: "T", image: "\u25C8", video: "\u25B6", audio: "\u266B", storyboard: "\u25A6", reference: "\u2141", output: "\u2197" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

function CollisionLoader() {
  return (
    <span className="collision-loader" aria-label="generating" title="Generating…">
      <span className="cball cball-a" />
      <span className="cball cball-b" />
    </span>
  );
}

function NodeSettingsPanel({ data, nodeId, onClose }: { data: CanvasNodeData; nodeId: string; onClose(): void }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const set = (patch: Partial<CanvasNodeData>) => updateNodeData(nodeId, patch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sel = "w-full rounded-lg border border-[#e7eaf0] bg-white px-2.5 py-1.5 text-xs text-[#030303] focus:outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
  const lbl = "mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400";
  const wrap = "mb-3 block";
  const ta = "w-full resize-none rounded-lg border border-[#e7eaf0] bg-white px-2.5 py-1.5 text-xs text-[#030303] focus:outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
  const inp = "w-full rounded-lg border border-[#e7eaf0] bg-white px-2.5 py-1.5 text-xs text-[#030303] focus:outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
  const provider = data.videoProvider || "kling";
  return (
    <div className="nodrag nowheel absolute inset-0 z-20 flex flex-col rounded-xl bg-white dark:bg-[#101c29]"
      onWheel={e => { e.stopPropagation(); scrollRef.current?.scrollBy({ top: e.deltaY }); }}>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
        <button onClick={onClose} className="text-[#676f7b] hover:text-[#030303] dark:text-slate-400 dark:hover:text-slate-100 text-sm leading-none">←</button>
        <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title} · 设置</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        <label className={wrap}><span className={lbl}>标题</span><input className={inp} value={data.title} onChange={e => set({ title: e.target.value })} /></label>
        {data.nodeType === "prompt" && <><label className={wrap}><span className={lbl}>提示词</span><textarea className={ta} rows={3} value={data.prompt ?? ""} onChange={e => set({ prompt: e.target.value })} /></label><label className={wrap}><span className={lbl}>排除</span><textarea className={ta} rows={2} value={data.negativePrompt ?? ""} onChange={e => set({ negativePrompt: e.target.value })} /></label><label className={wrap}><span className={lbl}>风格</span><input className={inp} value={data.style ?? ""} onChange={e => set({ style: e.target.value })} /></label><label className={wrap}><span className={lbl}>宽高比</span><select className={sel} value={data.aspectRatio ?? "16:9"} onChange={e => set({ aspectRatio: e.target.value })}>{["1:1","16:9","9:16","4:5"].map(o=><option key={o}>{o}</option>)}</select></label></>}
        {data.nodeType === "text" && <><label className={wrap}><span className={lbl}>指令</span><textarea className={ta} rows={3} value={data.instruction ?? ""} onChange={e => set({ instruction: e.target.value })} /></label><label className={wrap}><span className={lbl}>起始文本</span><textarea className={ta} rows={2} value={data.inputText ?? ""} onChange={e => set({ inputText: e.target.value })} /></label><label className={wrap}><span className={lbl}>模型覆盖</span><input className={inp} value={data.model ?? ""} onChange={e => set({ model: e.target.value })} /></label><label className={wrap}><span className={lbl}>温度</span><input className={inp} type="number" step="0.1" min="0" max="2" value={data.temperature ?? 0.7} onChange={e => set({ temperature: Number(e.target.value) })} /></label></>}
        {data.nodeType === "script" && <><label className={wrap}><span className={lbl}>创意概要</span><textarea className={ta} rows={4} value={data.storyBrief ?? ""} onChange={e => set({ storyBrief: e.target.value })} /></label><label className={wrap}><span className={lbl}>语调</span><input className={inp} value={data.scriptTone ?? ""} onChange={e => set({ scriptTone: e.target.value })} /></label><label className={wrap}><span className={lbl}>目标场景数</span><select className={sel} value={String(data.numberOfScenes ?? 3)} onChange={e => set({ numberOfScenes: Number(e.target.value) })}>{[1,2,3,4,5,6,8,10,12].map(n=><option key={n}>{n}</option>)}</select></label></>}
        {data.nodeType === "image" && <><label className={wrap}><span className={lbl}>图像提示词</span><textarea className={ta} rows={3} value={data.prompt ?? ""} onChange={e => set({ prompt: e.target.value })} /></label><label className={wrap}><span className={lbl}>模型覆盖</span><input className={inp} value={data.model ?? ""} onChange={e => set({ model: e.target.value })} /></label><label className={wrap}><span className={lbl}>尺寸</span><select className={sel} value={data.size ?? "1024x1024"} onChange={e => set({ size: e.target.value })}>{["1024x1024","1536x1024","1024x1536","auto"].map(o=><option key={o}>{o}</option>)}</select></label></>}
        {data.nodeType === "video" && <>
          <label className={wrap}><span className={lbl}>动效提示词</span><textarea className={ta} rows={3} value={data.prompt ?? ""} onChange={e => set({ prompt: e.target.value })} /></label>
          <label className={wrap}><span className={lbl}>视频提供商</span><select className={sel} value={provider} onChange={e => set({ videoProvider: e.target.value as CanvasNodeData["videoProvider"] })}><option value="kling">Kling（官方直连）</option><option value="tokenstar">TokenStar 网关</option><option value="302ai">302.ai</option></select></label>
          {provider === "kling" && <><label className={wrap}><span className={lbl}>Kling 模式</span><select className={sel} value={data.klingMode ?? "image-to-video"} onChange={e => set({ klingMode: e.target.value as CanvasNodeData["klingMode"] })}><option value="image-to-video">首帧生视频</option><option value="reference-image">参考图生视频（主体一致性）</option><option value="text-to-video">文生视频</option><option value="omni">Omni 视频编辑</option></select></label>{data.klingMode === "reference-image" && <><p className="mb-3 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">需先创建主体元素，将 ElementId 填入下方字段。</p><label className={wrap}><span className={lbl}>主体元素 ID（逗号分隔）</span><input className={inp} value={data.klingElementId ?? ""} onChange={e => set({ klingElementId: e.target.value })} /></label></>}{(data.klingMode === "image-to-video" || data.klingMode === "reference-image" || !data.klingMode) && <label className={wrap}><span className={lbl}>首帧 URL（可选）</span><input className={inp} value={data.referenceImageUrl ?? ""} onChange={e => set({ referenceImageUrl: e.target.value })} /></label>}{data.klingMode === "omni" && <label className={wrap}><span className={lbl}>参考视频 URL</span><input className={inp} value={data.referenceVideoUrl ?? ""} onChange={e => set({ referenceVideoUrl: e.target.value })} /></label>}</>}
          {provider === "tokenstar" && <><label className={wrap}><span className={lbl}>TokenStar 模式</span><select className={sel} value={data.tokenstarMode ?? "text-to-video"} onChange={e => set({ tokenstarMode: e.target.value as CanvasNodeData["tokenstarMode"] })}><option value="text-to-video">Seedance 文生视频</option><option value="asset-video">Seedance 参考素材</option><option value="kling-image">Kling 首帧生视频</option><option value="kling-reference">Kling 参考图生视频</option><option value="kling-text">Kling 文生视频</option><option value="kling-omni">Kling Omni 编辑</option></select></label><div className="mb-3 flex items-center justify-between"><span className={lbl} style={{marginBottom:0}}>生成音频</span><button onClick={() => set({ generateAudio: data.generateAudio === false })} className={`relative h-5 w-9 rounded-full transition-colors ${data.generateAudio !== false ? "bg-[#030303] dark:bg-cyan-500" : "bg-[#c9ccd1] dark:bg-slate-600"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${data.generateAudio !== false ? "translate-x-[18px]" : "translate-x-0.5"}`} /></button></div></>}
          <label className={wrap}><span className={lbl}>分辨率</span><select className={sel} value={data.resolution ?? ""} onChange={e => set({ resolution: e.target.value || undefined })}><option value="">服务器默认</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
          <label className={wrap}><span className={lbl}>时长</span><select className={sel} value={String(data.duration ?? "")} onChange={e => set({ duration: e.target.value ? Number(e.target.value) : undefined })}><option value="">服务器默认</option>{[5,8,10,15].map(n=><option key={n} value={n}>{n}s</option>)}</select></label>
          <label className={wrap}><span className={lbl}>画面比例</span><select className={sel} value={data.aspectRatio ?? "16:9"} onChange={e => set({ aspectRatio: e.target.value })}><option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏</option><option value="1:1">1:1 方形</option></select></label>
        </>}
        {data.nodeType === "audio" && <><label className={wrap}><span className={lbl}>音频提示词</span><textarea className={ta} rows={3} value={data.prompt ?? ""} onChange={e => set({ prompt: e.target.value })} /></label><label className={wrap}><span className={lbl}>模型覆盖</span><input className={inp} value={data.model ?? ""} onChange={e => set({ model: e.target.value })} /></label><label className={wrap}><span className={lbl}>音色</span><input className={inp} value={data.voice ?? ""} onChange={e => set({ voice: e.target.value })} /></label><label className={wrap}><span className={lbl}>情绪</span><input className={inp} value={data.emotion ?? ""} onChange={e => set({ emotion: e.target.value })} /></label><label className={wrap}><span className={lbl}>时长（秒）</span><select className={sel} value={String(data.duration ?? "")} onChange={e => set({ duration: e.target.value ? Number(e.target.value) : undefined })}><option value="">默认</option>{[5,10,15,20,30,60].map(n=><option key={n} value={n}>{n}s</option>)}</select></label></>}
        {data.nodeType === "storyboard" && <><label className={wrap}><span className={lbl}>故事概要</span><textarea className={ta} rows={4} value={data.storyBrief ?? ""} onChange={e => set({ storyBrief: e.target.value })} /></label><label className={wrap}><span className={lbl}>目标镜头数</span><select className={sel} value={String(data.targetShotCount ?? data.numberOfScenes ?? 3)} onChange={e => set({ targetShotCount: Number(e.target.value) })}>{[1,2,3,4,5,6,8,10,12,16,20,24,30].map(n=><option key={n}>{n}</option>)}</select></label></>}
        {data.nodeType === "storyboardImage" && <><label className={wrap}><span className={lbl}>宽高比</span><select className={sel} value={data.aspectRatio ?? "16:9"} onChange={e => set({ aspectRatio: e.target.value })}>{["16:9","9:16","1:1"].map(o=><option key={o}>{o}</option>)}</select></label><label className={wrap}><span className={lbl}>排除</span><textarea className={ta} rows={2} value={data.negativePrompt ?? ""} onChange={e => set({ negativePrompt: e.target.value })} /></label></>}
        {data.nodeType === "reference" && <label className={wrap}><span className={lbl}>备注</span><textarea className={ta} rows={4} value={data.notes ?? ""} onChange={e => set({ notes: e.target.value })} /></label>}
        {data.nodeType === "output" && <label className={wrap}><span className={lbl}>交付格式</span><select className={sel} value={data.format ?? "Creative package"} onChange={e => set({ format: e.target.value })}>{["Creative package","Storyboard package","Campaign brief","Production sheet","JSON"].map(o=><option key={o}>{o}</option>)}</select></label>}
      </div>
      <div className="shrink-0 border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
        <button onClick={onClose} className="w-full rounded-lg bg-[#030303] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a1a1a] dark:bg-cyan-600 dark:hover:bg-cyan-500">Done</button>
      </div>
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
      {value.map((scene) => { const item = record(scene); return (
        <div key={String(item.sceneNumber)} className="rounded-md border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-slate-950/50">
          <p className="text-[10px] font-semibold text-[#030303] dark:text-cyan-200">{t.scene} {String(item.sceneNumber)}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a] dark:text-slate-200">{text(item.description)}</p>
          <p className="mt-1 text-[10px] text-[#939393] dark:text-slate-500">{text(item.camera)} · {String(item.duration)}s</p>
        </div>
      ); })}
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

function ResizeHandle({ onResize }: { onResize(dx: number, dy: number): void }) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <div className="nodrag absolute bottom-0 right-0 z-10 h-4 w-4 cursor-se-resize"
      onMouseDown={e => {
        e.stopPropagation();
        startRef.current = { x: e.clientX, y: e.clientY };
        const onMove = (ev: MouseEvent) => { if (!startRef.current) return; onResize(ev.clientX - startRef.current.x, ev.clientY - startRef.current.y); startRef.current = { x: ev.clientX, y: ev.clientY }; };
        const onUp = () => { startRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1 right-1 text-[#c9ccd1] dark:text-slate-600">
        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export function AnnotatedCustomNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const removeNode = useCanvasStore((s) => s.removeNode), duplicateNode = useCanvasStore((s) => s.duplicateNode), createImageRevision = useCanvasStore((s) => s.createImageRevision);
  const { t } = useLang();
  const [viewUrl, setViewUrl] = useState(""), [annotatingUrl, setAnnotatingUrl] = useState(""), [settingsOpen, setSettingsOpen] = useState(false);
  const [cardSize, setCardSize] = useState({ w: 280, h: 0 });
  const node = { id, data } as CanvasNode;
  const isGenerating = data.status === "running" || data.status === "waiting";
  const isWaiting = record(data.output?.value).status === "pending";

  return (
    <>
      <div style={{ width: cardSize.w, ...(cardSize.h > 0 ? { height: cardSize.h } : {}) }}
        className={`relative rounded-xl border bg-white shadow-md shadow-black/5 dark:bg-[#101c29] dark:shadow-xl dark:shadow-black/20 ${cardSize.h > 0 ? "flex flex-col" : ""} ${selected ? "border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        {/* Extra reference-image input handle for image nodes (offset down) */}
        {data.nodeType === "image" && (
          <Handle
            id="ref-image"
            type="target"
            position={Position.Left}
            style={{ top: "62%", background: "#7c3aed", borderColor: "#fff", width: 10, height: 10, borderWidth: 2 }}
            title="参考图输入"
          />
        )}
        <div className="flex shrink-0 items-center gap-2 border-b border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#f0f1f3] text-sm text-[#030303] dark:bg-cyan-400/10 dark:text-cyan-300">{icons[data.nodeType]}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#939393] dark:text-slate-500">{data.nodeType}</p>
          </div>
          <button onClick={e => { e.stopPropagation(); setSettingsOpen(true); }}
            className="nodrag mr-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[#939393] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-cyan-300" title="设置">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
            </svg>
          </button>
          {isGenerating ? <CollisionLoader /> : <Badge status={data.status}/>}
        </div>
        <div className={`px-3 py-2 ${cardSize.h > 0 ? "flex-1 overflow-y-auto" : "min-h-20"}`}>
          <NodePreview node={node} t={t} onView={setViewUrl} onAnnotate={setAnnotatingUrl}/>
          {isWaiting && !isGenerating && <p className="mt-2 text-[10px] text-sky-600 dark:text-sky-200">{t.waitingGeneration}</p>}
          {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
          {data.revisionOf && <p className="mt-2 text-[10px] text-violet-600 dark:text-violet-200">{t.revisionOf}</p>}
        </div>
        <div className="nodrag flex shrink-0 justify-end gap-1 border-t border-[#e7eaf0] px-2 py-1.5 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-200">{t.duplicate}</button>
          <button onClick={() => removeNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-200">{t.delete}</button>
        </div>
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        {settingsOpen && <NodeSettingsPanel data={data} nodeId={id} onClose={() => setSettingsOpen(false)} />}
        <ResizeHandle onResize={(dx, dy) => setCardSize(prev => ({ w: Math.max(220, prev.w + dx), h: Math.max(180, (prev.h > 0 ? prev.h : 240) + dy) }))} />
      </div>
      {viewUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={() => setViewUrl("")}>
          <div className="max-h-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <img src={viewUrl} alt="Full generated result" className="max-h-[80vh] max-w-full rounded-lg object-contain"/>
            <button onClick={() => setViewUrl("")} className="mx-auto mt-3 block rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">{t.close}</button>
          </div>
        </div>, document.body)}
      {annotatingUrl && <ImageAnnotationEditor imageUrl={annotatingUrl} initialAnnotations={data.annotations as ImageAnnotation[] | undefined} initialInstruction={data.revisionInstruction} onClose={() => setAnnotatingUrl("")} onGenerate={(a, i) => { void createImageRevision(id, a, i); setAnnotatingUrl(""); }} />}
    </>
  );
}
