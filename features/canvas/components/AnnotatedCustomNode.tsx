"use client";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { ImageAnnotationEditor } from "./ImageAnnotationEditor";
import { ImeInput, ImeTextarea } from "./ImeTextFields";
import { VoiceCloneNodeLayout, VoiceTTSNodeLayout } from "./VoiceNodes";
import { HKGAITTSNodeLayout, MusicGenerationNodeLayout } from "./HKGAIAudioNodes";
import { VideoEditComposer, type VideoEditSource } from "./VideoEditComposer";
import { VideoFrameNode } from "./VideoFrameNode";
import { VideoRegenerationNode } from "./VideoRegenerationNode";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { useLang } from "@/components/providers/LangProvider";
import { DIGITAL_HUMAN_VIDEO_PROMPT, videoAspectRatioControlForPreset, videoAspectRatioForPreset, videoAspectRatiosForPreset, videoDurationOptionsForPreset, videoInputPortsForPreset, videoModelOptions, videoModelPatch, videoModelPresetIdFromData, videoModelSelectionPatch, videoPromptMaxLengthForPreset, videoReferenceLimitForPreset, type VideoInputPortKind, type VideoModelPresetId } from "@/shared/workflow/videoModelPresets";
import { DEFAULT_STORYBOARD_SCENE_COUNT, clampStoryboardSceneCount } from "@/shared/workflow/storyPipeline";
import { audioUrlFrom, imageUrlFrom, videoUrlFrom } from "@/features/canvas/domain/nodeInputCompiler";
import type { CanvasNode, CanvasNodeData, ImageAnnotation } from "@/shared/canvas";
import type { Strings } from "@/shared/i18n/strings";

const GLOW_COLORS: Record<string, string> = {
  video: "#7322e3",
  videoRegeneration: "#7322e3",
  videoEdit: "#7322e3",
  motion: "#2563eb",
  image: "#3bf657",
  audio: "#f5510b",
  musicGeneration: "#f5510b",
  hkgaiTTS: "#f5510b",
  voiceClone: "#14b8a6",
  voiceTTS: "#f5510b",
  text: "#ebe46b",
  prompt: "#ebe46b",
  script: "#3eedb8",
  storyboard: "#3eedb8",
  storyboardImage: "#3eedb8",
  reference: "#64748b",
  output: "#64748b",
};
const RUNNABLE_TYPES = new Set(["prompt", "text", "script", "image", "video", "videoRegeneration", "videoEdit", "motion", "audio", "musicGeneration", "hkgaiTTS", "voiceClone", "voiceTTS", "storyboard", "output"]);
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const videoPortStyles: Record<VideoInputPortKind, { border: string; connected: string }> = {
  text: { border: "border-[#f59e0b]", connected: "bg-[#f59e0b]" },
  image: { border: "border-[#84cc16]", connected: "bg-[#84cc16]" },
  video: { border: "border-[#7322e3]", connected: "bg-[#7322e3]" },
  audio: { border: "border-[#f5510b]", connected: "bg-[#f5510b]" },
};
const videoDurationOptions = Array.from({ length: 11 }, (_, index) => index + 5);
const nodeImageUrl = (node: CanvasNode) => {
  return imageUrlFrom(node);
};
const materialLabel = (node: CanvasNode) => node.data.title || (({ reference: "Reference", image: "Image", videoFrame: "Video Frame", video: "Video", videoEdit: "Video", motion: "Video", audio: "Audio", musicGeneration: "Audio", hkgaiTTS: "Audio", voiceTTS: "Audio" } as Partial<Record<CanvasNodeData["nodeType"], string>>)[node.data.nodeType] || "Material");
type VideoMaterialKind = "image" | "video" | "audio";
type VideoMaterialOption = { node: CanvasNode; kind: VideoMaterialKind; url: string; label: string };
type ContextIRApiResponse = {
  ok?: boolean;
  output?: { taskId?: string; status?: string; enhancedPrompt?: string; truncated?: boolean; errorMessage?: string };
  polling?: { intervalMs?: number };
  error?: { message?: string };
};

const videoMaterialKind = (node: CanvasNode): VideoMaterialKind | undefined => {
  if (node.data.nodeType === "image" || node.data.nodeType === "reference" || node.data.nodeType === "videoFrame") return "image";
  if (node.data.nodeType === "video" || node.data.nodeType === "videoRegeneration" || node.data.nodeType === "videoEdit" || node.data.nodeType === "motion") return "video";
  if (node.data.nodeType === "audio" || node.data.nodeType === "musicGeneration" || node.data.nodeType === "hkgaiTTS" || node.data.nodeType === "voiceTTS") return "audio";
  return undefined;
};
const videoMaterialUrl = (node: CanvasNode, kind: VideoMaterialKind) => kind === "image" ? nodeImageUrl(node) : kind === "video" ? videoUrlFrom(node) : audioUrlFrom(node);
const imageModelValue = (model?: string) => {
  const value = (model || "").trim().toLowerCase();
  if (!value || value === "gpt image 2" || value === "gpt-image-2") return "gpt-image-2(tokenstar)";
  if (value === "nano banana 2" || value === "nano banana pro" || value === "gemini-3.1-flash-image-preview") return "nano banana(tokenstar)";
  return model || "gpt-image-2(tokenstar)";
};
const imageAspectRatioValue = (aspectRatio?: string, size?: string) => {
  if (aspectRatio) return aspectRatio;
  const [w, h] = (size || "").replace(/[×脳]/g, "x").split("x").map((item) => Number(item));
  if (w && h) {
    if (w === h) return "1:1";
    if (w > h) return w / h > 1.9 ? "21:9" : w / h > 1.45 ? "16:9" : "3:2";
    return "9:16";
  }
  return "1:1";
};
const imageResolutionValue = (resolution?: string, size?: string) => {
  if (resolution) return resolution;
  const normalized = (size || "").toLowerCase();
  if (normalized.includes("4k")) return "4K";
  if (normalized.includes("2k") || normalized.includes("2048")) return "2K";
  return "1K";
};

function NodeSettingsPanel({ data, nodeId, onClose }: { data: CanvasNodeData; nodeId: string; onClose(): void }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLang();
  const set = (patch: Partial<CanvasNodeData>) => updateNodeData(nodeId, patch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sel = "w-full rounded-lg border border-[#e7eaf0] bg-white px-2.5 py-1.5 text-xs text-[#030303] focus:outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
  const lbl = "mb-1 block text-[10px] text-[#676f7b] dark:text-slate-400";
  const wrap = "mb-3 block";
  const ta = "w-full resize-none rounded-lg border border-[#e7eaf0] bg-white px-2.5 py-1.5 text-xs text-[#030303] focus:outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
  const inp = "w-full rounded-lg border border-[#e7eaf0] bg-white px-2.5 py-1.5 text-xs text-[#030303] focus:outline-none dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
  const activeVideoModel = videoModelPresetIdFromData(data);
  const activeVideoPatch = videoModelPatch(activeVideoModel);
  const provider = activeVideoPatch.videoProvider;
  const videoAspectRatios = videoAspectRatiosForPreset(activeVideoModel);
  const videoAspectRatio = videoAspectRatioForPreset(activeVideoModel, data.aspectRatio);
  const sourceControlsVideoRatio = videoAspectRatioControlForPreset(activeVideoModel) === "source";
  const isHKGAIMinimax = activeVideoModel === "minimax-h3-hkgai";
  const isHKGAIRef2va = activeVideoModel === "minimax-ref2va-hkgai";
  const activeVideoDurationOptions = videoDurationOptionsForPreset(activeVideoModel) || videoDurationOptions;
  const videoPromptMaxLength = videoPromptMaxLengthForPreset(activeVideoModel);
  const textInput = (key: keyof CanvasNodeData, value: string | undefined) => (
    <ImeInput className={inp} value={value ?? ""} onValueChange={(next) => set({ [key]: next } as Partial<CanvasNodeData>)} />
  );
  const textArea = (key: keyof CanvasNodeData, value: string | undefined, rows: number, maxLength?: number) => (
    <ImeTextarea className={ta} rows={rows} maxLength={maxLength} value={value ?? ""} onValueChange={(next) => set({ [key]: next } as Partial<CanvasNodeData>)} />
  );
  return (
    <div className="nodrag nowheel absolute inset-0 z-20 flex flex-col rounded-xl bg-white dark:bg-[#101c29]"
      onWheel={e => { e.stopPropagation(); scrollRef.current?.scrollBy({ top: e.deltaY }); }}>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
        <button onClick={onClose} className="text-[#676f7b] hover:text-[#030303] dark:text-slate-400 dark:hover:text-slate-100 text-sm leading-none">←</button>
        <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title} · {t.settingsTitle}</p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {data.nodeType !== "motion" && <label className={wrap}><span className={lbl}>标题</span>{textInput("title", data.title)}</label>}
        {data.nodeType === "prompt" && <><label className={wrap}><span className={lbl}>提示词</span>{textArea("prompt", data.prompt, 3)}</label><label className={wrap}><span className={lbl}>排除</span>{textArea("negativePrompt", data.negativePrompt, 2)}</label><label className={wrap}><span className={lbl}>风格</span>{textInput("style", data.style)}</label><label className={wrap}><span className={lbl}>宽高比</span><select className={sel} value={data.aspectRatio ?? "16:9"} onChange={e => set({ aspectRatio: e.target.value })}>{["1:1","16:9","9:16","4:5"].map(o=><option key={o}>{o}</option>)}</select></label></>}
        {data.nodeType === "text" && <><label className={wrap}><span className={lbl}>指令</span>{textArea("instruction", data.instruction, 3)}</label><label className={wrap}><span className={lbl}>起始文本</span>{textArea("inputText", data.inputText, 2)}</label><label className={wrap}><span className={lbl}>模型覆盖</span>{textInput("model", data.model)}</label><label className={wrap}><span className={lbl}>温度</span><input className={inp} type="number" step="0.1" min="0" max="2" value={data.temperature ?? 0.7} onChange={e => set({ temperature: Number(e.target.value) })} /></label></>}
        {data.nodeType === "script" && <><label className={wrap}><span className={lbl}>创意概要</span>{textArea("storyBrief", data.storyBrief, 4)}</label><label className={wrap}><span className={lbl}>语调</span>{textInput("scriptTone", data.scriptTone)}</label><label className={wrap}><span className={lbl}>目标场景数</span><select className={sel} value={String(clampStoryboardSceneCount(data.numberOfScenes))} onChange={e => set({ numberOfScenes: clampStoryboardSceneCount(e.target.value) })}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label></>}
        {data.nodeType === "image" && <><label className={wrap}><span className={lbl}>图像提示词</span>{textArea("prompt", data.prompt, 3)}</label><label className={wrap}><span className={lbl}>模型覆盖</span>{textInput("model", data.model)}</label><label className={wrap}><span className={lbl}>尺寸</span><select className={sel} value={data.size ?? "1024x1024"} onChange={e => set({ size: e.target.value })}>{["1024x1024","1536x1024","1024x1536","auto"].map(o=><option key={o}>{o}</option>)}</select></label></>}
        {data.nodeType === "video" && <>
          <label className={wrap}><span className={lbl}>模型</span><select className={sel} value={activeVideoModel} onChange={e => { const presetId = e.target.value as VideoModelPresetId; set({ ...videoModelSelectionPatch(presetId, data.aspectRatio), ...(presetId === "minimax-ref2va-hkgai" ? { referenceImageUrl: undefined, videoReferenceNodeIds: [], videoReferenceSelectionActive: false } : {}) }); }}>{videoModelOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className={wrap}><span className={lbl}>动效提示词</span>{textArea("prompt", data.prompt, 3, videoPromptMaxLength)}</label>
          {sourceControlsVideoRatio && !isHKGAIRef2va && <label className={wrap}><span className={lbl}>首帧 URL（可选）</span>{textInput("referenceImageUrl", data.referenceImageUrl)}</label>}
          {provider === "tokenstar" && (activeVideoModel === "kling-v3-tokenstar" || activeVideoModel === "kling-v3-omni-tokenstar") && <label className={wrap}><span className={lbl}>主体元素 ID（逗号分隔）</span>{textInput("klingElementId", data.klingElementId)}</label>}
          {provider === "tokenstar" && activeVideoPatch.generateAudio !== undefined && <div className="mb-3 flex items-center justify-between"><span className={lbl} style={{marginBottom:0}}>生成音频</span><button onClick={() => set({ generateAudio: data.generateAudio === false })} className={`relative h-5 w-9 rounded-full transition-colors ${data.generateAudio !== false ? "bg-[#030303] dark:bg-cyan-500" : "bg-[#c9ccd1] dark:bg-slate-600"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${data.generateAudio !== false ? "translate-x-[18px]" : "translate-x-0.5"}`} /></button></div>}
          {!isHKGAIMinimax && !isHKGAIRef2va && <label className={wrap}><span className={lbl}>分辨率</span><select className={sel} value={data.resolution ?? ""} onChange={e => set({ resolution: e.target.value || undefined })}><option value="">服务器默认</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>}
          <label className={wrap}><span className={lbl}>时长</span><select className={sel} value={String(data.duration ?? activeVideoPatch.duration ?? "")} onChange={e => set({ duration: e.target.value ? Number(e.target.value) : undefined })}>{activeVideoDurationOptions.map(n=><option key={n} value={n}>{n}s</option>)}</select></label>
          {!isHKGAIRef2va && <label className={wrap}><span className={lbl}>画面比例</span><select className={sel} value={videoAspectRatio} onChange={e => set({ aspectRatio: e.target.value })}>{videoAspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</select></label>}
          {isHKGAIRef2va && <label className={wrap}><span className={lbl}>Audio flow shift</span><input className={inp} type="number" step="0.1" value={data.audioFlowShift ?? 3} onChange={e => set({ audioFlowShift: Number(e.target.value) })} /></label>}
          {isHKGAIMinimax && <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-[10px] leading-4 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">HKGAI OpenAI 视频接口：提示词最多 7,000 字符，最多连接 2 张参考图；支持 5–15 秒和 16:9、9:16、1:1，分辨率由所选比例自动映射。</p>}
          {isHKGAIRef2va && <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-[10px] leading-4 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">图片模式必须连接 1 张图片 + 1 段音频；视频模式连接 1–3 段自带音轨的视频（总时长 ≤15 秒）。图片和视频不能混用，视频模式不能另接音频。</p>}
          {sourceControlsVideoRatio && <p className="mb-3 text-[10px] leading-4 text-amber-700 dark:text-amber-300">{isHKGAIRef2va ? "输出比例由所选图片或参考视频决定。" : "该模型由首帧素材决定输出比例。运行前会校验首帧必须与所选比例一致。"}</p>}
        </>}
        {data.nodeType === "videoEdit" && <>
          <label className={wrap}><span className={lbl}>Agent 剪辑计划 JSON（高级）</span>{textArea("editPlan", data.editPlan, 5)}</label>
          <label className={wrap}><span className={lbl}>自然语言剪辑说明</span>{textArea("prompt", data.prompt, 2)}</label>
          <label className={wrap}><span className={lbl}>保留原声</span><select className={sel} value={data.preserveAudio === false ? "false" : "true"} onChange={e => set({ preserveAudio: e.target.value === "true" })}><option value="true">保留</option><option value="false">静音</option></select></label>
          <label className={wrap}><span className={lbl}>原声音量</span>{textInput("originalVolume", String(data.originalVolume ?? 1))}</label>
          <label className={wrap}><span className={lbl}>背景音乐音量</span>{textInput("backgroundVolume", String(data.backgroundVolume ?? 0.2))}</label>
          <label className={wrap}><span className={lbl}>分辨率</span><select className={sel} value={data.resolution ?? "720p"} onChange={e => set({ resolution: e.target.value })}>{["480p","720p","1080p"].map(o=><option key={o}>{o}</option>)}</select></label>
          <label className={wrap}><span className={lbl}>帧率</span>{textInput("fps", data.fps ?? "30")}</label>
          <label className={wrap}><span className={lbl}>画面比例</span><select className={sel} value={data.aspectRatio ?? "16:9"} onChange={e => set({ aspectRatio: e.target.value })}><option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏</option><option value="1:1">1:1 方形</option></select></label>
        </>}
        {data.nodeType === "motion" && <>
          <label className={wrap}>
            <span className={lbl}>Prompt</span>
            <ImeTextarea
              className={`${ta} min-h-36`}
              rows={7}
              value={data.prompt ?? ""}
              placeholder="用自然语言描述你想要的成片，例如：将已连接的视频剪成一支 15 秒竖屏广告，节奏明快，添加简洁字幕、柔和转场和结尾品牌定格。"
              onValueChange={(prompt) => set({ prompt, motionMode: "codex-hyperframes", codexInstruction: "", templateId: "", motionVariablesJson: "" })}
            />
          </label>
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
            Codex 会使用已连接素材构建 HyperFrames 工程，并通过成片截图自动审片。再次修改 Prompt 后运行，会在上一次工程上继续调整。
          </p>
        </>}
        {data.nodeType === "audio" && <><label className={wrap}><span className={lbl}>音频提示词</span>{textArea("prompt", data.prompt, 3)}</label><label className={wrap}><span className={lbl}>模型覆盖</span>{textInput("model", data.model)}</label><label className={wrap}><span className={lbl}>音色</span>{textInput("voice", data.voice)}</label><label className={wrap}><span className={lbl}>情绪</span>{textInput("emotion", data.emotion)}</label><label className={wrap}><span className={lbl}>时长（秒）</span><select className={sel} value={String(data.duration ?? "")} onChange={e => set({ duration: e.target.value ? Number(e.target.value) : undefined })}><option value="">默认</option>{[5,10,15,20,30,60].map(n=><option key={n} value={n}>{n}s</option>)}</select></label></>}
        {data.nodeType === "storyboard" && <><label className={wrap}><span className={lbl}>故事概要</span>{textArea("storyBrief", data.storyBrief, 4)}</label><label className={wrap}><span className={lbl}>目标镜头数</span><select className={sel} value={String(clampStoryboardSceneCount(data.targetShotCount ?? data.numberOfScenes))} onChange={e => set({ targetShotCount: clampStoryboardSceneCount(e.target.value) })}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label></>}
        {data.nodeType === "storyboardImage" && <><label className={wrap}><span className={lbl}>宽高比</span><select className={sel} value={data.aspectRatio ?? "16:9"} onChange={e => set({ aspectRatio: e.target.value })}>{["16:9","9:16","1:1"].map(o=><option key={o}>{o}</option>)}</select></label><label className={wrap}><span className={lbl}>排除</span>{textArea("negativePrompt", data.negativePrompt, 2)}</label></>}
        {data.nodeType === "reference" && <label className={wrap}><span className={lbl}>备注</span>{textArea("notes", data.notes, 4)}</label>}
        {data.nodeType === "output" && <label className={wrap}><span className={lbl}>交付格式</span><select className={sel} value={data.format ?? "Creative package"} onChange={e => set({ format: e.target.value })}>{["Creative package","Storyboard package","Campaign brief","Production sheet","JSON"].map(o=><option key={o}>{o}</option>)}</select></label>}
      </div>
      <div className="shrink-0 border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
        <button onClick={onClose} className="w-full rounded-lg bg-[#030303] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a1a1a] dark:bg-cyan-600 dark:hover:bg-cyan-500">Done</button>
      </div>
    </div>
  );
}

function NodePreview({ node, t, onView, onViewVideo, onAnnotate }: { node: CanvasNode; t: Strings; onView(url: string): void; onViewVideo(url: string): void; onAnnotate(url: string): void }) {
  const value = node.data.output?.value, details = record(value), raw = record(details.raw), rawContent = record(raw.content);
  const imageUrl = text(details.imageUrl) || (typeof value === "string" ? value : "");
  const audioUrl = text(details.audioUrl) || text(details.url) || text(details.resultUrl), videoUrl = text(details.videoUrl) || text(details.resultUrl) || text(details.finalVideoUrl) || text(rawContent.video_url), generatedText = text(details.generatedText);
  if (node.data.nodeType === "image" && imageUrl) return (
    <div className="mt-2">
      <button onClick={() => onView(imageUrl)} className="block w-full overflow-hidden rounded-md border border-[#e7eaf0] hover:border-[#030303] dark:border-slate-700 dark:hover:border-cyan-300">
        <img src={imageUrl} alt="Generated result" className="h-36 w-full bg-[#f0f1f3] object-contain dark:bg-slate-800"/>
      </button>
      <div className="mt-2 flex gap-2">
        <button onClick={() => onView(imageUrl)} className="text-[10px] text-[#404040] hover:text-[#030303] dark:text-cyan-300 dark:hover:text-cyan-100">{t.viewFullImage}</button>
        <button onClick={() => onAnnotate(imageUrl)} className="text-[10px] text-violet-600 hover:text-violet-800 dark:text-violet-200 dark:hover:text-violet-100">{t.annotateRefine}</button>
      </div>
    </div>
  );
  if ((node.data.nodeType === "audio" || node.data.nodeType === "musicGeneration" || node.data.nodeType === "hkgaiTTS" || node.data.nodeType === "voiceTTS") && audioUrl) return <audio className="mt-2 w-full" controls src={audioUrl}/>;
  if ((node.data.nodeType === "video" || node.data.nodeType === "videoEdit" || node.data.nodeType === "motion") && videoUrl) {
    const composition = record(details.composition || details.motionComposition);
    const canvas = record(composition.canvas);
    const rawWidth = Number(details.width || canvas.width);
    const rawHeight = Number(details.height || canvas.height);
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 16;
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 9;
    const previewWidth = Math.max(120, Math.round(320 * width / height));
    return (
      <div
        className="group relative mx-auto mt-2 max-w-full overflow-hidden rounded-md bg-black"
        style={{ width: `min(100%, ${previewWidth}px)`, aspectRatio: `${width} / ${height}` }}
      >
        <video className="absolute inset-0 h-full w-full object-contain" controls playsInline preload="metadata" src={videoUrl}/>
        <ExpandIcon onClick={() => onViewVideo(videoUrl)} className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    );
  }
  if (node.data.nodeType === "motion") {
    const composition = record(details.composition || details.motionComposition);
    const canvas = record(composition.canvas);
    const elements = Array.isArray(composition.elements) ? composition.elements.length : 0;
    const assets = Array.isArray(composition.assets) ? composition.assets.length : 0;
    const phase = text(details.phase);
    const message = text(details.message);
    const progress = Number(details.progress);
    return (
      <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-2 dark:border-blue-400/20 dark:bg-blue-400/10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-200">HyperFrames DSL</p>
        <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a] dark:text-slate-200">{text(composition.title) || node.data.title}</p>
        <p className="mt-1 text-[10px] text-[#676f7b] dark:text-slate-400">{String(canvas.width || 1280)}x{String(canvas.height || 720)} · {String(canvas.fps || 30)}fps · {String(canvas.duration || 10)}s</p>
        <p className="mt-1 text-[10px] text-[#676f7b] dark:text-slate-400">{elements} elements · {assets} assets · {phase || "render pending"}</p>
        {message && <p className="mt-1 text-[10px] leading-4 text-blue-700 dark:text-blue-200">{message}{Number.isFinite(progress) ? ` (${Math.round(progress)}%)` : ""}</p>}
      </div>
    );
  }
  if (node.data.nodeType === "script" && Array.isArray(details.scenes)) return (
    <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
      <p className="text-[11px] font-semibold text-[#030303] dark:text-cyan-200">{text(details.title) || node.data.output?.summary}</p>
      {text(details.logline) && <p className="text-[10px] leading-4 text-[#676f7b] dark:text-slate-400">{text(details.logline)}</p>}
      {details.scenes.map((scene, index) => {
        const item = record(scene);
        const dialogue = Array.isArray(item.dialogue) ? item.dialogue.filter((line): line is string => typeof line === "string").slice(0, 2) : [];
        return (
          <div key={`${String(item.sceneNumber)}-${index}`} className="rounded-md border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-slate-950/50">
            <p className="text-[10px] font-semibold text-[#030303] dark:text-cyan-200">Scene {String(item.sceneNumber || index + 1)} · {text(item.location)}</p>
            <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a] dark:text-slate-200">{text(item.action)}</p>
            {dialogue.map((line) => <p key={line} className="mt-1 text-[10px] leading-4 text-[#676f7b] dark:text-slate-400">{line}</p>)}
          </div>
        );
      })}
    </div>
  );
  /* Reference node with a dropped/uploaded image */
  if (node.data.nodeType === "reference" && node.data.imageUrl) return (
    <div className="mt-2">
      <button onClick={() => onView(node.data.imageUrl!)} className="block w-full overflow-hidden rounded-md border border-violet-200 hover:border-violet-400 dark:border-violet-700 dark:hover:border-violet-400">
        <img src={node.data.imageUrl} alt="Reference" className="h-28 w-full bg-[#f0f1f3] object-contain dark:bg-slate-800"/>
      </button>
      <p className="mt-1 text-[9px] text-[#939393] dark:text-slate-500">{node.data.notes || "\u53ef\u8fde\u63a5\u5230\u56fe\u50cf\u6216\u89c6\u9891\u8282\u70b9\u4f5c\u4e3a\u53c2\u8003\u56fe"}</p>
    </div>
  );
  if (node.data.nodeType === "storyboard" && Array.isArray(value)) return (
    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
      {value.map((scene) => { const item = record(scene); return (
        <div key={String(item.sceneNumber)} className="rounded-md border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-slate-950/50">
          <p className="text-[10px] font-semibold text-[#030303] dark:text-cyan-200">{t.scene} {String(item.sceneNumber)}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a] dark:text-slate-200">{text(item.description)}</p>
          <p className="mt-1 text-[10px] text-[#939393] dark:text-slate-500">{text(item.camera)} · {String(item.duration)}s</p>
        </div>
      ); })}
    </div>
  );
  if (node.data.nodeType === "output" && text(details.format)) return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-[#030303] dark:text-cyan-200">{text(details.format)}</p>
      <p className="mt-1 text-[10px] text-[#939393] dark:text-slate-500">{Array.isArray(details.assets) ? t.connectedAssets(details.assets.length) : t.noConnectedAssets}</p>
    </div>
  );
  return <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-[#676f7b] dark:text-slate-400">{generatedText || node.data.output?.summary || node.data.prompt || node.data.instruction || node.data.storyBrief || node.data.notes || t.configureNode}</p>;
}

function ResizeHandle({ onResize }: { onResize(dx: number, dy: number): void }) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);
  return (
    <div className="nodrag absolute -bottom-1 -right-1 z-20 h-6 w-6 cursor-se-resize touch-none"
      onMouseDown={e => {
        e.stopPropagation();
        e.preventDefault();
        startRef.current = { x: e.clientX, y: e.clientY };
        lastRef.current = { x: e.clientX, y: e.clientY };
        activeRef.current = false;
        const onMove = (ev: MouseEvent) => {
          if (!startRef.current || !lastRef.current) return;
          // 3px dead zone measured from the original press point
          const totalDx = ev.clientX - startRef.current.x;
          const totalDy = ev.clientY - startRef.current.y;
          if (!activeRef.current && Math.abs(totalDx) < 3 && Math.abs(totalDy) < 3) return;
          activeRef.current = true;
          // incremental delta from last move (no jump on activation)
          const dx = ev.clientX - lastRef.current.x;
          const dy = ev.clientY - lastRef.current.y;
          lastRef.current = { x: ev.clientX, y: ev.clientY };
          if (dx !== 0 || dy !== 0) onResize(dx, dy);
        };
        const onUp = () => { startRef.current = null; lastRef.current = null; activeRef.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" className="pointer-events-none absolute bottom-1.5 right-1.5 text-[#c9ccd1] dark:text-slate-600">
        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

function PillDropdown({ value, options, onChange }: { value: string | number; options: { value: string | number; label: string }[]; onChange: (v: string | number) => void }) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find(o => String(o.value) === String(value))?.label || String(value);

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`relative flex h-9 items-center justify-center whitespace-nowrap rounded-[18px] bg-[#f0f1f3] px-5 transition-all duration-300 hover:bg-[#e7eaf0] focus:ring-1 focus:ring-[#676f7b] dark:bg-slate-800 dark:hover:bg-slate-700 outline-none text-[13px] font-bold tracking-wide text-[#030303] dark:text-slate-200 ${open ? "opacity-0" : "opacity-100"}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        {activeLabel}
      </button>

      <div
        className={`absolute left-0 top-0 z-[90] w-max min-w-full origin-top flex-col rounded-[18px] bg-[#f0f1f3] shadow-xl transition-all duration-300 dark:bg-slate-800 overflow-hidden ring-1 ring-[#676f7b] ${open ? "scale-y-100 opacity-100 pointer-events-auto" : "scale-y-50 -translate-y-4 opacity-0 pointer-events-none"}`}
      >
        {options.map((opt, i) => (
          <div key={opt.value} className="flex flex-col">
            {i > 0 && <div className="mx-3 h-[1px] bg-[#c9ccd1] dark:bg-slate-600" />}
            <button
              type="button"
              className="flex h-9 w-full items-center justify-center whitespace-nowrap bg-transparent px-5 text-[13px] font-bold tracking-wide text-[#030303] transition-colors hover:bg-[#e7eaf0] dark:text-slate-200 dark:hover:bg-slate-700 outline-none"
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HandleDot({ label, handleId, borderColorClass, bgClass, connectedBgClass, selected, connected }: { label: string; handleId: string; borderColorClass: string; bgClass: string; connectedBgClass: string; selected: boolean; connected: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3" style={{ width: "125px" }}>
      <span className={`whitespace-nowrap font-bold text-[14px] text-[#030303] dark:text-slate-200 transition-opacity duration-300 ${selected ? "opacity-100" : "opacity-0"}`}>
        {label}
      </span>
      <div className={`relative grid place-items-center h-[18px] w-[18px] shrink-0 rounded-full border-[2.5px] ${borderColorClass} ${connected ? connectedBgClass : bgClass}`}>
        <Handle type="target" id={handleId} position={Position.Left} className="!absolute !inset-0 !m-auto !h-[26px] !w-[26px] !border-0 !bg-transparent !transform-none opacity-0" />
      </div>
    </div>
  );
}

function AutoGrowTextarea({ value, onChange, placeholder, minHeight = 80, maxHeight, maxLength, className }: { value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number; maxHeight?: number; maxLength?: number; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    const nextHeight = Math.max(minHeight, el.scrollHeight);
    el.style.height = "auto";
    el.style.height = `${maxHeight ? Math.min(maxHeight, nextHeight) : nextHeight}px`;
    el.style.overflowY = maxHeight && nextHeight > maxHeight ? "auto" : "hidden";
  };
  useEffect(() => {
    resize(ref.current);
  }, [value, minHeight, maxHeight]);
  return (
    <ImeTextarea
      ref={ref}
      value={value}
      onValueChange={onChange}
      onInput={(event) => resize(event.currentTarget)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={1}
      style={{ minHeight, ...(maxHeight ? { maxHeight } : {}) }}
      className={`w-full resize-none border-none bg-transparent text-[14px] font-medium leading-7 tracking-wide text-[#030303] outline-none placeholder:font-normal placeholder:text-[#939393] dark:text-slate-100 dark:placeholder:text-slate-500 ${className || ""}`}
    />
  );
}

function ExpandIcon({ onClick, className }: { onClick(): void; className?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="放大预览"
      className={`nodrag ${className || "absolute right-2 top-2"} grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
      </svg>
    </button>
  );
}

function ImagePlaceholderIcon() {
  return (
    <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[24px] border-[6px] border-[#e7eaf0] bg-[#f0f1f3] dark:border-slate-600 dark:bg-slate-700">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#a8abae] dark:text-slate-400">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );
}

function AudioMaterialIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}


function TextNodeLayout({ id, data, selected, isGenerating, runNode }: any) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useCanvasStore((s) => s.edges);
  const connectedHandles = new Set(edges.filter((e) => e.target === id).map((e) => e.targetHandle || ""));
  const isScript = data.nodeType === "script";
  const scriptOutput = record(data.output?.value);
  const scriptScenes = Array.isArray(scriptOutput.scenes) ? scriptOutput.scenes.map(record) : [];
  const generatedText = isScript
    ? [text(scriptOutput.title), text(scriptOutput.logline), ...scriptScenes.map((scene, index) => [`Scene ${scene.sceneNumber || index + 1}`, text(scene.action), ...(Array.isArray(scene.dialogue) ? scene.dialogue.map(text) : [])].filter(Boolean).join("\n"))].filter(Boolean).join("\n\n")
    : text(scriptOutput.generatedText);
  const textContent = data.textContent ?? (data.inputText || generatedText || data.storyBrief || "");
  const previousGeneratedText = useRef(generatedText);
  const visualGroupColor = data.workflowId ? undefined : data.groupColor;

  useEffect(() => {
    if (generatedText && generatedText !== previousGeneratedText.current) updateNodeData(id, { textContent: generatedText });
    previousGeneratedText.current = generatedText;
  }, [generatedText, id, updateNodeData]);

  return (
    <>
      <div className={`relative flex h-[280px] w-[380px] flex-col rounded-[24px] border-[1.4px] bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"} ${visualGroupColor && !selected ? "!border-transparent" : ""}`}>
        {visualGroupColor && !selected && (
          <div className="absolute inset-[-1.4px] -z-10 rounded-[26px] border-[1.4px]" style={{ borderColor: visualGroupColor }} />
        )}
        {isGenerating && (
          <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": GLOW_COLORS.text || "#ebe46b" } as React.CSSProperties} />
        )}

        <div className="absolute -top-8 left-1 text-[20px] font-bold tracking-tight text-[#030303] dark:text-slate-100">{isScript ? "Script" : "Text"}</div>

        <div className="absolute -left-[145px] top-[95px] flex flex-col gap-[36px]">
          <HandleDot label="Input" handleId="input-1" borderColorClass="border-[#f59e0b]" bgClass="bg-white dark:bg-[#101c29]" connectedBgClass="bg-[#f59e0b]" selected={!!selected} connected={connectedHandles.has("input-1")} />
          <HandleDot label="Input" handleId="input-2" borderColorClass="border-[#f59e0b]" bgClass="bg-white dark:bg-[#101c29]" connectedBgClass="bg-[#f59e0b]" selected={!!selected} connected={connectedHandles.has("input-2")} />
          <HandleDot label="Input" handleId="input-3" borderColorClass="border-[#f59e0b]" bgClass="bg-white dark:bg-[#101c29]" connectedBgClass="bg-[#f59e0b]" selected={!!selected} connected={connectedHandles.has("input-3")} />
        </div>

        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />

        <div className="flex-1 p-6">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[20px] bg-[#f0f1f3] dark:bg-slate-800 border-[6px] border-transparent">
            {isGenerating ? (
              <div className="absolute inset-0 m-auto h-12 w-12 animate-pulse rounded-2xl bg-[#c9ccd1] dark:bg-slate-600" />
            ) : (
              <ImeTextarea
                value={textContent}
                onValueChange={(value) => updateNodeData(id, { textContent: value })}
                placeholder="在这里直接写作，或使用下方 Agent Prompt 生成内容…"
                className="h-full w-full resize-none overflow-y-auto rounded-[14px] border-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_33px,rgba(148,163,184,0.18)_34px,transparent_35px)] px-5 py-3 text-[13px] leading-[35px] text-[#1a1a1a] outline-none placeholder:text-[#a8abae] dark:bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_33px,rgba(148,163,184,0.22)_34px,transparent_35px)] dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            )}
          </div>
        </div>
      </div>

      <div className={`absolute left-1/2 top-[calc(100%+8px)] z-50 w-[520px] -translate-x-1/2 overflow-visible rounded-[28px] border-[1.5px] border-[#3f3f46] bg-white shadow-2xl transition-all duration-300 dark:border-cyan-400 dark:bg-[#101c29] ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <div className="p-6 pb-4">
          <AutoGrowTextarea
            value={isScript ? data.storyBrief ?? "" : data.instruction ?? ""}
            onChange={(v) => updateNodeData(id, isScript ? { storyBrief: v } : { instruction: v })}
            placeholder={isScript ? "输入故事概要，让 Agent 编写或重写剧本…" : "输入给 Agent 的修改、扩写或重写指令…"}
            minHeight={80}
          />
        </div>
        <div className="flex items-center justify-between px-6 pb-6">
          <div className="flex gap-2">
            <PillDropdown
              value={data.model || "Claude sonnet 4.6"}
              options={["Claude sonnet 4.6", "Gemini 3.1 Pro", "Deepseek v4", "Qwen3.7-plus", "GPT 5.5", "GLM 5.2"].map((o) => ({ value: o, label: o }))}
              onChange={(v) => updateNodeData(id, { model: String(v) })}
            />
            <PillDropdown
              value={isScript ? clampStoryboardSceneCount(data.numberOfScenes) : data.wordCount || 200}
              options={(isScript ? [1, 2, 3] : [100, 200, 500, 1000]).map((n) => ({ value: n, label: isScript ? `${n} scene` : `${n} words` }))}
              onChange={(v) => updateNodeData(id, isScript ? { numberOfScenes: clampStoryboardSceneCount(v) } : { wordCount: Number(v) })}
            />
            <button type="button" title="语音输入（即将支持）" className="nodrag grid h-9 w-9 place-items-center rounded-full bg-[#f0f1f3] text-[#404040] dark:bg-slate-800 dark:text-slate-300">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 11a7 7 0 0 1-14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
            </button>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); void runNode(id); }}
            disabled={isGenerating}
            className="nodrag flex h-11 items-center justify-center rounded-full bg-[#030303] px-6 text-[15px] font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-50 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400"
          >
            {isScript ? "Run" : "Save"}
          </button>
        </div>
      </div>

    </>
  );
}

function StoryboardPlaceholderIcon() {
  return (
    <div className="flex h-[92px] w-[118px] items-center justify-center rounded-[24px] border-[6px] border-[#d4d5d7] text-[#a8abae] dark:border-slate-600 dark:text-slate-400">
      <svg width="58" height="46" viewBox="0 0 58 46" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="19" cy="14" r="8" />
        <circle cx="36" cy="19" r="6" />
        <path d="M16 29h17v12H16z" /><path d="M33 32h8l5 5v4h-13z" />
      </svg>
    </div>
  );
}

function StoryboardNodeLayout({ id, data, selected, isGenerating, runNode }: any) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const visualGroupColor = data.workflowId ? undefined : data.groupColor;
  const sceneCount = clampStoryboardSceneCount(data.targetShotCount ?? data.numberOfScenes ?? DEFAULT_STORYBOARD_SCENE_COUNT);
  const scenes = Array.isArray(data.output?.value) ? data.output.value.map(record) : [];

  return (
    <>
      <div className={`relative flex h-[280px] w-[380px] flex-col rounded-[24px] border-[1.4px] bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"} ${visualGroupColor && !selected ? "!border-transparent" : ""}`}>
        {visualGroupColor && !selected && <div className="absolute inset-[-1.4px] -z-10 rounded-[26px] border-[1.4px]" style={{ borderColor: visualGroupColor }} />}
        {isGenerating && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": GLOW_COLORS.storyboard || "#3eedb8" } as React.CSSProperties} />}
        <div className="absolute -top-8 left-1 text-[20px] font-bold tracking-tight text-[#030303] dark:text-slate-100">Storyboard</div>

        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />

        <div className="min-h-0 flex-1 p-5">
          <div className={`relative flex h-full min-h-0 w-full overflow-hidden rounded-[18px] bg-[#f0f1f3] dark:bg-slate-800 ${scenes.length ? "items-stretch justify-start" : "items-center justify-center"}`}>
            {isGenerating ? (
              <div className="absolute inset-0 m-auto h-12 w-12 animate-pulse rounded-2xl bg-[#c9ccd1] dark:bg-slate-600" />
            ) : scenes.length ? (
              <div className="nodrag nowheel h-full min-h-0 w-full overflow-y-auto overscroll-contain px-4 py-3">
                <div className="sticky top-0 z-10 mb-1 flex items-center justify-between bg-[#f0f1f3] pb-2 text-[11px] font-semibold text-[#404040] dark:bg-slate-800 dark:text-slate-200">
                  <span>{scenes.length} scenes</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[#676f7b] shadow-sm dark:bg-slate-700 dark:text-slate-300">Synced</span>
                </div>
                <div className="divide-y divide-[#d9dce1] dark:divide-slate-700">
                  {scenes.map((scene: Record<string, unknown>, index: number) => (
                    <div key={`${String(scene.shotNumber || scene.sceneNumber || index + 1)}-${index}`} className="py-2.5 first:pt-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[11px] font-semibold text-[#030303] dark:text-cyan-200">
                          {text(scene.title) || `Scene ${String(scene.shotNumber || scene.sceneNumber || index + 1)}`}
                        </p>
                        {Number(scene.duration) > 0 && <span className="shrink-0 text-[10px] font-medium text-[#858b94] dark:text-slate-500">{Number(scene.duration)}s</span>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#404040] dark:text-slate-300">{text(scene.description) || text(scene.action) || text(scene.visualPrompt)}</p>
                      {text(scene.camera) && <p className="mt-1 truncate text-[10px] text-[#858b94] dark:text-slate-500">{text(scene.camera)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : <StoryboardPlaceholderIcon />}
          </div>
        </div>
      </div>

      <div className={`absolute left-1/2 top-[calc(100%+8px)] z-50 w-[640px] -translate-x-1/2 overflow-visible rounded-[28px] border-[1.5px] border-[#3f3f46] bg-white shadow-2xl transition-all duration-300 dark:border-cyan-400 dark:bg-[#101c29] ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <div className="p-6 pb-4">
          <AutoGrowTextarea
            value={data.storyBrief ?? ""}
            onChange={(value) => updateNodeData(id, { storyBrief: value })}
            placeholder="描述故事、角色、风格和希望发生的情节…"
            minHeight={80}
          />
        </div>
        <div className="flex items-center justify-between px-6 pb-6">
          <div className="flex gap-2">
            <PillDropdown
              value={data.model || "GPT 4o mini"}
              options={["GPT 4o mini", "Claude sonnet 4.6", "Gemini 3.1 Pro"].map((value) => ({ value, label: value }))}
              onChange={(value) => updateNodeData(id, { model: String(value) })}
            />
            <PillDropdown
              value={sceneCount}
              options={[1, 2, 3].map((value) => ({ value, label: `${value} scene` }))}
              onChange={(value) => { const count = clampStoryboardSceneCount(value); updateNodeData(id, { numberOfScenes: count, targetShotCount: count }); }}
            />
          </div>
          <button
            onClick={(event) => { event.stopPropagation(); void runNode(id); }}
            disabled={isGenerating}
            className="nodrag flex h-11 items-center justify-center rounded-full bg-[#030303] px-6 text-[15px] font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-50 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400"
          >
            Run
          </button>
        </div>
      </div>
    </>
  );
}

function ImageNodeLayout({ id, data, selected, isGenerating, runNode, createImageRevision }: any) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useCanvasStore((s) => s.edges);
  const allNodes = useCanvasStore((s) => s.nodes);
  const incomingEdges = edges.filter((e) => e.target === id);
  const connectedHandles = new Set(incomingEdges.map((e) => e.targetHandle || ""));
  const [viewUrl, setViewUrl] = useState("");
  const [annotatingUrl, setAnnotatingUrl] = useState("");
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const outputValue = record(data.output?.value);
  const generatedImageUrl = text(outputValue.imageUrl) || text(outputValue.revisedImageUrl) || (typeof data.output?.value === "string" ? (data.output?.value as string) : "");
  const imageUrl = data.activeImageUrl || generatedImageUrl;
  const imageHistory = data.imageHistory || (generatedImageUrl ? [generatedImageUrl] : []);
  const visualGroupColor = data.workflowId ? undefined : data.groupColor;
  const imageSourceIds = new Set(incomingEdges
    .filter((edge) => !edge.targetHandle || edge.targetHandle === "image" || edge.targetHandle === "ref-image" || edge.targetHandle.startsWith("ref-image-"))
    .map((edge) => edge.source));
  const materialOptions = allNodes
    .filter((item: CanvasNode) => imageSourceIds.has(item.id))
    .filter((item: CanvasNode) => item.id !== id && ["image", "reference", "videoFrame"].includes(item.data.nodeType) && nodeImageUrl(item))
    .map((item: CanvasNode) => ({ node: item, imageUrl: nodeImageUrl(item), label: materialLabel(item) }));
  const selectedReferenceIds = (data.imageReferenceNodeIds || []).filter((refId: string) => materialOptions.some((item) => item.node.id === refId));
  const selectedMaterials = selectedReferenceIds.map((refId: string) => materialOptions.find((item) => item.node.id === refId)).filter(Boolean) as typeof materialOptions;
  const toggleMaterial = (nodeId: string) => {
    const current = data.imageReferenceNodeIds || [];
    updateNodeData(id, { imageReferenceNodeIds: current.includes(nodeId) ? current.filter((item: string) => item !== nodeId) : [...current, nodeId].slice(0, 4) });
  };

  return (
    <>
      <div className={`relative flex h-[280px] w-[380px] flex-col rounded-[24px] border-[1.4px] bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"} ${visualGroupColor && !selected ? "!border-transparent" : ""}`}>
        {visualGroupColor && !selected && (
          <div className="absolute inset-[-1.4px] -z-10 rounded-[26px] border-[1.4px]" style={{ borderColor: visualGroupColor }} />
        )}
        {isGenerating && (
          <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": GLOW_COLORS.image || "#3bf657" } as React.CSSProperties} />
        )}

        <div className="absolute -top-8 left-1 text-[20px] font-bold tracking-tight text-[#030303] dark:text-slate-100">Image</div>

        <div className="absolute -left-[145px] top-[65px] flex flex-col gap-[36px]">
          <HandleDot label="Text" handleId="text" borderColorClass="border-[#f59e0b]" bgClass="bg-white dark:bg-[#101c29]" connectedBgClass="bg-[#f59e0b]" selected={!!selected} connected={connectedHandles.has("text")} />
          <HandleDot label="Reference image" handleId="ref-image-1" borderColorClass="border-[#84cc16]" bgClass="bg-white dark:bg-[#101c29]" connectedBgClass="bg-[#84cc16]" selected={!!selected} connected={connectedHandles.has("ref-image-1")} />
          <HandleDot label="Reference image" handleId="ref-image-2" borderColorClass="border-[#84cc16]" bgClass="bg-white dark:bg-[#101c29]" connectedBgClass="bg-[#84cc16]" selected={!!selected} connected={connectedHandles.has("ref-image-2")} />
          <HandleDot label="Reference image" handleId="ref-image-3" borderColorClass="border-[#84cc16]" bgClass="bg-white dark:bg-[#101c29]" connectedBgClass="bg-[#84cc16]" selected={!!selected} connected={connectedHandles.has("ref-image-3")} />
        </div>

        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />

        <div className="flex-1 p-6">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[20px] bg-[#f0f1f3] dark:bg-slate-800 border-[6px] border-transparent">
            {imageUrl ? (
              <>
                <img src={imageUrl} alt="Generated result" className="absolute inset-0 h-full w-full bg-[#f0f1f3] object-contain dark:bg-slate-800" />
                <div className="nodrag absolute right-2 top-2 flex gap-1.5">
                  <ExpandIcon onClick={() => setViewUrl(imageUrl)} className="static" />
                  <button onClick={() => setAnnotatingUrl(imageUrl)} title="标注 / 局部重绘" className="grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                </div>
              </>
            ) : isGenerating ? (
              <div className="absolute inset-0 m-auto h-12 w-12 animate-pulse rounded-2xl bg-[#c9ccd1] dark:bg-slate-600" />
            ) : (
              <ImagePlaceholderIcon />
            )}
          </div>
        </div>
        {selected && imageHistory.length > 1 && (
          <div className="nodrag nowheel absolute left-[calc(100%+16px)] top-0 z-40 h-[280px] w-[210px] overflow-hidden rounded-[24px] border-[1.4px] border-[#030303] bg-white p-2 shadow-sm dark:border-cyan-400 dark:bg-[#101c29]">
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => updateNodeData(id, { imageHistory: imageHistory.slice(0, 1), activeImageUrl: undefined })}
                className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-black/75 focus:opacity-100 group-hover:opacity-100"
                title="清空生成历史"
                aria-label="清空生成历史"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>
              </button>
            </div>
            <div className="h-full overflow-y-auto rounded-3xl pr-1">
              <div className="group grid grid-cols-2 gap-1 pb-2">
                {imageHistory.map((url: string, index: number) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    onClick={() => updateNodeData(id, { activeImageUrl: url })}
                    className={`relative aspect-square w-full overflow-hidden bg-black transition-all duration-200 ${url === imageUrl ? "opacity-100" : "opacity-40 hover:opacity-75"}`}
                    title={`查看第 ${imageHistory.length - index} 张生成图片`}
                  >
                    <img src={url} alt={`Generated image ${imageHistory.length - index}`} className="absolute inset-0 h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`absolute left-1/2 top-[calc(100%+8px)] z-50 w-[640px] -translate-x-1/2 overflow-visible rounded-[28px] border-[1.5px] border-[#3f3f46] bg-white shadow-2xl transition-all duration-300 dark:border-cyan-400 dark:bg-[#101c29] ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <div className="p-6 pb-4">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMaterialPickerOpen((open) => !open); }}
              className="nodrag rounded-full border border-[#c9ccd1] px-3 py-1.5 text-[12px] font-semibold text-[#030303] hover:border-[#030303] dark:border-slate-600 dark:text-slate-100 dark:hover:border-cyan-300"
            >
              @引用素材
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {selectedMaterials.map((item, index) => (
                <button
                  key={item.node.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleMaterial(item.node.id); }}
                  className="nodrag relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#c9ccd1] bg-[#f0f1f3] dark:border-slate-600 dark:bg-slate-800"
                  title={`${index + 1}: ${item.label}`}
                >
                  <img src={item.imageUrl} alt={item.label} className="h-full w-full object-cover" />
                  <span className="absolute right-0.5 top-0.5 rounded-full bg-[#030303]/85 px-1.5 py-0.5 text-[10px] font-bold text-white">@{index + 1}</span>
                </button>
              ))}
              {!selectedMaterials.length && <span className="text-[12px] text-[#676f7b] dark:text-slate-400">Nano Banana 可选择最多 4 张参考图</span>}
            </div>
          </div>
          {materialPickerOpen && (
            <div className="nodrag mb-3 grid max-h-44 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-[#071019]" onClick={(e) => e.stopPropagation()}>
              {materialOptions.map((item) => {
                const selectedIndex = selectedReferenceIds.indexOf(item.node.id);
                return (
                  <button
                    key={item.node.id}
                    type="button"
                    onClick={() => toggleMaterial(item.node.id)}
                    className={`relative h-20 overflow-hidden rounded-lg border text-left ${selectedIndex >= 0 ? "border-[#030303] ring-2 ring-[#030303]/15 dark:border-cyan-300 dark:ring-cyan-300/20" : "border-[#dfe3ea] hover:border-[#030303] dark:border-slate-700 dark:hover:border-cyan-300"}`}
                    title={item.label}
                  >
                    <img src={item.imageUrl} alt={item.label} className="h-full w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-1 text-[10px] font-medium text-white">{item.label}</div>
                    {selectedIndex >= 0 && <span className="absolute right-1 top-1 rounded-full bg-[#030303] px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-cyan-400 dark:text-[#030303]">@{selectedIndex + 1}</span>}
                  </button>
                );
              })}
              {!materialOptions.length && <div className="col-span-6 px-2 py-6 text-center text-[12px] text-[#676f7b] dark:text-slate-400">请先把图片或素材节点连到 Reference image</div>}
            </div>
          )}
          <AutoGrowTextarea
            value={data.prompt ?? ""}
            onChange={(v) => updateNodeData(id, { prompt: v })}
            placeholder="描述你想生成的图像，可用 @1、@2 引用素材..."
            minHeight={96}
            maxHeight={220}
          />
        </div>
        <div className="flex items-center justify-between px-6 pb-6">
          <div className="flex gap-2">
            <PillDropdown
              value={imageModelValue(data.model)}
              options={[
                { value: "gpt-image-2(tokenstar)", label: "GPT Image 2 (TokenStar)" },
                { value: "nano banana(tokenstar)", label: "Nano Banana (TokenStar)" },
              ]}
              onChange={(v) => updateNodeData(id, { model: String(v) })}
            />
            <PillDropdown
              value={imageAspectRatioValue(data.aspectRatio, data.size)}
              options={["16:9", "21:9", "9:16", "3:2", "1:1"].map((o) => ({ value: o, label: o }))}
              onChange={(v) => updateNodeData(id, { aspectRatio: String(v) })}
            />
            <PillDropdown
              value={imageResolutionValue(data.resolution, data.size)}
              options={["1K", "2K", "4K"].map((o) => ({ value: o, label: o }))}
              onChange={(v) => updateNodeData(id, { resolution: String(v) })}
            />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); void runNode(id); }}
            disabled={isGenerating}
            className="nodrag flex h-11 items-center justify-center rounded-full bg-[#030303] px-6 text-[15px] font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-50 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400"
          >
            Run
          </button>
        </div>
      </div>

      {viewUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={() => setViewUrl("")}>
          <div className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img src={viewUrl} alt="Full generated result" className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            <button onClick={() => setViewUrl("")} className="mx-auto mt-3 block rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Close</button>
          </div>
        </div>, document.body)}
      {annotatingUrl && (
        <ImageAnnotationEditor
          imageUrl={annotatingUrl}
          initialAnnotations={data.annotations as ImageAnnotation[] | undefined}
          initialInstruction={data.revisionInstruction}
          onClose={() => setAnnotatingUrl("")}
          onGenerate={(a, i) => { void createImageRevision(id, a, i); setAnnotatingUrl(""); }}
        />
      )}
    </>
  );
}

function VideoNodeLayout({ id, data, selected, isGenerating, node, runNode }: any) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useCanvasStore((s) => s.edges);
  const allNodes = useCanvasStore((s) => s.nodes);
  const updateNodeInternals = useUpdateNodeInternals();
  const incomingEdges = edges.filter(e => e.target === id);
  const connectedHandles = new Set(incomingEdges.map(e => e.targetHandle || ""));
  const videoUrl = text(record(data.output?.value).videoUrl || record(data.output?.value).resultUrl || record(data.output?.value).finalVideoUrl || data.resultUrl || "");
  const visualGroupColor = data.workflowId ? undefined : data.groupColor;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const selectedFrameTimeRef = useRef(0);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [promptEnhanceMessage, setPromptEnhanceMessage] = useState("");
  const [promptEnhanceFailed, setPromptEnhanceFailed] = useState(false);
  const promptEnhanceRequestRef = useRef(0);
  const isVideoEdit = data.nodeType === "videoEdit";
  const activeVideoModel = videoModelPresetIdFromData(data);
  const videoAspectRatios = videoAspectRatiosForPreset(activeVideoModel);
  const videoAspectRatio = videoAspectRatioForPreset(activeVideoModel, data.aspectRatio);
  const sourceControlsVideoRatio = videoAspectRatioControlForPreset(activeVideoModel) === "source";
  const isHKGAIMinimax = activeVideoModel === "minimax-h3-hkgai";
  const isHKGAIRef2va = activeVideoModel === "minimax-ref2va-hkgai";
  const isOmniHuman = activeVideoModel === "omnihuman-1.5-volcengine";
  const isDigitalHumanModel = activeVideoModel === "digital-human-video" || isOmniHuman;
  const videoPromptMaxLength = videoPromptMaxLengthForPreset(activeVideoModel);
  const activeVideoDurationOptions = videoDurationOptionsForPreset(activeVideoModel) || videoDurationOptions;
  const inputPorts = isVideoEdit
    ? [
        { id: "video", label: "Video", kind: "video" as const },
        { id: "audio", label: "Audio", kind: "audio" as const },
      ]
    : videoInputPortsForPreset(activeVideoModel);
  const inputPortKey = inputPorts.map((port) => port.id).join(",");
  const supportedMaterialKinds = new Set(inputPorts.map((port) => port.kind).filter((kind): kind is VideoMaterialKind => kind === "image" || kind === "video" || kind === "audio"));
  const connectedSourceIds = [...new Set(incomingEdges.map((edge) => edge.source))];
  const connectedSourceNodes = connectedSourceIds
    .map((sourceId) => allNodes.find((item: CanvasNode) => item.id === sourceId))
    .filter((item): item is CanvasNode => item !== undefined && item.id !== id);
  const editVideoSources: VideoEditSource[] = connectedSourceNodes
    .filter((item) => videoMaterialKind(item) === "video")
    .map((item, index) => ({ id: item.id, source: index + 1, label: materialLabel(item), url: videoUrlFrom(item) || undefined }));
  const editAudioSources: VideoEditSource[] = connectedSourceNodes
    .filter((item) => videoMaterialKind(item) === "audio")
    .map((item, index) => ({ id: item.id, source: index + 1, label: materialLabel(item), url: audioUrlFrom(item) || undefined }));
  const materialOptions = connectedSourceNodes
    .map((item): VideoMaterialOption | undefined => {
      const kind = videoMaterialKind(item);
      if (!kind || !supportedMaterialKinds.has(kind)) return undefined;
      const url = videoMaterialUrl(item, kind);
      return url ? { node: item, kind, url, label: materialLabel(item) } : undefined;
    })
    .filter((item): item is VideoMaterialOption => Boolean(item));
  const selectedReferenceIds = (data.videoReferenceNodeIds || []).filter((refId: string) => materialOptions.some((item) => item.node.id === refId));
  const selectedMaterials = selectedReferenceIds.map((refId: string) => materialOptions.find((item) => item.node.id === refId)).filter(Boolean) as typeof materialOptions;
  const contextIRImageUrls = (data.videoReferenceSelectionActive === true ? selectedMaterials : materialOptions)
    .filter((item) => item.kind === "image")
    .slice(0, 2)
    .map((item) => item.url);
  const toggleMaterial = (nodeId: string) => {
    const current = selectedReferenceIds;
    if (current.includes(nodeId)) {
      updateNodeData(id, { videoReferenceNodeIds: current.filter((item: string) => item !== nodeId), videoReferenceSelectionActive: true });
      return;
    }
    const material = materialOptions.find((item) => item.node.id === nodeId);
    const kindLimit = material ? videoReferenceLimitForPreset(activeVideoModel, material.kind) : undefined;
    let withoutReplacedKind = current;
    if (isHKGAIRef2va && material) {
      withoutReplacedKind = current.filter((itemId: string) => {
        const selectedKind = materialOptions.find((item) => item.node.id === itemId)?.kind;
        return material.kind === "video" ? selectedKind === "video" : selectedKind !== "video";
      });
    }
    if (material && kindLimit !== undefined) {
      const selectedOfKind = withoutReplacedKind.filter((itemId: string) => materialOptions.find((item) => item.node.id === itemId)?.kind === material.kind);
      const removeCount = Math.max(0, selectedOfKind.length - kindLimit + 1);
      const removeIds = new Set(selectedOfKind.slice(0, removeCount));
      withoutReplacedKind = withoutReplacedKind.filter((itemId: string) => !removeIds.has(itemId));
    }
    const next = [...withoutReplacedKind, nodeId].slice(0, 7);
    updateNodeData(id, { videoReferenceNodeIds: next, videoReferenceSelectionActive: true });
  };

  const enhanceMinimaxPrompt = async () => {
    const sourcePrompt = String(data.prompt || "").trim();
    if (!sourcePrompt) {
      setPromptEnhanceFailed(true);
      setPromptEnhanceMessage("请先输入需要增强的视频提示词。");
      return;
    }
    const requestId = promptEnhanceRequestRef.current + 1;
    promptEnhanceRequestRef.current = requestId;
    setIsEnhancingPrompt(true);
    setPromptEnhanceFailed(false);
    setPromptEnhanceMessage("正在创建 MiniMax Context IR 任务…");
    const readResponse = async (response: Response) => {
      const payload = await response.json() as ContextIRApiResponse;
      if (!response.ok || payload.ok !== true) throw new Error(payload.error?.message || `Context IR request failed (${response.status}).`);
      return payload;
    };
    try {
      const created = await readResponse(await fetch("/api/ai/minimax-h3-context-ir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: sourcePrompt.replace(/@(?:image[_\s-]?|reference[_\s-]?image[_\s-]?|ref[_\s-]?)?(\d+)/gi, (_, index: string) => `reference image ${Number(index)}`),
          duration: Number(data.duration) || 5,
          ratio: videoAspectRatio,
          imageUrls: contextIRImageUrls,
        }),
      }));
      const taskId = created.output?.taskId;
      if (!taskId) throw new Error("MiniMax Context IR did not return a task_id.");
      let intervalMs = Math.max(1000, Number(created.polling?.intervalMs) || 2500);
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        if (promptEnhanceRequestRef.current !== requestId) return;
        const queried = await readResponse(await fetch(`/api/ai/minimax-h3-context-ir?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" }));
        const output = queried.output;
        if (output?.status === "queued" || output?.status === "running") {
          intervalMs = Math.max(1000, Number(queried.polling?.intervalMs) || intervalMs);
          setPromptEnhanceMessage(output.status === "queued" ? "Context IR 正在排队…" : "Context IR 正在分析提示词和参考图…");
          continue;
        }
        if (output?.status !== "succeeded" || !output.enhancedPrompt) throw new Error(output?.errorMessage || `Context IR task ${output?.status || "failed"}.`);
        updateNodeData(id, { prompt: output.enhancedPrompt });
        setPromptEnhanceFailed(false);
        setPromptEnhanceMessage(output.truncated ? "增强完成，结果已裁剪至 minimax_h3 的 7,000 字符上限。" : "提示词增强完成，可继续编辑或直接生成视频。");
        return;
      }
      throw new Error("Context IR task timed out after 5 minutes.");
    } catch (error) {
      if (promptEnhanceRequestRef.current !== requestId) return;
      setPromptEnhanceFailed(true);
      setPromptEnhanceMessage(error instanceof Error ? error.message : "提示词增强失败，请稍后重试。");
    } finally {
      if (promptEnhanceRequestRef.current === requestId) setIsEnhancingPrompt(false);
    }
  };
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, inputPortKey, updateNodeInternals]);

  useEffect(() => {
    if (!isHKGAIMinimax) {
      setIsEnhancingPrompt(false);
      setPromptEnhanceMessage("");
      setPromptEnhanceFailed(false);
    }
    return () => { promptEnhanceRequestRef.current += 1; };
  }, [isHKGAIMinimax]);

  useEffect(() => {
    videoRef.current?.pause();
    selectedFrameTimeRef.current = 0;
    setIsPlaying(false);
  }, [videoUrl]);

  useEffect(() => {
    if (!previewOpen) return;
    const preview = previewVideoRef.current;
    if (!preview) return;
    const restoreTime = () => {
      const duration = Number.isFinite(preview.duration) ? preview.duration : selectedFrameTimeRef.current;
      preview.currentTime = Math.min(selectedFrameTimeRef.current, Math.max(0, duration));
    };
    if (preview.readyState >= 1) restoreTime();
    else preview.addEventListener("loadedmetadata", restoreTime, { once: true });
    return () => preview.removeEventListener("loadedmetadata", restoreTime);
  }, [previewOpen, videoUrl]);

  const rememberFrameTime = (video: HTMLVideoElement | null) => {
    if (video && Number.isFinite(video.currentTime)) selectedFrameTimeRef.current = Math.max(0, video.currentTime);
  };

  const openPreview = () => {
    rememberFrameTime(videoRef.current);
    videoRef.current?.pause();
    setPreviewOpen(true);
  };

  const closePreview = () => {
    const preview = previewVideoRef.current;
    rememberFrameTime(preview);
    preview?.pause();
    const cardVideo = videoRef.current;
    if (cardVideo && cardVideo.readyState >= 1) {
      cardVideo.currentTime = Math.min(selectedFrameTimeRef.current, Math.max(0, cardVideo.duration || selectedFrameTimeRef.current));
    }
    setPreviewOpen(false);
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
      return;
    }
    video.pause();
  };

  const renderHandle = (label: string, handleId: string, borderColorClass: string, bgColorClass: string, connectedBgColorClass: string) => {
    const isConnected = connectedHandles.has(handleId);
    return (
       <div key={handleId} className="flex items-center justify-end gap-3" style={{ width: "125px" }}>
         <span className={`whitespace-nowrap font-bold text-[14px] text-[#030303] dark:text-slate-200 transition-opacity duration-300 ${selected ? "opacity-100" : "opacity-0"}`}>
           {label}
         </span>
         <div className={`relative grid place-items-center h-[18px] w-[18px] shrink-0 rounded-full border-[2.5px] ${borderColorClass} ${isConnected ? connectedBgColorClass : bgColorClass}`}>
           <Handle type="target" id={handleId} position={Position.Left} className="!absolute !inset-0 !m-auto !h-[26px] !w-[26px] !border-0 !bg-transparent !transform-none opacity-0" />
         </div>
       </div>
    );
  };

  return (
    <>
      <div className={`relative flex h-[280px] w-[380px] flex-col rounded-[24px] border-[1.4px] bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"} ${visualGroupColor && !selected ? "!border-transparent" : ""}`}>
        
        {visualGroupColor && !selected && (
          <div className="absolute inset-[-1.4px] -z-10 rounded-[26px] border-[1.4px]" style={{ borderColor: visualGroupColor }} />
        )}
        {isGenerating && (
          <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": GLOW_COLORS[data.nodeType] || "#22d3ee" } as React.CSSProperties} />
        )}

        <div className="absolute -left-[145px] top-[75px] flex flex-col gap-[36px]">
           {inputPorts.map((port) => {
             const style = videoPortStyles[port.kind];
             return renderHandle(port.label, port.id, style.border, "bg-white dark:bg-[#101c29]", style.connected);
           })}
        </div>

        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />

        <div className="absolute -top-8 left-1 text-[20px] font-bold tracking-tight text-[#030303] dark:text-slate-100">{data.title || "Kling 3.0 Omni"}</div>

        <div className="flex-1 p-6">
          <div className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-[20px] bg-[#f0f1f3] dark:bg-slate-800 border-[6px] border-transparent">
             {videoUrl ? (
               <>
                 <video ref={videoRef} src={videoUrl} loop muted playsInline preload="metadata" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onTimeUpdate={(event) => rememberFrameTime(event.currentTarget)} onSeeked={(event) => rememberFrameTime(event.currentTarget)} className="absolute inset-0 h-full w-full rounded-[14px] bg-black object-contain" />
                 <button
                   type="button"
                   onClick={(event) => { event.stopPropagation(); togglePlayback(); }}
                   title={isPlaying ? "暂停视频" : "播放视频"}
                   className={`nodrag absolute left-1/2 top-1/2 z-10 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-opacity hover:bg-black/70 ${isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
                 >
                   {isPlaying ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5"><path d="M8 5v14l11-7z" /></svg>}
                 </button>
                 <ExpandIcon onClick={openPreview} />
               </>
             ) : (
               isGenerating ? (
                  <div className="absolute inset-0 m-auto h-12 w-12 animate-pulse rounded-2xl bg-[#c9ccd1] dark:bg-slate-600" />
               ) : (
                  <div className="flex h-[72px] w-[100px] items-center justify-center rounded-[24px] border-[6px] border-[#e7eaf0] bg-[#f0f1f3] dark:border-slate-600 dark:bg-slate-700" style={{ transform: "scale(1.2)" }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="ml-2 text-[#a8abae] dark:text-slate-400"><path d="M5 3l14 9-14 9V3z"/></svg>
                  </div>
               )
             )}
          </div>
        </div>
      </div>

      <div className={`nodrag nowheel absolute left-1/2 top-[calc(100%+8px)] z-50 flex ${isVideoEdit ? "max-h-[min(720px,calc(100vh-40px))] w-[960px]" : "max-h-[560px] w-[800px]"} max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-visible rounded-[28px] border-[1.5px] border-[#3f3f46] bg-white shadow-2xl transition-all duration-300 dark:border-cyan-400 dark:bg-[#101c29] ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
         <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-4">
            {isVideoEdit ? <VideoEditComposer data={data} videoSources={editVideoSources} audioSources={editAudioSources} onChange={(patch) => updateNodeData(id, patch)} /> : <>
            {supportedMaterialKinds.size > 0 && <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMaterialPickerOpen((open) => !open); }}
                className="nodrag rounded-full border border-[#c9ccd1] px-3 py-1.5 text-[12px] font-semibold text-[#030303] hover:border-[#030303] dark:border-slate-600 dark:text-slate-100 dark:hover:border-cyan-300"
              >
                @引用素材
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                {selectedMaterials.map((item, index) => (
                  <button
                    key={item.node.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleMaterial(item.node.id); }}
                    className="nodrag relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#c9ccd1] bg-[#f0f1f3] dark:border-slate-600 dark:bg-slate-800"
                    title={`${index + 1}: ${item.label}`}
                  >
                    {item.kind === "image" ? <img src={item.url} alt={item.label} className="h-full w-full object-cover" /> : item.kind === "video" ? <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300"><AudioMaterialIcon /></span>}
                    <span className="absolute right-0.5 top-0.5 rounded-full bg-[#030303]/85 px-1.5 py-0.5 text-[10px] font-bold text-white">@{index + 1}</span>
                  </button>
                ))}
                {!selectedMaterials.length && <span className="text-[12px] text-[#676f7b] dark:text-slate-400">{isDigitalHumanModel ? "请选择一张人物图和一段音频" : "输入 @ 可选择连接的图片、视频或音频素材"}</span>}
              </div>
            </div>}
            {supportedMaterialKinds.size > 0 && materialPickerOpen && (
              <div className="nodrag mb-3 grid max-h-44 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-[#e7eaf0] bg-[#f8f9fa] p-2 dark:border-slate-700 dark:bg-[#071019]" onClick={(e) => e.stopPropagation()}>
                {materialOptions.map((item) => {
                  const selectedIndex = selectedReferenceIds.indexOf(item.node.id);
                  return (
                    <button
                      key={item.node.id}
                      type="button"
                      onClick={() => toggleMaterial(item.node.id)}
                      className={`relative h-20 overflow-hidden rounded-lg border text-left ${selectedIndex >= 0 ? "border-[#030303] ring-2 ring-[#030303]/15 dark:border-cyan-300 dark:ring-cyan-300/20" : "border-[#dfe3ea] hover:border-[#030303] dark:border-slate-700 dark:hover:border-cyan-300"}`}
                      title={item.label}
                    >
                      {item.kind === "image" ? <img src={item.url} alt={item.label} className="h-full w-full object-cover" /> : item.kind === "video" ? <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300"><AudioMaterialIcon /></span>}
                      <span className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] font-bold ${item.kind === "image" ? "bg-lime-100/95 text-lime-800" : item.kind === "video" ? "bg-violet-100/95 text-violet-800" : "bg-orange-100/95 text-orange-800"}`}>{item.kind === "image" ? "图片" : item.kind === "video" ? "视频" : "音频"}</span>
                      <div className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-1 text-[10px] font-medium text-white">{item.label}</div>
                      {selectedIndex >= 0 && <span className="absolute right-1 top-1 rounded-full bg-[#030303] px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-cyan-400 dark:text-[#030303]">@{selectedIndex + 1}</span>}
                    </button>
                  );
                })}
                {!materialOptions.length && <div className="col-span-6 px-2 py-6 text-center text-[12px] text-[#676f7b] dark:text-slate-400">{isDigitalHumanModel ? "请先连接一张人物图和一段音频" : "请先把图片、视频或音频节点连到这个 VideoNode"}</div>}
              </div>
            )}
            <AutoGrowTextarea
               value={data.prompt ?? ""}
               onChange={(v) => updateNodeData(id, { prompt: v })}
               placeholder="描述你想要生成的画面内容，可用 @1、@2 引用上方素材..."
               minHeight={96}
               maxHeight={220}
               maxLength={videoPromptMaxLength}
            />
            {isHKGAIMinimax && <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[#676f7b] dark:text-slate-400">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); void enhanceMinimaxPrompt(); }}
                  disabled={isEnhancingPrompt || !String(data.prompt || "").trim()}
                  className="nodrag rounded-full bg-violet-100 px-3 py-1.5 text-[11px] font-bold text-violet-800 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-950/60 dark:text-violet-200 dark:hover:bg-violet-900/70"
                >
                  {isEnhancingPrompt ? "增强中…" : "增强提示词"}
                </button>
                <span>MiniMax Context IR · 最多 2 张参考图</span>
              </div>
              <span className="tabular-nums">{Array.from(data.prompt || "").length} / 7000</span>
            </div>}
            {isHKGAIMinimax && promptEnhanceMessage && <p className={`mt-2 text-[11px] leading-4 ${promptEnhanceFailed ? "text-red-600 dark:text-red-300" : "text-violet-700 dark:text-violet-300"}`}>{promptEnhanceMessage}</p>}
            {isHKGAIRef2va && <div className="mt-2 rounded-xl bg-violet-50 px-3 py-2 text-[10px] leading-4 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">选择 1 张图片 + 1 段音频，或选择 1–3 段自带音轨的视频。选择视频时会自动移除已选图片/音频，反之亦然。</div>}
            {isOmniHuman && <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[#676f7b] dark:text-slate-400"><span>必须连接 1 张图片 + 1 段音频；音频需少于 60 秒，建议 15 秒以内。</span><span className="tabular-nums">{Array.from(data.prompt || "").length} / 300</span></div>}
            </>}
         </div>
         <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#e7eaf0] px-6 py-4 dark:border-slate-800">
            <div className="flex min-w-0 flex-wrap gap-2">
              {!isVideoEdit && <PillDropdown
                value={activeVideoModel}
                options={videoModelOptions.map(option => ({ value: option.id, label: option.label }))}
                 onChange={v => {
                   const presetId = String(v) as VideoModelPresetId;
                   updateNodeData(id, {
                     ...videoModelSelectionPatch(presetId, data.aspectRatio),
                     ...((presetId === "digital-human-video" || presetId === "omnihuman-1.5-volcengine") && (!data.prompt || data.prompt === "A gentle cinematic movement") ? { prompt: DIGITAL_HUMAN_VIDEO_PROMPT } : {}),
                     ...(presetId === "digital-human-video" || presetId === "omnihuman-1.5-volcengine" || presetId === "minimax-ref2va-hkgai" ? { videoReferenceNodeIds: [], videoReferenceSelectionActive: false } : {}),
                     ...(presetId === "minimax-ref2va-hkgai" ? { referenceImageUrl: undefined } : {}),
                   });
                 }}
              />}
              {!isVideoEdit && !isOmniHuman && !isHKGAIRef2va && <PillDropdown
                 value={videoAspectRatio}
                 options={videoAspectRatios.map((ratio) => ({ value: ratio, label: ratio }))}
                 onChange={v => updateNodeData(id, { aspectRatio: String(v) })}
              />}
              {!isVideoEdit && !isOmniHuman && <PillDropdown
                 value={data.duration || (isHKGAIRef2va ? 4 : isHKGAIMinimax ? 5 : 15)}
                 options={activeVideoDurationOptions.map((value) => ({ value, label: `${value}s` }))}
                 onChange={v => updateNodeData(id, { duration: Number(v) })}
              />}
              {!isVideoEdit && !isHKGAIMinimax && !isHKGAIRef2va && !isOmniHuman && <PillDropdown
                 value={data.resolution || "1080p"} 
                 options={[{value: "1080p", label: "1080p"}, {value: "720p", label: "720p"}, {value: "480p", label: "480p"}]}
                 onChange={v => updateNodeData(id, { resolution: String(v) })}
              />}
              {!isVideoEdit && isOmniHuman && <PillDropdown
                 value={data.resolution || "1080p"}
                 options={[{value: "1080p", label: "1080p"}, {value: "720p", label: "720p Fast"}]}
                 onChange={v => updateNodeData(id, { resolution: String(v) })}
              />}
              {isVideoEdit && <span className="rounded-full bg-[#f1eafd] px-3 py-1.5 text-[11px] font-bold text-[#5f18c8] dark:bg-violet-950/50 dark:text-violet-200">{editVideoSources.length} 段视频 · {editAudioSources.length} 条音频</span>}
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); void runNode(id); }}
              disabled={isGenerating}
              className="nodrag flex h-11 items-center justify-center rounded-full bg-[#030303] px-6 text-[15px] font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-50 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400"
            >
              Run
            </button>
         </div>
         {!isVideoEdit && sourceControlsVideoRatio && <p className="shrink-0 border-t border-[#e7eaf0] px-6 py-2 text-[11px] text-amber-700 dark:border-slate-800 dark:text-amber-300">{isOmniHuman ? "OmniHuman 输出比例由输入图片决定；720p 自动启用快速模式，1080p 使用标准模式。" : isHKGAIRef2va ? "minimax_ref2va 的画面比例由所选图片或参考视频决定。" : "该模型的比例由首帧决定。首帧与所选比例不一致时会在提交前停止。"}</p>}
      </div>

      {previewOpen && videoUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={closePreview}>
          <div className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <video ref={previewVideoRef} src={videoUrl} controls loop playsInline onTimeUpdate={(event) => rememberFrameTime(event.currentTarget)} onSeeked={(event) => rememberFrameTime(event.currentTarget)} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            <button onClick={closePreview} className="mx-auto mt-3 block rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Close</button>
          </div>
        </div>, document.body)}
    </>
  );
}

function ReferenceNodeLayout({ id, data, selected }: { id: string; data: CanvasNodeData; selected: boolean }) {
  const removeNode = useCanvasStore((state) => state.removeNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const output = record(data.output?.value);
  const imageUrl = data.imageUrl || text(output.imageUrl) || text(output.revisedImageUrl);
  const isRunning = data.status === "running" || data.status === "waiting";
  const [viewUrl, setViewUrl] = useState("");

  return (
    <>
      <div className={`relative flex h-[280px] w-[380px] flex-col rounded-[24px] border bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        {isRunning && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": GLOW_COLORS.reference } as React.CSSProperties} />}
        <div className="absolute -top-8 left-1 text-[20px] font-bold tracking-tight text-[#030303] dark:text-slate-100">{data.title || "Reference"}</div>
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />
        <div className="flex flex-1 flex-col p-5">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[20px] bg-[#f0f1f3] dark:bg-slate-800">
            {imageUrl ? <img src={imageUrl} alt="Reference material" className="absolute inset-0 h-full w-full object-contain" /> : <ImagePlaceholderIcon />}
            {imageUrl && <ExpandIcon onClick={() => setViewUrl(imageUrl)} />}
          </div>
          <p className="mt-3 line-clamp-2 text-[11px] leading-4 text-[#676f7b] dark:text-slate-400">{data.notes || "可连接到图像或视频节点作为参考图"}</p>
        </div>
        <div className="nodrag flex justify-end gap-1 border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-400 dark:hover:bg-slate-800">Duplicate</button>
          <button onClick={() => removeNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800">Delete</button>
        </div>
      </div>
      {viewUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={() => setViewUrl("")}>
          <div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <img src={viewUrl} alt="Full reference material" className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            <button onClick={() => setViewUrl("")} aria-label="关闭预览" title="关闭预览" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white/80">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>, document.body)}
    </>
  );
}

function AudioNodeLayout({ id, data, selected, runNode }: { id: string; data: CanvasNodeData; selected: boolean; runNode(id: string): Promise<void> }) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const removeNode = useCanvasStore((state) => state.removeNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const output = record(data.output?.value);
  const audioUrl = text(output.audioUrl) || text(output.url) || text(output.resultUrl) || data.audioUrl || "";
  const isRunning = data.status === "running" || data.status === "waiting";

  return (
    <>
      <div className={`relative flex h-[280px] w-[380px] flex-col rounded-[24px] border bg-white shadow-sm transition-colors dark:bg-[#101c29] ${selected ? "z-50 border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        {isRunning && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": GLOW_COLORS.audio } as React.CSSProperties} />}
        <div className="absolute -top-8 left-1 text-[20px] font-bold tracking-tight text-[#030303] dark:text-slate-100">{data.title || "Audio"}</div>
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />
        <Handle type="source" id="audio" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#f5510b] dark:!border-[#101c29]" />
        <div className="flex flex-1 flex-col justify-between p-5">
          <div>
            <p className="line-clamp-3 text-[15px] leading-6 text-[#404040] dark:text-slate-200">{data.prompt || data.output?.summary || "描述你想生成的音频"}</p>
            {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
          </div>
          {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : <div className="rounded-2xl border border-dashed border-[#c9ccd1] px-3 py-5 text-center text-[11px] text-[#676f7b] dark:border-slate-700 dark:text-slate-400">音频将在此处播放</div>}
        </div>
        <div className="nodrag flex items-center justify-end gap-1 border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-400 dark:hover:bg-slate-800">Duplicate</button>
          <button onClick={() => removeNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800">Delete</button>
          <button onClick={() => void runNode(id)} disabled={isRunning} className="ml-1 flex items-center gap-1 rounded-md bg-[#030303] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-[#1a1a1a] disabled:opacity-40 dark:bg-cyan-600 dark:hover:bg-cyan-500"><svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.5v7l6-3.5z" /></svg>Run</button>
        </div>
      </div>
      <div className={`absolute left-1/2 top-[calc(100%+8px)] z-50 w-[560px] -translate-x-1/2 rounded-[24px] border border-[#3f3f46] bg-white p-5 shadow-2xl transition-all dark:border-cyan-400 dark:bg-[#101c29] ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <AutoGrowTextarea value={data.prompt || ""} onChange={(prompt) => updateNodeData(id, { prompt })} placeholder="描述想要生成的音乐、环境音或语音…" minHeight={80} />
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-2"><PillDropdown value={data.model || "Default"} options={["Default", "Music", "TTS"].map((value) => ({ value, label: value }))} onChange={(model) => updateNodeData(id, { model: String(model) })} /><PillDropdown value={data.duration || 30} options={[5, 10, 15, 30, 60].map((value) => ({ value, label: `${value}s` }))} onChange={(duration) => updateNodeData(id, { duration: Number(duration) })} /></div>
          <button onClick={() => void runNode(id)} disabled={isRunning} className="nodrag flex h-11 items-center justify-center rounded-full bg-[#030303] px-6 text-[15px] font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-50 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400">Run</button>
        </div>
      </div>
    </>
  );
}

export function AnnotatedCustomNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const removeNode = useCanvasStore((s) => s.removeNode), duplicateNode = useCanvasStore((s) => s.duplicateNode), createImageRevision = useCanvasStore((s) => s.createImageRevision), runNode = useCanvasStore((s) => s.runNode);
  const selectedNodeCount = useCanvasStore((s) => s.nodes.filter((item) => item.selected).length);
  const { t } = useLang();
  const [viewUrl, setViewUrl] = useState(""), [viewVideoUrl, setViewVideoUrl] = useState(""), [annotatingUrl, setAnnotatingUrl] = useState(""), [settingsOpen, setSettingsOpen] = useState(false);
  const [cardSize, setCardSize] = useState({ w: 280, h: 0 });
  const node = { id, data } as CanvasNode;
  const isGenerating = data.status === "running" || data.status === "waiting";
  const isWaiting = record(data.output?.value).status === "pending";
  const visualGroupColor = data.workflowId ? undefined : data.groupColor;
  const detailSelected = Boolean(selected && selectedNodeCount === 1);

  if (data.nodeType === "video" || data.nodeType === "videoEdit") {
    return <VideoNodeLayout id={id} data={data} selected={detailSelected} node={node} isGenerating={isGenerating} runNode={runNode} />;
  }
  if (data.nodeType === "videoRegeneration") {
    return <VideoRegenerationNode id={id} data={data} selected={detailSelected} />;
  }
  if (data.nodeType === "videoFrame") {
    return <VideoFrameNode id={id} data={data} selected={detailSelected} />;
  }
  if (data.nodeType === "image") {
    return <ImageNodeLayout id={id} data={data} selected={detailSelected} isGenerating={isGenerating} runNode={runNode} createImageRevision={createImageRevision} />;
  }
  if (data.nodeType === "reference") {
    return <ReferenceNodeLayout id={id} data={data} selected={detailSelected} />;
  }
  if (data.nodeType === "audio") {
    return <AudioNodeLayout id={id} data={data} selected={detailSelected} runNode={runNode} />;
  }
  if (data.nodeType === "musicGeneration") {
    return <MusicGenerationNodeLayout id={id} data={data} selected={detailSelected} runNode={runNode} />;
  }
  if (data.nodeType === "hkgaiTTS") {
    return <HKGAITTSNodeLayout id={id} data={data} selected={detailSelected} runNode={runNode} />;
  }
  if (data.nodeType === "text" || data.nodeType === "script") {
    return <TextNodeLayout id={id} data={data} selected={detailSelected} isGenerating={isGenerating} runNode={runNode} />;
  }
  if (data.nodeType === "storyboard") {
    return <StoryboardNodeLayout id={id} data={data} selected={detailSelected} isGenerating={isGenerating} runNode={runNode} />;
  }
  if (data.nodeType === "voiceClone") {
    return <VoiceCloneNodeLayout id={id} data={data} selected={detailSelected} />;
  }
  if (data.nodeType === "voiceTTS") {
    return <VoiceTTSNodeLayout id={id} data={data} selected={detailSelected} runNode={runNode} />;
  }

  return (
    <>
      <div
        style={{ width: cardSize.w, ...(cardSize.h > 0 ? { height: cardSize.h } : {}), ...(visualGroupColor ? { borderColor: visualGroupColor, borderWidth: 2 } : {}) }}
        className={`relative rounded-xl border bg-white shadow-md shadow-black/5 dark:bg-[#101c29] dark:shadow-xl dark:shadow-black/20 ${cardSize.h > 0 ? "flex flex-col" : ""} ${detailSelected ? "border-[#030303] dark:border-cyan-400" : visualGroupColor ? "border-transparent" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        {isGenerating && (
          <div className="running-glow-wrapper" style={{ "--glow-color": GLOW_COLORS[data.nodeType] || "#22d3ee" } as React.CSSProperties} />
        )}
        {/* Group colour top strip */}
        {visualGroupColor && (
          <div className="rounded-t-xl h-1.5 w-full" style={{ background: visualGroupColor }} />
        )}
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        <div className="flex shrink-0 items-center gap-2 border-b border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#030303] dark:text-slate-100">{data.title}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#939393] dark:text-slate-500">{data.nodeType}</p>
          </div>
          {data.workflowLabel && (
            <span
              className="shrink-0 rounded-full bg-[#f3d88b] px-2 py-0.5 text-[10px] font-semibold text-[#5b4300]"
              title={data.workflowTitle || `Workflow ${data.workflowLabel}`}
            >
              #{data.workflowLabel}
            </span>
          )}
          <button onClick={e => { e.stopPropagation(); setSettingsOpen(true); }}
            className="nodrag mr-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-[#939393] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-cyan-300" title={t.settingsTitle}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><circle cx="16" cy="6" r="2.2" fill="currentColor" stroke="none"/><circle cx="16" cy="6" r="1.2" fill="white" stroke="none"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/><circle cx="8" cy="18" r="2.2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="1.2" fill="white" stroke="none"/>
            </svg>
          </button>
          {!isGenerating && <Badge status={data.status}/>}
        </div>
        <div className={`px-3 py-2 ${cardSize.h > 0 ? "flex-1 overflow-y-auto" : "min-h-20"}`}>
          <NodePreview node={node} t={t} onView={setViewUrl} onViewVideo={setViewVideoUrl} onAnnotate={setAnnotatingUrl}/>
          {isWaiting && !isGenerating && <p className="mt-2 text-[10px] text-sky-600 dark:text-sky-200">{t.waitingGeneration}</p>}
          {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
          {data.revisionOf && <p className="mt-2 text-[10px] text-violet-600 dark:text-violet-200">{t.revisionOf}</p>}
        </div>
        <div className="nodrag flex shrink-0 items-center justify-end gap-1 border-t border-[#e7eaf0] px-2 py-1.5 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-[#f0f1f3] hover:text-[#030303] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-200">{t.duplicate}</button>
          <button onClick={() => removeNode(id)} className="rounded px-1.5 py-1 text-[10px] text-[#676f7b] hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-200">{t.delete}</button>
          {RUNNABLE_TYPES.has(data.nodeType) && (
            <button
              onClick={(e) => { e.stopPropagation(); void runNode(id); }}
              disabled={isGenerating}
              className="ml-1 flex items-center gap-1 rounded-md bg-[#030303] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-[#1a1a1a] disabled:opacity-40 dark:bg-cyan-600 dark:hover:bg-cyan-500"
              title={t.runNode}
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.5v7l6-3.5z"/></svg>
              {t.runNode}
            </button>
          )}
        </div>
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400"/>
        {settingsOpen && <NodeSettingsPanel data={data} nodeId={id} onClose={() => setSettingsOpen(false)} />}
        <ResizeHandle onResize={(dx, dy) => setCardSize(prev => {
          const newW = Math.max(220, prev.w + dx);
          // Lock height into fixed mode on any downward intent; incremental deltas keep it smooth
          const newH = prev.h > 0
            ? Math.max(180, prev.h + dy)
            : dy > 0 ? Math.max(180, 240 + dy) : 0;
          return { w: newW, h: newH };
        })} />
      </div>
      {viewUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={() => setViewUrl("")}>
          <div className="max-h-full max-w-5xl" onClick={e => e.stopPropagation()}>
            <img src={viewUrl} alt="Full generated result" className="max-h-[80vh] max-w-full rounded-lg object-contain"/>
            <button onClick={() => setViewUrl("")} className="mx-auto mt-3 block rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">{t.close}</button>
          </div>
        </div>, document.body)}
      {viewVideoUrl && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/85 p-8" onClick={() => setViewVideoUrl("")}>
          <div className="flex max-h-full max-w-5xl flex-col items-center" onClick={e => e.stopPropagation()}>
            <video src={viewVideoUrl} controls autoPlay loop playsInline className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            <button onClick={() => setViewVideoUrl("")} className="mt-3 rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">{t.close}</button>
          </div>
        </div>, document.body)}
      {annotatingUrl && <ImageAnnotationEditor imageUrl={annotatingUrl} initialAnnotations={data.annotations as ImageAnnotation[] | undefined} initialInstruction={data.revisionInstruction} onClose={() => setAnnotatingUrl("")} onGenerate={(a, i) => { void createImageRevision(id, a, i); setAnnotatingUrl(""); }} />}
    </>
  );
}
