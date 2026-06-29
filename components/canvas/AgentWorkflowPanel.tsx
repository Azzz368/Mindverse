"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCanvasStore } from "@/store/canvasStore";
import type { AgentWorkflowPlan, CanvasPatch } from "@/lib/agent/agentSchema";

const suggestions = [
  "周星驰来香港科技大学拍戏，做成一个 10 秒港风喜剧短片",
  "整理一条校园短片创作流程，包含剧本、分镜和关键帧",
  "生成一支产品发布视频工作流，包含主视觉和动态视频",
];

type AgentPreview = {
  plan: AgentWorkflowPlan;
  patch: CanvasPatch;
  summary: string;
};

export function AgentWorkflowPanel() {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const generateAgentPlan = useCanvasStore((state) => state.generateAgentPlan);
  const applyAgentPatch = useCanvasStore((state) => state.applyAgentPatch);
  const setPendingAgentPatch = useCanvasStore((state) => state.setPendingAgentPatch);
  const runAgentWorkflow = useCanvasStore((state) => state.runAgentWorkflow);
  const agentStatus = useCanvasStore((state) => state.agentStatus);
  const agentMessage = useCanvasStore((state) => state.agentMessage);
  const busy = agentStatus === "planning" || agentStatus === "building" || agentStatus === "running";
  const canSubmit = brief.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setLocalError(null);
    setPreview(null);
    try {
      setPreview(await generateAgentPlan(brief));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Agent 计划生成失败。");
    }
  };

  const applyPreview = () => {
    if (!preview) return;
    applyAgentPatch(preview.patch);
    setLocalError(null);
  };

  const choosePlacement = () => {
    if (!preview) return;
    setPendingAgentPatch(preview.patch);
    setLocalError(null);
    setOpen(false);
  };

  const useFallbackTemplate = () => {
    if (!brief.trim() || busy) return;
    setLocalError(null);
    setPreview(null);
    void runAgentWorkflow(brief);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-[#dce2ea] bg-white text-[#111827] shadow-[0_18px_48px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-[#b9c4d2] hover:bg-[#f7f9fc]"
        aria-label="Open Agent"
      >
        <span className="text-[13px] font-semibold">AI</span>
      </button>
    );
  }

  return (
    <section className="fixed bottom-5 right-5 z-50 flex h-[min(720px,calc(100vh-40px))] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-[#dce2ea] bg-[#f7f9fc] text-[#111827] shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
      <header className="flex h-14 items-center justify-between border-b border-[#e3e8ef] px-4">
        <div>
          <div className="text-[15px] font-semibold text-[#1f6feb]">Mindverse Agent</div>
          <div className="text-[11px] text-[#7b8794]">先生成计划，确认后应用</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-white"
          aria-label="Close Agent"
        >
          <span className="text-[20px] leading-none">x</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <div>
          <div className="mb-3 flex items-center gap-3 text-[22px] font-medium text-[#8a94a3]">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#111827] shadow-sm">
              <span className="text-[13px] font-semibold">AI</span>
            </span>
            工作流规划助手
          </div>
          <h2 className="text-[28px] font-semibold leading-tight tracking-normal text-[#111827]">
            描述你想搭建的创作流程。
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setBrief(item)}
              className="min-h-20 rounded-xl border border-[#e1e6ee] bg-white px-3 py-3 text-left text-[12px] font-medium leading-snug text-[#374151] shadow-sm transition hover:border-[#c8d2df] hover:bg-[#fbfcfe]"
            >
              <span className="mb-2 block text-[15px] leading-none text-[#697386]">-&gt;</span>
              {item}
            </button>
          ))}
        </div>

        {(agentMessage || localError || agentStatus !== "idle") && (
          <div className="flex items-start gap-2 rounded-xl border border-[#e1e6ee] bg-white px-3 py-2 text-[12px] text-[#5f6b7a] shadow-sm">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                localError || agentStatus === "error" ? "bg-rose-500" : agentStatus === "completed" ? "bg-emerald-500" : "bg-sky-500"
              }`}
            />
            <span className={localError || agentStatus === "error" ? "text-rose-600" : ""}>
              {localError || agentMessage || "Agent 已就绪。"}
            </span>
          </div>
        )}

        <div className="rounded-[18px] border border-[#dce2ea] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={4}
            placeholder="描述短片、广告、分镜、图生视频或完整创作包需求..."
            className="min-h-28 w-full resize-none rounded-t-[18px] bg-transparent px-4 py-4 text-[14px] leading-6 text-[#111827] outline-none placeholder:text-[#8a94a3]"
            aria-label="Agent creative brief"
          />
          <div className="flex items-center justify-between gap-2 border-t border-[#edf1f6] px-3 py-3">
            <Button
              type="button"
              disabled={!brief.trim() || busy}
              onClick={useFallbackTemplate}
              className="rounded-full px-4"
            >
              默认模板
            </Button>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="rounded-full border-[#111827] bg-[#111827] px-4 text-white hover:border-[#263244] hover:bg-[#263244]"
            >
              {busy ? "规划中..." : "生成计划"}
            </Button>
          </div>
        </div>

        {preview && (
          <div className="rounded-[18px] border border-[#dce2ea] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#111827]">{preview.plan.title}</h3>
                {preview.plan.description && <p className="mt-1 text-[12px] leading-5 text-[#5f6b7a]">{preview.plan.description}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-[#edf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#1f6feb]">
                {preview.plan.goal}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-[#5f6b7a]">
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">场景: {preview.plan.sceneCount ?? 3}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">视频: {preview.plan.videoProvider ?? "tokenstar"}</div>
              <div className="rounded-lg bg-[#f7f9fc] px-2 py-2">步骤: {preview.plan.steps.length}</div>
            </div>
            <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[#edf1f6]">
              {preview.plan.steps.map((step) => (
                <div key={step.id} className="flex items-start gap-2 border-b border-[#edf1f6] px-3 py-2 last:border-b-0">
                  <span className="mt-0.5 rounded-md bg-[#f2f5f9] px-2 py-1 text-[10px] font-semibold text-[#5f6b7a]">{step.kind}</span>
                  <div>
                    <div className="text-[12px] font-semibold text-[#111827]">{step.label}</div>
                    {step.purpose && <div className="text-[11px] leading-4 text-[#7b8794]">{step.purpose}</div>}
                  </div>
                </div>
              ))}
            </div>
            {!!preview.plan.warnings?.length && (
              <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-700">
                {preview.plan.warnings.join(" ")}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={choosePlacement}
                className="rounded-full border-[#111827] bg-[#111827] text-white hover:border-[#263244] hover:bg-[#263244]"
              >
                选择位置
              </Button>
              <Button type="button" onClick={applyPreview} className="rounded-full">
                直接应用
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
