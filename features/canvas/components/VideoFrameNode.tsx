"use client";

import { Handle, Position } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { videoUrlFrom } from "@/features/canvas/domain/nodeInputCompiler";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import type { CanvasNode, CanvasNodeData } from "@/shared/canvas";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

export function VideoFrameNode({ id, data, selected }: { id: string; data: CanvasNodeData; selected: boolean }) {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const extractVideoFrame = useCanvasStore((state) => state.extractVideoFrame);
  const removeNode = useCanvasStore((state) => state.removeNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const sourceEdge = edges.find((edge) => edge.target === id && (edge.targetHandle === "video" || !edge.targetHandle));
  const source = nodes.find((node) => node.id === sourceEdge?.source && ["video", "videoEdit", "motion"].includes(node.data.nodeType));
  const videoUrl = source ? videoUrlFrom(source) : "";
  const output = record(data.output?.value);
  const outputImageUrl = text(output.imageUrl) || data.imageUrl || "";
  const [extractingMode, setExtractingMode] = useState<"last" | "timestamp" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const selectedFrameTimeRef = useRef(0);

  useEffect(() => {
    const savedTime = data.frameSourceVideoNodeId === source?.id && Number.isFinite(data.frameTimestampSeconds)
      ? Math.max(0, data.frameTimestampSeconds || 0)
      : 0;
    selectedFrameTimeRef.current = savedTime;
    setCurrentTime(savedTime);
  }, [data.frameSourceVideoNodeId, data.frameTimestampSeconds, source?.id, videoUrl]);

  useEffect(() => {
    if (!previewOpen) return;
    const preview = previewVideoRef.current;
    if (!preview) return;
    const restoreTime = () => {
      const duration = Number.isFinite(preview.duration) ? preview.duration : selectedFrameTimeRef.current;
      preview.currentTime = Math.min(selectedFrameTimeRef.current, Math.max(0, duration));
    };
    if (preview.readyState >= 1) restoreTime();
    else preview.addEventListener("loadedmetadata", restoreTime, { once: true });
    return () => preview.removeEventListener("loadedmetadata", restoreTime);
  }, [previewOpen, videoUrl]);

  const rememberFrameTime = (video: HTMLVideoElement | null) => {
    if (!video || !Number.isFinite(video.currentTime)) return;
    const next = Math.max(0, video.currentTime);
    selectedFrameTimeRef.current = next;
    setCurrentTime(next);
  };

  const openPreview = () => {
    rememberFrameTime(videoRef.current);
    videoRef.current?.pause();
    setPreviewOpen(true);
  };

  const closePreview = () => {
    const preview = previewVideoRef.current;
    rememberFrameTime(preview);
    preview?.pause();
    const cardVideo = videoRef.current;
    if (cardVideo?.readyState && Number.isFinite(cardVideo.duration)) {
      cardVideo.currentTime = Math.min(selectedFrameTimeRef.current, Math.max(0, cardVideo.duration));
    }
    setPreviewOpen(false);
  };

  const extract = async (mode: "last" | "timestamp") => {
    if (!videoUrl || extractingMode) return;
    videoRef.current?.pause();
    if (mode === "timestamp") rememberFrameTime(videoRef.current);
    setExtractingMode(mode);
    try {
      await extractVideoFrame(id, mode, mode === "timestamp" ? selectedFrameTimeRef.current : undefined);
    } catch {
      // The store exposes the actionable error through the existing canvas error UI.
    } finally {
      setExtractingMode(null);
    }
  };

  const sourceLabel = source?.data.title || "尚未连接视频";
  const isRunning = data.status === "running" || extractingMode !== null;

  return (
    <>
      <div className={`relative flex h-[330px] w-[380px] flex-col rounded-[24px] border bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        {isRunning && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": "#84cc16" } as React.CSSProperties} />}
        <div className="absolute -top-8 left-1 text-[20px] font-bold tracking-tight text-[#030303] dark:text-slate-100">{data.title || "Video* 视频抽帧"}</div>

        <div className="absolute -left-[78px] top-1/2 flex -translate-y-1/2 items-center gap-2">
          <span className={`text-[12px] font-bold text-[#5f18c8] transition-opacity dark:text-violet-300 ${selected ? "opacity-100" : "opacity-0"}`}>视频</span>
          <div className={`relative h-[18px] w-[18px] rounded-full border-[2.5px] border-[#7322e3] ${source ? "bg-[#7322e3]" : "bg-white dark:bg-[#101c29]"}`}>
            <Handle type="target" id="video" position={Position.Left} aria-label="视频输入" className="!absolute !inset-0 !m-auto !h-[28px] !w-[28px] !transform-none !border-0 !bg-transparent opacity-0" />
          </div>
        </div>

        <Handle type="source" id="image" position={Position.Right} aria-label="图片输出" title="图片输出" className="!h-3 !w-3 !border-2 !border-white !bg-lime-500 dark:!border-[#101c29]" />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-lime-100 px-2 py-0.5 text-[9px] font-bold text-lime-800 dark:bg-lime-950/80 dark:text-lime-200">图片</span>

        <div className="flex min-h-0 flex-1 flex-col p-5 pb-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[10px]">
            <span className="truncate font-semibold text-[#676f7b] dark:text-slate-400">来源：{sourceLabel}</span>
            {outputImageUrl && <span className="shrink-0 rounded-full bg-lime-100 px-2 py-0.5 font-bold text-lime-800 dark:bg-lime-950/70 dark:text-lime-200">已输出 {Number(data.frameTimestampSeconds || 0).toFixed(2)}s</span>}
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[18px] bg-[#f0f1f3] dark:bg-slate-800">
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    const target = event.currentTarget;
                    target.currentTime = Math.min(selectedFrameTimeRef.current, Math.max(0, target.duration || selectedFrameTimeRef.current));
                  }}
                  onTimeUpdate={(event) => rememberFrameTime(event.currentTarget)}
                  onSeeked={(event) => rememberFrameTime(event.currentTarget)}
                  className="absolute inset-0 h-full w-full bg-black object-contain"
                />
                <button type="button" onClick={(event) => { event.stopPropagation(); openPreview(); }} aria-label="放大预览视频" title="放大预览" className="nodrag absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg>
                </button>
              </>
            ) : (
              <div className="px-8 text-center">
                <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="mx-auto text-[#a8abae] dark:text-slate-500"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg>
                <p className="mt-2 text-[12px] font-semibold text-[#676f7b] dark:text-slate-400">{source ? "源视频尚未生成" : "请连接一个 VideoNode"}</p>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] tabular-nums text-[#676f7b] dark:text-slate-400">当前 {currentTime.toFixed(2)}s</span>
            <span className="truncate text-right text-[10px] text-rose-600 dark:text-rose-300">{data.error || ""}</span>
          </div>
        </div>

        <div className="nodrag grid grid-cols-2 gap-2 border-t border-[#e7eaf0] p-3 dark:border-slate-800">
          <button type="button" onClick={() => void extract("timestamp")} disabled={!videoUrl || isRunning} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#c9ccd1] bg-white px-3 text-[12px] font-bold text-[#30343b] transition hover:border-[#84cc16] hover:text-[#527d0d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
            {extractingMode === "timestamp" && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
            {extractingMode === "timestamp" ? "抽取中" : "当前画面"}
          </button>
          <button type="button" onClick={() => void extract("last")} disabled={!videoUrl || isRunning} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-lime-400 px-3 text-[12px] font-bold text-[#142000] transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-600 disabled:cursor-not-allowed disabled:opacity-45">
            {extractingMode === "last" && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
            {extractingMode === "last" ? "抽取中" : "尾帧"}
          </button>
        </div>

        {selected && <div className="nodrag absolute right-3 top-3 z-20 flex gap-1">
          <button type="button" onClick={() => duplicateNode(id)} className="rounded-md bg-white/90 px-2 py-1 text-[9px] font-semibold text-[#676f7b] shadow-sm hover:text-[#030303] dark:bg-slate-900/90 dark:text-slate-400">Duplicate</button>
          <button type="button" onClick={() => removeNode(id)} className="rounded-md bg-white/90 px-2 py-1 text-[9px] font-semibold text-[#676f7b] shadow-sm hover:text-rose-600 dark:bg-slate-900/90 dark:text-slate-400">Delete</button>
        </div>}
      </div>

      {previewOpen && videoUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={closePreview}>
          <div className="max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <video ref={previewVideoRef} src={videoUrl} controls playsInline onTimeUpdate={(event) => rememberFrameTime(event.currentTarget)} onSeeked={(event) => rememberFrameTime(event.currentTarget)} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            <button type="button" onClick={closePreview} className="mx-auto mt-3 block min-h-11 rounded-lg bg-white/10 px-5 text-sm text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Close</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
