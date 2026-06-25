"use client";
import { useState } from "react";
import { nodeTypes } from "@/types/canvas";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";

const IMAGE_MODELS = [
  { id: "gpt-image-2", label: "gpt-image-2", desc: "OpenAI \u6700\u65b0\u56fe\u50cf\u751f\u6210" },
];

export function NodeToolbar() {
  const setGhostType = useCanvasStore((state) => state.setGhostType);
  const ghostType = useCanvasStore((state) => state.ghostType);
  const { t } = useLang();
  const [imageMenuOpen, setImageMenuOpen] = useState(false);

  const handleTypeClick = (type: typeof nodeTypes[number]) => {
    if (type === "image") {
      setImageMenuOpen((prev) => !prev);
      if (ghostType === "image") { setGhostType(null); setImageMenuOpen(false); }
      return;
    }
    setImageMenuOpen(false);
    setGhostType(ghostType === type ? null : type);
  };

  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-[#e7eaf0] bg-white p-3 dark:border-slate-800 dark:bg-[#0c1622]">
      <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[#939393] dark:text-slate-500">
        {t.addNode}
      </p>
      <div className="space-y-1">
        {nodeTypes.map((type) => (
          <div key={type}>
            <button
              onClick={() => handleTypeClick(type)}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                ghostType === type
                  ? "bg-[#030303] text-white dark:bg-cyan-600 dark:text-white"
                  : "text-[#1a1a1a] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-200"
              }`}
            >
              {t.addPrefix} {t.nodeNames[type] ?? (type[0].toUpperCase() + type.slice(1))}
            </button>
            {type === "image" && imageMenuOpen && (
              <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-[#e7eaf0] pl-2 dark:border-slate-700">
                {IMAGE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setGhostType("image"); setImageMenuOpen(false); }}
                    className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-[#f0f1f3] dark:hover:bg-slate-800"
                  >
                    <span className="text-[11px] font-semibold text-[#030303] dark:text-slate-100">{m.label}</span>
                    <span className="text-[9px] text-[#939393] dark:text-slate-500">{m.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {ghostType && (
        <p className="mt-4 rounded-md bg-[#f0f1f3] px-2 py-1.5 text-[10px] leading-4 text-[#676f7b] dark:bg-slate-800 dark:text-slate-400">
          \u5de6\u952e\u5355\u51fb\u753b\u5e03\u653e\u7f6e\u8282\u70b9<br/>\u53f3\u952e\u5355\u51fb\u53d6\u6d88
        </p>
      )}
    </aside>
  );
}