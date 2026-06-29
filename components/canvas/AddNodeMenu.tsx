import { useState, useRef, useMemo } from "react";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";
import type { NodeType } from "@/types/canvas";
import type { Strings } from "@/lib/i18n/strings";

export function getIcon(type: string) {
  const map: Record<string, string> = { prompt: "\u2726", text: "T", image: "\u25C8", video: "\u25B6", audio: "\u266B", storyboard: "\u25A6", reference: "\u2141", output: "\u2197", upload_image: "+" };
  return map[type] || "T";
}

const ALL_CATEGORIES = ["New nodes", "Recently used", "Video", "Image", "Audio", "Text", "Storyboard"];

const getTools = (t: Strings) => [
  { id: "seedance-2.0", type: "video", cat: "Video", title: "Seedance 2.0", desc: t.toolDescSeedance, iconBg: "bg-rose-500", iconColor: "text-white" },
  { id: "gen-4.5", type: "video", cat: "Video", title: "Gen-4.5", desc: t.toolDescGen45, iconBg: "bg-rose-600", iconColor: "text-white" },
  { id: "storyboard-image", type: "storyboardImage", cat: "Storyboard", title: t.nodeNames["storyboardImage"], desc: t.toolDescStoryboardImage, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
  { id: "gpt-image-2", type: "image", cat: "Image", title: "GPT Image 2", desc: t.toolDescGptImage, iconBg: "bg-blue-500", iconColor: "text-white" },
  { id: "upload-image", type: "upload_image", cat: "Image", title: t.uploadImage, desc: t.toolDescUploadImage, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  { id: "audio-gen", type: "audio", cat: "Audio", title: t.nodeNames["audio"], desc: t.toolDescAudio, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  { id: "claude", type: "text", cat: "Text", title: "Claude", desc: t.toolDescText, iconBg: "bg-emerald-500", iconColor: "text-white" },
  { id: "prompt", type: "prompt", cat: "Text", title: t.nodeNames["prompt"], desc: t.toolDescPrompt, iconBg: "bg-purple-100", iconColor: "text-purple-600" },
  { id: "script", type: "script", cat: "Storyboard", title: t.nodeNames["script"], desc: t.toolDescScript, iconBg: "bg-slate-800", iconColor: "text-white" },
  { id: "storyboard", type: "storyboard", cat: "Storyboard", title: t.nodeNames["storyboard"], desc: t.toolDescStoryboard, iconBg: "bg-slate-800", iconColor: "text-white" },
  { id: "reference", type: "reference", cat: "Image", title: t.nodeNames["reference"], desc: t.toolDescReference, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
  { id: "output", type: "output", cat: "Text", title: t.nodeNames["output"], desc: t.toolDescOutput, iconBg: "bg-slate-100", iconColor: "text-slate-600" },
];

export function AddNodeMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { t } = useLang();
  const [activeCat, setActiveCat] = useState("Video");
  const [search, setSearch] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  
  const setGhostType = useCanvasStore(s => s.setGhostType);
  const setGhostMedia = useCanvasStore(s => s.setGhostMedia);
  const fileRef = useRef<HTMLInputElement>(null);

  const allTools = useMemo(() => getTools(t), [t]);

  const filtered = useMemo(() => {
    if (search.trim()) return allTools.filter(tool => tool.title.toLowerCase().includes(search.toLowerCase()) || tool.desc.toLowerCase().includes(search.toLowerCase()));
    if (activeCat === "New nodes" || activeCat === "Recently used") return allTools.slice(0, 6); // Mock
    return allTools.filter(tool => tool.cat === activeCat);
  }, [activeCat, search, allTools]);

  const handleToolClick = (tool: ReturnType<typeof getTools>[0]) => {
    if (tool.type === "upload_image") {
      fileRef.current?.click();
      return;
    }
    // Set ghost type based on tool.type
    // A future enhancement could inject provider defaults into the node
    setGhostType(tool.type as NodeType);
    if (!keepOpen) onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => /^image\//.test(f.type));
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (i === 0) setGhostMedia(reader.result as string);
        else setGhostMedia(reader.result as string); // Not ideal for multiple, but matches previous behavior
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
    if (!keepOpen) onClose();
  };

  // Prevent menu going offscreen
  const menuWidth = 500;
  const menuHeight = 400;
  let finalX = x;
  let finalY = y;
  if (typeof window !== "undefined") {
    if (finalX + menuWidth > window.innerWidth) finalX = window.innerWidth - menuWidth - 20;
    if (finalY + menuHeight > window.innerHeight) finalY = window.innerHeight - menuHeight - 20;
  }

  return (
    <div className="fixed z-[9999] flex flex-col overflow-hidden rounded-xl border border-[#e7eaf0] bg-white shadow-2xl dark:border-slate-700 dark:bg-[#101c29]"
         style={{ left: finalX, top: finalY, width: menuWidth, height: menuHeight }}
         onMouseDown={e => e.stopPropagation()}
         onContextMenu={e => e.preventDefault()}
    >
      {/* Search */}
      <div className="flex shrink-0 items-center border-b border-[#e7eaf0] px-3 py-2.5 dark:border-slate-800">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mr-2 text-slate-400">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input 
          autoFocus
          className="flex-1 bg-transparent text-sm text-[#030303] placeholder-slate-400 outline-none dark:text-slate-100" 
          placeholder={t.menuSearch}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-1 min-h-0 bg-[#f8f9fa] dark:bg-[#0c1622]">
        {/* Left Categories */}
        <div className="w-40 shrink-0 overflow-y-auto py-2">
          {ALL_CATEGORIES.map(c => {
            const catMap: Record<string, string> = { "New nodes": t.menuCategoryNew, "Recently used": t.menuCategoryRecent, "Video": t.menuCategoryVideo, "Image": t.menuCategoryImage, "Audio": t.menuCategoryAudio, "Text": t.menuCategoryText, "Storyboard": t.menuCategoryStoryboard };
            return (
              <button key={c} onClick={() => { setActiveCat(c); setSearch(""); }}
                className={`flex w-full items-center px-4 py-2 text-xs font-semibold ${
                  activeCat === c ? "relative text-[#030303] dark:text-cyan-300" : "text-[#676f7b] hover:text-[#030303] dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {activeCat === c && <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-[#030303] dark:bg-cyan-400"/>}
                {catMap[c] || c}
              </button>
            )
          })}
        </div>

        {/* Right Content */}
        <div className="flex-1 overflow-y-auto bg-white p-3 dark:bg-[#101c29]">
          {filtered.length === 0 && <p className="mt-10 text-center text-xs text-slate-400">{t.menuNoResults}</p>}
          <div className="space-y-2">
            {filtered.map(tool => (
              <button key={tool.id} onClick={() => handleToolClick(tool)} className="flex w-full items-center gap-3 rounded-xl border border-[#e7eaf0] p-2.5 text-left transition hover:border-[#c9ccd1] hover:shadow-sm dark:border-slate-700 dark:hover:border-slate-500">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg ${tool.iconBg} ${tool.iconColor}`}>
                  {getIcon(tool.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-bold text-[#030303] dark:text-slate-100">{tool.title}</p>
                  <p className="truncate text-[10px] text-[#676f7b] dark:text-slate-500">{tool.desc}</p>
                </div>
                <svg width="8" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c9ccd1] dark:text-slate-600">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-[#e7eaf0] bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#101c29]">
        <span className="text-xs text-[#676f7b] dark:text-slate-400">{t.menuKeepOpen}</span>
        <button onClick={() => setKeepOpen(!keepOpen)} className={`relative h-5 w-9 rounded-full transition-colors ${keepOpen ? "bg-[#030303] dark:bg-cyan-500" : "bg-[#c9ccd1] dark:bg-slate-600"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${keepOpen ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={handleFileUpload} />
    </div>
  );
}