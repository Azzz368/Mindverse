"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCanvasStore } from "@/store/canvasStore";

const suggestions = [
  "周星驰来学校拍戏",
  "整理一条校园短片流程",
  "生成一支产品发布视频",
];

export function AgentWorkflowPanel() {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const runAgentWorkflow = useCanvasStore((state) => state.runAgentWorkflow);
  const agentStatus = useCanvasStore((state) => state.agentStatus);
  const agentMessage = useCanvasStore((state) => state.agentMessage);
  const busy = agentStatus === "planning" || agentStatus === "building" || agentStatus === "running";
  const canSubmit = brief.trim().length > 0 && !busy;

  const submit = () => {
    if (!canSubmit) return;
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
    <section className="fixed bottom-5 right-5 z-50 flex h-[min(680px,calc(100vh-40px))] w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] border border-[#dce2ea] bg-[#f7f9fc] text-[#111827] shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
      <header className="flex h-14 items-center justify-between border-b border-[#e3e8ef] px-4">
        <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-white">
          <span className="text-[18px] leading-none">□</span>
        </button>
        <div className="text-[15px] font-semibold text-[#1f6feb]">新功能</div>
        <div className="flex items-center gap-1">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-white">
            <span className="text-[22px] leading-none">+</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-white"
            aria-label="Close Agent"
          >
            <span className="text-[20px] leading-none">x</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-7">
        <div className="mt-auto">
          <div className="mb-4 flex items-center gap-3 text-[24px] font-medium text-[#8a94a3]">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#111827] shadow-sm">
              <span className="text-[13px] font-semibold">AI</span>
            </span>
            Hi kaiqiwu72!
          </div>
          <h2 className="text-[34px] font-semibold leading-tight tracking-normal text-[#111827]">
            今天一起创作点什么？
          </h2>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setBrief(item)}
              className="min-h-20 rounded-[16px] border border-[#e1e6ee] bg-white px-3 py-3 text-left text-[13px] font-medium leading-snug text-[#374151] shadow-sm transition hover:border-[#c8d2df] hover:bg-[#fbfcfe]"
            >
              <span className="mb-3 block text-[17px] leading-none text-[#697386]">-&gt;</span>
              {item}
            </button>
          ))}
        </div>

        {(agentMessage || agentStatus !== "idle") && (
          <div className="mt-4 flex items-start gap-2 rounded-[14px] border border-[#e1e6ee] bg-white px-3 py-2 text-[12px] text-[#5f6b7a] shadow-sm">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                agentStatus === "error" ? "bg-rose-500" : agentStatus === "completed" ? "bg-emerald-500" : "bg-sky-500"
              }`}
            />
            <span className={agentStatus === "error" ? "text-rose-600" : ""}>
              {agentMessage || "Agent ready."}
            </span>
          </div>
        )}

        <div className="mt-4 rounded-[22px] border border-[#dce2ea] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={4}
            placeholder="描述创意或需求，/ 使用技能，@ 引用参考"
            className="min-h-28 w-full resize-none rounded-t-[22px] bg-transparent px-4 py-4 text-[15px] leading-6 text-[#111827] outline-none placeholder:text-[#8a94a3]"
            aria-label="Agent creative brief"
          />
          <div className="flex items-center justify-between border-t border-[#edf1f6] px-3 py-3">
            <div className="flex items-center gap-2">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-[#f2f5f9] text-[#111827] hover:bg-[#e8edf4]">
                <span className="text-[24px] leading-none">+</span>
              </button>
              <button type="button" className="flex h-10 items-center gap-2 rounded-full px-3 text-[14px] font-semibold text-[#374151] hover:bg-[#f2f5f9]">
                手动确认
                <span className="text-[12px] leading-none">v</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-[#6b7280] hover:bg-[#f2f5f9]">
                <span className="text-[12px] font-semibold leading-none">MIC</span>
              </button>
              <Button
                disabled={!canSubmit}
                onClick={submit}
                className="grid h-11 w-11 place-items-center rounded-full border-[#111827] bg-[#111827] p-0 text-white hover:border-[#263244] hover:bg-[#263244] disabled:border-[#d5dbe4] disabled:bg-[#d5dbe4] disabled:text-[#8a94a3]"
                aria-label="Build Agent workflow"
              >
                <span className="text-[16px] leading-none">-&gt;</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
