"use client";
import { useRef, useState } from "react";
import { nodeTypes } from "@/types/canvas";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";

// Node types that are text/creative-writing — shown in dark gray
const TEXT_TYPES = new Set(["prompt", "text", "script"]);

const IMAGE_MODELS = [
  { id: "gpt-image-2", label: "gpt-image-2", desc: "OpenAI \u6700\u65b0\u56fe\u50cf\u751f\u6210" },
];

export function NodeToolbar() {
  const setGhostType = useCanvasStore((state) => state.setGhostType);
  const ghostType = useCanvasStore((state) => state.ghostType);
  const addMediaNode = useCanvasStore((state) => state.addMediaNode);
  const { t } = useLang();
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleTypeClick = (type: typeof nodeTypes[number]) => {
    if (type === "image") {
      setImageMenuOpen((prev) => !prev);
      if (ghostType === "image") { setGhostType(null); setImageMenuOpen(false); }
      return;
    }
    setImageMenuOpen(false);
    setGhostType(ghostType === type ? null : type);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => /^image\//.test(f.type));
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Place at a slightly staggered position in the center-ish area
        addMediaNode(reader.result as string, { x: 300 + i * 60, y: 200 + i * 40 });
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be re-selected
    e.target.value = "";
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
                  : TEXT_TYPES.has(type)
                    ? "text-[#939393] hover:bg-[#f0f1f3] hover:text-[#676f7b] dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-400"
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

      {/* Upload image from computer */}
      <div className="mt-3 border-t border-[#e7eaf0] pt-3 dark:border-slate-700">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#c9ccd1] px-3 py-2 text-xs font-semibold text-[#676f7b] transition hover:border-[#030303] hover:text-[#030303] dark:border-slate-600 dark:text-slate-400 dark:hover:border-cyan-400 dark:hover:text-cyan-300"
        >
          <span className="text-sm leading-none">+</span>
          \u6dfb\u52a0\u56fe\u7247
        </button>
        <p className="mt-1 text-center text-[9px] text-[#939393] dark:text-slate-600">jpg \u00b7 png \u00b7 webp\uff0c\u53ef\u62d6\u5165\u753b\u5e03</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {ghostType && (
        <p className="mt-3 rounded-md bg-[#f0f1f3] px-2 py-1.5 text-[10px] leading-4 text-[#676f7b] dark:bg-slate-800 dark:text-slate-400">
          \u5de6\u952e\u5355\u51fb\u753b\u5e03\u653e\u7f6e\u8282\u70b9<br/>\u53f3\u952e\u5355\u51fb\u53d6\u6d88
        </p>
      )}
    </aside>
  );
}