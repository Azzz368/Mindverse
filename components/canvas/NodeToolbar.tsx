"use client";
import { nodeTypes } from "@/types/canvas";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";

export function NodeToolbar() {
  const setGhostType = useCanvasStore((state) => state.setGhostType);
  const ghostType = useCanvasStore((state) => state.ghostType);
  const { t } = useLang();
  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-[#e7eaf0] bg-white p-3 dark:border-slate-800 dark:bg-[#0c1622]">
      <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[#939393] dark:text-slate-500">
        {t.addNode}
      </p>
      <div className="space-y-1">
        {nodeTypes.map((type) => (
          <button
            key={type}
            onClick={() => setGhostType(ghostType === type ? null : type)}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${ghostType === type ? "bg-[#030303] text-white dark:bg-cyan-600 dark:text-white" : "text-[#1a1a1a] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-200"}`}
          >
            {t.addPrefix} {t.nodeNames[type] ?? (type[0].toUpperCase() + type.slice(1))}
          </button>
        ))}
      </div>
      {ghostType && (
        <p className="mt-4 rounded-md bg-[#f0f1f3] px-2 py-1.5 text-[10px] leading-4 text-[#676f7b] dark:bg-slate-800 dark:text-slate-400">
          左键单击画布放置节点<br/>右键单击取消
        </p>
      )}
    </aside>
  );
}