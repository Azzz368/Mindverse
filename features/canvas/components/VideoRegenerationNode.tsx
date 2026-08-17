"use client";

import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { videoUrlFrom } from "@/features/canvas/domain/nodeInputCompiler";
import type { CanvasNode, CanvasNodeData } from "@/shared/canvas";

const inputPorts = [
  { id: "text", label: "最终提示词", color: "#f59e0b" },
  { id: "base-video", label: "H3 768P 视频", color: "#7322e3" },
  { id: "first-frame", label: "首帧", color: "#84cc16" },
  { id: "last-frame", label: "尾帧", color: "#65a30d" },
  { id: "reference-image", label: "参考图", color: "#22c55e" },
  { id: "reference-video", label: "参考视频", color: "#8b5cf6" },
  { id: "reference-audio", label: "参考音频", color: "#f5510b" },
] as const;

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

export function VideoRegenerationNode({ id, data, selected }: { id: string; data: CanvasNodeData; selected: boolean }) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const removeNode = useCanvasStore((state) => state.removeNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const runNode = useCanvasStore((state) => state.runNode);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);
  const updateNodeInternals = useUpdateNodeInternals();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isRunning = data.status === "running" || data.status === "waiting";
  const mode = data.regenerationMode || "base-video";
  const output = record(data.output?.value);
  const videoUrl = text(output.videoUrl) || text(output.resultUrl) || data.resultUrl || "";
  const connectedHandles = new Set(edges.filter((edge) => edge.target === id).map((edge) => edge.targetHandle || ""));
  const sourceVideo = useMemo(() => {
    const edge = edges.find((item) => item.target === id && item.targetHandle === "base-video");
    return edge ? nodes.find((node) => node.id === edge.source) as CanvasNode | undefined : undefined;
  }, [edges, id, nodes]);

  useEffect(() => { updateNodeInternals(id); }, [id, mode, updateNodeInternals]);

  const setMode = (nextMode: "base-video" | "source-task") => {
    updateNodeData(id, { regenerationMode: nextMode, status: "idle", error: undefined, output: undefined, resultUrl: undefined, taskId: undefined });
  };

  return (
    <div className={`relative w-[380px] rounded-[24px] border bg-white shadow-sm dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
      {isRunning && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": "#7322e3" } as React.CSSProperties} />}
      <div className="absolute -top-8 left-1 text-[19px] font-bold text-[#030303] dark:text-slate-100">{data.title || "MiniMax H3 2K 再生成"}</div>

      {mode === "base-video" && <div className="absolute left-0 top-6 z-10 flex -translate-x-1/2 flex-col gap-5">
        {inputPorts.map((port) => <div key={port.id} className="relative h-4">
          <Handle type="target" id={port.id} position={Position.Left} className="!relative !left-0 !top-2 !h-3 !w-3 !border-2 !border-white dark:!border-[#101c29]" style={{ background: connectedHandles.has(port.id) ? port.color : "#cbd5e1" }} />
          <span className="pointer-events-none absolute left-5 top-0 whitespace-nowrap text-[9px] font-semibold text-[#676f7b] dark:text-slate-400">{port.label}</span>
        </div>)}
      </div>}
      <Handle type="source" id="video" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-[#7322e3] dark:!border-[#101c29]" />

      <div className="p-5">
        <div className="mb-4 flex rounded-full bg-[#f0f1f3] p-1 dark:bg-slate-800">
          <button onClick={() => setMode("base-video")} className={`flex-1 rounded-full px-3 py-2 text-[11px] font-bold ${mode === "base-video" ? "bg-white text-[#030303] shadow dark:bg-slate-700 dark:text-white" : "text-[#676f7b]"}`}>连接源视频</button>
          <button onClick={() => setMode("source-task")} className={`flex-1 rounded-full px-3 py-2 text-[11px] font-bold ${mode === "source-task" ? "bg-white text-[#030303] shadow dark:bg-slate-700 dark:text-white" : "text-[#676f7b]"}`}>使用任务 ID</button>
        </div>

        {videoUrl ? <video src={videoUrl} controls playsInline className="h-[180px] w-full rounded-2xl bg-black object-contain" /> : <div className="flex h-[150px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#c9ccd1] bg-[#f8f9fa] px-5 text-center dark:border-slate-700 dark:bg-slate-900">
          <span className="text-2xl font-black text-violet-600">2K</span>
          <p className="mt-2 text-[11px] leading-4 text-[#676f7b] dark:text-slate-400">{mode === "source-task" ? "输入同一 MiniMax 账号近 7 天内成功的 H3 任务 ID" : sourceVideo && videoUrlFrom(sourceVideo) ? "源视频已连接，运行前请确认提示词与原素材完全一致" : "连接符合 MiniMax-H3 768P 输出规格且带音轨的视频"}</p>
        </div>}

        {mode === "source-task" ? <input value={data.sourceTaskId || ""} onChange={(event) => updateNodeData(id, { sourceTaskId: event.target.value })} placeholder="source_task_id" className="nodrag mt-4 w-full rounded-xl border border-[#e7eaf0] bg-white px-3 py-2 text-xs outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-white" /> : <textarea value={data.prompt || ""} onChange={(event) => updateNodeData(id, { prompt: event.target.value })} maxLength={40000} placeholder="必须填写生成 768P 源视频时实际提交的最终提示词（Context IR 增强后的版本）" className="nodrag mt-4 h-24 w-full resize-none rounded-xl border border-[#e7eaf0] bg-white px-3 py-2 text-xs leading-5 outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-white" />}

        <button onClick={() => setDetailsOpen((value) => !value)} className="nodrag mt-3 text-[10px] font-semibold text-violet-700 dark:text-violet-300">{detailsOpen ? "收起接口限制" : "查看接口限制"}</button>
        {detailsOpen && <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">仅支持 MiniMax-H3 768P 输出再生为 2K，不支持任意视频。源视频必须带音轨、24fps、宽高均可被 32 整除，并满足官方帧数与面积限制。任务 ID 模式需要白名单权限。</div>}
        {data.error && <p className="mt-2 text-[11px] leading-4 text-rose-600 dark:text-rose-300">{data.error}</p>}
      </div>

      <div className="nodrag flex items-center justify-between border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
        <label className="flex items-center gap-2 text-[10px] text-[#676f7b] dark:text-slate-400"><input type="checkbox" checked={data.aigcWatermark === true} onChange={(event) => updateNodeData(id, { aigcWatermark: event.target.checked })} />AIGC 水印</label>
        <div className="flex gap-1"><button onClick={() => duplicateNode(id)} className="rounded px-2 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3]">Duplicate</button><button onClick={() => removeNode(id)} className="rounded px-2 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600">Delete</button><button onClick={() => void runNode(id)} disabled={isRunning} className="rounded-full bg-[#030303] px-4 py-1.5 text-[11px] font-bold text-white disabled:opacity-40 dark:bg-cyan-500 dark:text-[#030303]">Run</button></div>
      </div>
    </div>
  );
}
