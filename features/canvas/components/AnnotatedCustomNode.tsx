"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { ImageAnnotationEditor } from "./ImageAnnotationEditor";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { useLang } from "@/components/providers/LangProvider";
import type { CanvasNode, CanvasNodeData, ImageAnnotation } from "@/shared/canvas";
import type { Strings } from "@/shared/i18n/strings";

const GLOW_COLORS: Record<string, string> = {
  video: "#7322e3",
  image: "#3bf657",
  audio: "#f5510b",
  text: "#ebe46b",
  prompt: "#ebe46b",
  script: "#3eedb8",
  storyboard: "#3eedb8",
  storyboardImage: "#3eedb8",
  reference: "#64748b",
  output: "#64748b",
};
const RUNNABLE_TYPES = new Set(["prompt", "text", "script", "image", "video", "audio", "storyboard", "storyboardImage", "output"]);
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

function NodeSettingsPanel({ data, nodeId, onClose }: { data: CanvasNodeData; nodeId: string; onClose(): void }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLang();
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
        <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title} · {t.settingsTitle}</p>
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
  if (node.data.nodeType === "script" && Array.isArray(details.scenes)) return (
    <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
      <p className="text-[11px] font-semibold text-[#030303] dark:text-cyan-200">{text(details.title) || node.data.output?.summary}</p>
      {text(details.logline) && <p className="text-[10px] leading-4 text-[#676f7b] dark:text-slate-400">{text(details.logline)}</p>}
      {details.scenes.map((scene, index) => {
        const item = record(scene);
        const dialogue = Array.isArray(item.dialogue) ? item.dialogue.filter((line): line is string => typeof line === "string").slice(0, 2) : [];
        return (
          <div key={`${String(item.sceneNumber)}-${index}`} className="rounded-md border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-slate-950/50">
            <p className="text-[10px] font-semibold text-[#030303] dark:text-cyan-200">Scene {String(item.sceneNumber || index + 1)} · {text(item.location)}</p>
            <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a] dark:text-slate-200">{text(item.action)}</p>
            {dialogue.map((line) => <p key={line} className="mt-1 text-[10px] leading-4 text-[#676f7b] dark:text-slate-400">{line}</p>)}
          </div>
        );
      })}
    </div>
  );
  /* Reference node with a dropped/uploaded image */
  if (node.data.nodeType === "reference" && node.data.imageUrl) return (
    <div className="mt-2">
      <button onClick={() => onView(node.data.imageUrl!)} className="block w-full overflow-hidden rounded-md border border-violet-200 hover:border-violet-400 dark:border-violet-700 dark:hover:border-violet-400">
        <img src={node.data.imageUrl} alt="Reference" className="h-28 w-full object-cover"/>
      </button>
      <p className="mt-1 text-[9px] text-[#939393] dark:text-slate-500">{node.data.notes || "\u53ef\u8fde\u63a5\u5230\u56fe\u50cf\u6216\u89c6\u9891\u8282\u70b9\u4f5c\u4e3a\u53c2\u8003\u56fe"}</p>
    </div>
  );
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
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);
  return (
    <div className="nodrag absolute -bottom-1 -right-1 z-20 h-6 w-6 cursor-se-resize touch-none"
      onMouseDown={e => {
        e.stopPropagation();
        e.preventDefault();
        startRef.current = { x: e.clientX, y: e.clientY };
        lastRef.current = { x: e.clientX, y: e.clientY };
        activeRef.current = false;
        const onMove = (ev: MouseEvent) => {
          if (!startRef.current || !lastRef.current) return;
          // 3px dead zone measured from the original press point
          const totalDx = ev.clientX - startRef.current.x;
          const totalDy = ev.clientY - startRef.current.y;
          if (!activeRef.current && Math.abs(totalDx) < 3 && Math.abs(totalDy) < 3) return;
          activeRef.current = true;
          // incremental delta from last move (no jump on activation)
          const dx = ev.clientX - lastRef.current.x;
          const dy = ev.clientY - lastRef.current.y;
          lastRef.current = { x: ev.clientX, y: ev.clientY };
          if (dx !== 0 || dy !== 0) onResize(dx, dy);
        };
        const onUp = () => { startRef.current = null; lastRef.current = null; activeRef.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" className="pointer-events-none absolute bottom-1.5 right-1.5 text-[#c9ccd1] dark:text-slate-600">
        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

function PillDropdown({ value, options, onChange }: { value: string | number; options: { value: string | number; label: string }[]; onChange: (v: string | number) => void }) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find(o => String(o.value) === String(value))?.label || String(value);

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`relative flex h-9 items-center justify-center rounded-[18px] bg-[#f0f1f3] px-5 transition-all duration-300 hover:bg-[#e7eaf0] focus:ring-1 focus:ring-[#676f7b] dark:bg-slate-800 dark:hover:bg-slate-700 outline-none text-[13px] font-bold tracking-wide text-[#030303] dark:text-slate-200 ${open ? "opacity-0" : "opacity-100"}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        {activeLabel}
      </button>

      <div
        className={`absolute left-0 top-0 z-[90] w-full origin-top flex-col rounded-[18px] bg-[#f0f1f3] shadow-xl transition-all duration-300 dark:bg-slate-800 overflow-hidden ring-1 ring-[#676f7b] ${open ? "scale-y-100 opacity-100 pointer-events-auto" : "scale-y-50 -translate-y-4 opacity-0 pointer-events-none"}`}
      >
        {options.map((opt, i) => (
          <div key={opt.value} className="flex flex-col">
            {i > 0 && <div className="mx-3 h-[1px] bg-[#c9ccd1] dark:bg-slate-600" />}
            <button
              type="button"
              className="flex h-9 w-full items-center justify-center bg-transparent text-[13px] font-bold tracking-wide text-[#030303] transition-colors hover:bg-[#e7eaf0] dark:text-slate-200 dark:hover:bg-slate-700 outline-none"
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoNodeLayout({ id, data, selected, isGenerating, node, runNode }: any) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useCanvasStore((s) => s.edges);
  const connectedHandles = new Set(edges.filter(e => e.target === id).map(e => e.targetHandle || ""));
  const videoUrl = text(record(data.output?.value).videoUrl || record(data.output?.value).resultUrl || record(data.output?.value).finalVideoUrl || data.resultUrl || "");
  const visualGroupColor = data.workflowId ? undefined : data.groupColor;

  const renderHandle = (label: string, handleId: string, borderColorClass: string, bgColorClass: string, connectedBgColorClass: string) => {
    const isConnected = connectedHandles.has(handleId);
    return (
       <div className="flex items-center justify-end gap-3" style={{ width: "125px" }}>
         <span className={`whitespace-nowrap font-bold text-[14px] text-[#030303] dark:text-slate-200 transition-opacity duration-300 ${selected ? "opacity-100" : "opacity-0"}`}>
           {label}
         </span>
         <div className={`relative grid place-items-center h-[18px] w-[18px] shrink-0 rounded-full border-[2.5px] ${borderColorClass} ${isConnected ? connectedBgColorClass : bgColorClass}`}>
           <Handle type="target" id={handleId} position={Position.Left} className="!absolute !inset-0 !m-auto !h-[26px] !w-[26px] !border-0 !bg-transparent !transform-none opacity-0" />
         </div>
       </div>
    );
  };

  return (
    <>
      <div className={`relative flex h-[280px] w-[380px] flex-col rounded-[24px] border-2 bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#030303] dark:border-slate-700"} ${visualGroupColor && !selected ? "!border-transparent" : ""}`}>
        
        {visualGroupColor && !selected && (
          <div className="absolute inset-[-2px] -z-10 rounded-[26px] border-2" style={{ borderColor: visualGroupColor }} />
        )}
        {isGenerating && (
          <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": GLOW_COLORS[data.nodeType] || "#22d3ee" } as React.CSSProperties} />
        )}

        <div className="absolute -left-[145px] top-[75px] flex flex-col gap-[36px]">
           {renderHandle("Text", "text", "border-[#f59e0b]", "bg-white dark:bg-[#101c29]", "bg-[#f59e0b]")}
           {renderHandle("Start Frame", "start-frame", "border-[#84cc16]", "bg-white dark:bg-[#101c29]", "bg-[#84cc16]")}
           {renderHandle("Last Frame", "last-frame", "border-[#84cc16]", "bg-white dark:bg-[#101c29]", "bg-[#84cc16]")}
           {renderHandle("Reference image", "ref-image", "border-[#84cc16]", "bg-white dark:bg-[#101c29]", "bg-[#84cc16]")}
        </div>

        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />

        <div className="px-6 pt-6 pb-3">
          <h2 className="text-[22px] font-bold tracking-tight text-[#030303] dark:text-slate-100">{data.title || "Kling 3.0 Omni"}</h2>
        </div>

        <div className="flex-1 px-6 pb-6">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[20px] bg-[#f0f1f3] dark:bg-slate-800 border-[6px] border-transparent">
             {videoUrl ? (
               <video src={videoUrl} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full rounded-[14px] object-cover" />
             ) : (
               isGenerating ? (
                  <div className="absolute inset-0 m-auto h-12 w-12 animate-pulse rounded-2xl bg-[#c9ccd1] dark:bg-slate-600" />
               ) : (
                  <div className="flex h-[72px] w-[100px] items-center justify-center rounded-[24px] border-[6px] border-[#e7eaf0] bg-[#f0f1f3] dark:border-slate-600 dark:bg-slate-700" style={{ transform: "scale(1.2)" }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="ml-2 text-[#a8abae] dark:text-slate-400"><path d="M5 3l14 9-14 9V3z"/></svg>
                  </div>
               )
             )}
          </div>
        </div>
      </div>

      <div className={`absolute left-1/2 top-[calc(100%+8px)] z-50 w-[800px] -translate-x-1/2 overflow-visible rounded-[28px] border-[1.5px] border-[#3f3f46] bg-white shadow-2xl transition-all duration-300 dark:border-cyan-400 dark:bg-[#101c29] ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
         <div className="p-6 pb-4">
            <textarea 
               value={data.prompt ?? ""}
               onChange={e => updateNodeData(id, { prompt: e.target.value })}
               placeholder="请为以下创意写一个完整的、可拍摄的10秒短片剧本..."
               className="nodrag h-24 w-full resize-none border-none bg-transparent text-[14px] font-medium leading-7 tracking-wide text-[#030303] outline-none placeholder:font-normal placeholder:text-[#939393] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
         </div>
         <div className="flex items-center justify-between px-6 pb-6">
            <div className="flex gap-2">
              <PillDropdown 
                 value={data.resolution || "1080p"} 
                 options={[{value: "1080p", label: "1080p"}, {value: "720p", label: "720p"}, {value: "480p", label: "480p"}]}
                 onChange={v => updateNodeData(id, { resolution: String(v) })}
              />
              <PillDropdown 
                 value={data.aspectRatio || "16:9"} 
                 options={[{value: "16:9", label: "16:9"}, {value: "21:9", label: "21:9"}, {value: "9:16", label: "9:16"}, {value: "3:2", label: "3:2"}, {value: "3:4", label: "3:4"}, {value: "1:1", label: "1:1"}]}
                 onChange={v => updateNodeData(id, { aspectRatio: String(v) })}
              />
              <PillDropdown 
                 value={data.duration || 15} 
                 options={[{value: 5, label: "5s"}, {value: 8, label: "8s"}, {value: 10, label: "10s"}, {value: 15, label: "15s"}]}
                 onChange={v => updateNodeData(id, { duration: Number(v) })}
              />
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); void runNode(id); }}
              disabled={isGenerating}
              className="nodrag flex h-11 items-center justify-center rounded-full bg-[#030303] px-6 text-[15px] font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-50 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400"
            >
              Run
            </button>
         </div>
      </div>
    </>
  );
}

export function AnnotatedCustomNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const removeNode = useCanvasStore((s) => s.removeNode), duplicateNode = useCanvasStore((s) => s.duplicateNode), createImageRevision = useCanvasStore((s) => s.createImageRevision), createKeyframeBatch = useCanvasStore((s) => s.createKeyframeBatch), runNode = useCanvasStore((s) => s.runNode);
  const { t } = useLang();
  const [viewUrl, setViewUrl] = useState(""), [annotatingUrl, setAnnotatingUrl] = useState(""), [settingsOpen, setSettingsOpen] = useState(false);
  const [cardSize, setCardSize] = useState({ w: 280, h: 0 });
  const node = { id, data } as CanvasNode;
  const isGenerating = data.status === "running" || data.status === "waiting";
  const isWaiting = record(data.output?.value).status === "pending";
  const keyframePrompts = data.nodeType === "storyboardImage" && Array.isArray((record(data.output?.value)).prompts) ? (record(data.output?.value).prompts as unknown[]) : [];
  const visualGroupColor = data.workflowId ? undefined : data.groupColor;

  if (data.nodeType === "video") {
    return <VideoNodeLayout id={id} data={data} selected={selected!} node={node} isGenerating={isGenerating} runNode={runNode} />;
  }

  return (
    <>
      <div
        style={{ width: cardSize.w, ...(cardSize.h > 0 ? { height: cardSize.h } : {}), ...(visualGroupColor ? { borderColor: visualGroupColor, borderWidth: 2 } : {}) }}
        className={`relative rounded-xl border bg-white shadow-md shadow-black/5 dark:bg-[#101c29] dark:shadow-xl dark:shadow-black/20 ${cardSize.h > 0 ? "flex flex-col" : ""} ${selected ? "border-[#030303] dark:border-cyan-400" : visualGroupColor ? "border-transparent" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        {isGenerating && (
          <div className="running-glow-wrapper" style={{ "--glow-color": GLOW_COLORS[data.nodeType] || "#22d3ee" } as React.CSSProperties} />
        )}
        {/* Group colour top strip */}
        {visualGroupColor && (
          <div className="rounded-t-xl h-1.5 w-full" style={{ background: visualGroupColor }} />
        )}
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
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#939393] dark:text-slate-500">{data.nodeType}</p>
          </div>
          {data.workflowLabel && (
            <span
              className="shrink-0 rounded-full bg-[#f3d88b] px-2 py-0.5 text-[10px] font-semibold text-[#5b4300]"
              title={data.workflowTitle || `Workflow ${data.workflowLabel}`}
            >
              #{data.workflowLabel}
            </span>
          )}
          <button onClick={e => { e.stopPropagation(); setSettingsOpen(true); }}
            className="nodrag mr-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[#939393] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-cyan-300" title={t.settingsTitle}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><circle cx="16" cy="6" r="2.2" fill="currentColor" stroke="none"/><circle cx="16" cy="6" r="1.2" fill="white" stroke="none"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/><circle cx="8" cy="18" r="2.2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="1.2" fill="white" stroke="none"/>
            </svg>
          </button>
          {!isGenerating && <Badge status={data.status}/>}
        </div>
        <div className={`px-3 py-2 ${cardSize.h > 0 ? "flex-1 overflow-y-auto" : "min-h-20"}`}>
          <NodePreview node={node} t={t} onView={setViewUrl} onAnnotate={setAnnotatingUrl}/>
          {isWaiting && !isGenerating && <p className="mt-2 text-[10px] text-sky-600 dark:text-sky-200">{t.waitingGeneration}</p>}
          {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
          {data.revisionOf && <p className="mt-2 text-[10px] text-violet-600 dark:text-violet-200">{t.revisionOf}</p>}
          {data.nodeType === "storyboardImage" && (
            <button
              type="button"
              disabled={!keyframePrompts.length}
              onClick={(e) => { e.stopPropagation(); createKeyframeBatch(id); }}
              className="nodrag mt-3 w-full rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-40 dark:border-violet-400/60 dark:bg-violet-400/10 dark:text-violet-100"
            >
              {t.generateKeyframes(keyframePrompts.length || 0)}
            </button>
          )}
        </div>
        <div className="nodrag flex shrink-0 items-center justify-end gap-1 border-t border-[#e7eaf0] px-2 py-1.5 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-200">{t.duplicate}</button>
          <button onClick={() => removeNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-200">{t.delete}</button>
          {RUNNABLE_TYPES.has(data.nodeType) && (
            <button
              onClick={(e) => { e.stopPropagation(); void runNode(id); }}
              disabled={isGenerating}
              className="ml-1 flex items-center gap-1 rounded-md bg-[#030303] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-[#1a1a1a] disabled:opacity-40 dark:bg-cyan-600 dark:hover:bg-cyan-500"
              title={t.runNode}
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.5v7l6-3.5z"/></svg>
              {t.runNode}
            </button>
          )}
        </div>
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        {settingsOpen && <NodeSettingsPanel data={data} nodeId={id} onClose={() => setSettingsOpen(false)} />}
        <ResizeHandle onResize={(dx, dy) => setCardSize(prev => {
          const newW = Math.max(220, prev.w + dx);
          // Lock height into fixed mode on any downward intent; incremental deltas keep it smooth
          const newH = prev.h > 0
            ? Math.max(180, prev.h + dy)
            : dy > 0 ? Math.max(180, 240 + dy) : 0;
          return { w: newW, h: newH };
        })} />
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
