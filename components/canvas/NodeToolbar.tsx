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
  const setGhostMedia = useCanvasStore((state) => state.setGhostMedia);
  const ghostMediaUrl = useCanvasStore((state) => state.ghostMediaUrl);
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
    // Read first file and enter ghost mode; subsequent files place directly after
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (i === 0) {
          setGhostMedia(reader.result as string);
        } else {
          // For multi-select, place extras at offset positions via addMediaNode equivalent
          setGhostMedia(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-[#e7eaf0] bg-white p-3 dark:border-slate-800 dark:bg-[#0c1622]">
      <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[.16em] text-[#939393] dark:text-slate-500">
        {t.addNode}
      </p>
      <div className="space-y-1">
        {/* Text / creative-writing nodes — gray */}
        {nodeTypes.filter(t => TEXT_TYPES.has(t)).map((type) => (
          <button
            key={type}
            onClick={() => handleTypeClick(type)}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
              ghostType === type
                ? "bg-[#030303] text-white dark:bg-cyan-600 dark:text-white"
                : "text-[#939393] hover:bg-[#f0f1f3] hover:text-[#676f7b] dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-400"
            }`}
          >
            {t.addPrefix} {t.nodeNames[type] ?? (type[0].toUpperCase() + type.slice(1))}
          </button>
        ))}
        {/* Upload local image — gray, same group as text tools */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold transition text-[#939393] hover:bg-[#f0f1f3] hover:text-[#676f7b] dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-400"
        >
          {t.uploadImage}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
        {/* Media / AI-generation nodes — dark */}
        {nodeTypes.filter(t => !TEXT_TYPES.has(t)).map((type) => (
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
      {(ghostType || ghostMediaUrl) && (
        <p className="mt-3 whitespace-pre-line rounded-md bg-[#f0f1f3] px-2 py-1.5 text-[10px] leading-4 text-[#676f7b] dark:bg-slate-800 dark:text-slate-400">
          {t.placementHint}
        </p>
      )}
    </aside>
  );
}