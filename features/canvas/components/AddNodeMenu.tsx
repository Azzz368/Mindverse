import { useState, useRef, useMemo } from "react";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { archiveImageFile } from "@/features/canvas/services/mediaArchiveClient";
import { useLang } from "@/components/providers/LangProvider";
import { imagePromptPresets } from "@/shared/workflow/imagePromptPresets";
import { videoModelPatch } from "@/shared/workflow/videoModelPresets";
import type { CanvasNodeData, NodeType } from "@/shared/canvas";
import type { Strings } from "@/shared/i18n/strings";

export function getIcon(type: string) {
  const map: Record<string, string> = { prompt: "\u2726", text: "T", image: "\u25C8", video: "\u25B6", videoEdit: "\u2702", audio: "\u266B", storyboard: "\u25A6", reference: "\u2141", output: "\u2197", upload_image: "+" };
  return map[type] || "T";
}

// 视频 1.png, 图像 2.png, 音频 3.png, 文本 4.png, 分镜系列 5.png, 参考图类 normal.png
const ALL_CATEGORIES = ["New nodes", "Recently used", "Video", "Image", "Audio", "Text", "Storyboard"];

const getTools = (t: Strings) => [
  { id: "seedance-2.0", type: "video", cat: "Video", title: "Seedance 2.0", desc: t.toolDescSeedance, iconSrc: "/icons/1.png", data: { title: "Seedance 2.0", ...videoModelPatch("seedance-2.0") } },
  { id: "gen-4.5", type: "video", cat: "Video", title: "Gen-4.5", desc: t.toolDescGen45, iconSrc: "/icons/1.png", data: { title: "Gen-4.5", ...videoModelPatch("gen-4.5") } },
  { id: "kling-v3-omni", type: "video", cat: "Video", title: "Kling v3 Omni", desc: "TokenStar multi-reference image/element/video generation", iconSrc: "/icons/1.png", data: { title: "Kling v3 Omni", ...videoModelPatch("kling-v3-omni-tokenstar") } },
  { id: "video-edit", type: "videoEdit", cat: "Video", title: "Video Edit", desc: "FFmpeg trim, concat, mute and transcode", iconSrc: "/icons/1.png", data: { title: "Video Edit", editPlan: "", preserveAudio: true, transition: "none", resolution: "720p", fps: "30", aspectRatio: "16:9" } },
  { id: "gpt-image-2", type: "image", cat: "Image", title: "GPT Image 2", desc: t.toolDescGptImage, iconSrc: "/icons/2.png" },
  { id: "gpt-image-2-tokenstar", type: "image", cat: "Image", title: "GPT Image 2 (TokenStar)", desc: "TokenStar GPT Image 2 text/image generation", iconSrc: "/icons/2.png", data: { title: "GPT Image 2 (TokenStar)", model: "gpt-image-2(tokenstar)", size: "2048x2048" } },
  ...Object.entries(imagePromptPresets).map(([id, preset]) => ({
    id: `gpt-image-2-tokenstar-${id}`,
    type: "image",
    cat: "Image",
    title: preset.label,
    desc: `TokenStar GPT Image 2 · ${preset.desc}`,
    iconSrc: "/icons/2.png",
    data: { title: preset.label, model: "gpt-image-2(tokenstar)", imagePromptPreset: id, size: preset.size, prompt: "" },
  })),
  { id: "nano-banana-tokenstar", type: "image", cat: "Image", title: "Nano Banana (TokenStar)", desc: "TokenStar Nano Banana image generation/editing", iconSrc: "/icons/2.png", data: { title: "Nano Banana (TokenStar)", model: "nano banana(tokenstar)", size: "1024x1024" } },
  { id: "gemini-3.1-flash-image-preview", type: "image", cat: "Image", title: "gemini-3.1-flash-image-preview", desc: "Google Nano-Banana-2 image generation/editing via 302.ai", iconSrc: "/icons/2.png", data: { title: "gemini-3.1-flash-image-preview", model: "gemini-3.1-flash-image-preview", size: "1024x1024" } },
  { id: "upload-image", type: "upload_image", cat: "Image", title: t.uploadImage, desc: t.toolDescUploadImage, iconSrc: "/icons/normal.png" },
  { id: "audio-gen", type: "audio", cat: "Audio", title: t.nodeNames["audio"], desc: t.toolDescAudio, iconSrc: "/icons/3.png" },
  { id: "claude", type: "text", cat: "Text", title: "Claude", desc: t.toolDescText, iconSrc: "/icons/4.png" },
  { id: "prompt", type: "prompt", cat: "Text", title: t.nodeNames["prompt"], desc: t.toolDescPrompt, iconSrc: "/icons/4.png" },
  { id: "script", type: "script", cat: "Storyboard", title: t.nodeNames["script"], desc: t.toolDescScript, iconSrc: "/icons/5.png" },
  { id: "storyboard", type: "storyboard", cat: "Storyboard", title: t.nodeNames["storyboard"], desc: t.toolDescStoryboard, iconSrc: "/icons/5.png" },
  { id: "reference", type: "reference", cat: "Image", title: t.nodeNames["reference"], desc: t.toolDescReference, iconSrc: "/icons/normal.png" },
  { id: "output", type: "output", cat: "Text", title: t.nodeNames["output"], desc: t.toolDescOutput, iconSrc: "/icons/4.png" },
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
    setGhostType(tool.type as NodeType, "data" in tool ? tool.data as Partial<CanvasNodeData> : undefined);
    if (!keepOpen) onClose();
  };

  const archiveLocalImage = (file: File) => archiveImageFile(file);

  const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => /^image\//.test(f.type));
    files.forEach((file, i) => {
      void (async () => {
        let url: string;
        try {
          url = await archiveLocalImage(file);
        } catch (error) {
          console.error("Local image archive failed, falling back to data URL", error);
          url = await readAsDataUrl(file);
        }
        if (i === 0) setGhostMedia(url);
        else setGhostMedia(url);
      })();
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
                <div className="shrink-0 overflow-hidden rounded-lg">
                  <img src={tool.iconSrc} alt="" className="h-10 w-10 object-cover" />
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
