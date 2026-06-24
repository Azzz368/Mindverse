"use client";
import { nodeTypes } from "@/types/canvas";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";

const symbols: Record<string, string> = { prompt: "✦", text: "T", image: "◈", video: "▶", audio: "♫", storyboard: "▦", reference: "⌁", output: "↗" };

export function NodeToolbar() {
  const addNode = useCanvasStore((state) => state.addNode);
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
            onClick={() => addNode(type)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#1a1a1a] transition hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-200"
          >
            <span className="grid h-6 w-6 place-items-center rounded bg-[#f0f1f3] text-[#030303] dark:bg-slate-800 dark:text-cyan-300">
              {symbols[type]}
            </span>
            {t.addPrefix} {t.nodeNames[type] ?? (type[0].toUpperCase() + type.slice(1))}
          </button>
        ))}
      </div>
    </aside>
  );
}
