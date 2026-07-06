"use client";
import { Button } from "@/components/ui/Button";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { useLang } from "@/components/providers/LangProvider";

export function BottomRunBar() {
  const { selectedNodeId, runNode, runWorkflow, saveCanvas, loadCanvas, clearCanvas, lastError } = useCanvasStore();
  const { t } = useLang();
  return (
    <footer className="flex min-h-14 items-center gap-2 border-t border-[#e7eaf0] bg-white px-4 dark:border-slate-800 dark:bg-[#0c1622]">
      <Button
        disabled={!selectedNodeId}
        onClick={() => selectedNodeId && void runNode(selectedNodeId).catch(() => undefined)}
      >
        {t.runSelected}
      </Button>
      <Button
        className="border-[#030303] bg-[#030303] text-white hover:border-[#1a1a1a] hover:bg-[#1a1a1a] dark:border-cyan-500/50 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:border-cyan-400 dark:hover:bg-cyan-400/20"
        onClick={() => void runWorkflow()}
      >
        {t.runWorkflow}
      </Button>
      <div className="mx-2 h-6 w-px bg-[#e7eaf0] dark:bg-slate-800" />
      <Button onClick={saveCanvas}>{t.save}</Button>
      <Button onClick={loadCanvas}>{t.load}</Button>
      <Button onClick={clearCanvas}>{t.clear}</Button>
      {lastError && <p className="ml-2 text-xs text-rose-600 dark:text-rose-300">{lastError}</p>}
      <p className="ml-auto text-[11px] text-[#939393] dark:text-slate-500">
        {t.mockProviderNote}
      </p>
    </footer>
  );
}
