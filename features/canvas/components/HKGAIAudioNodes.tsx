"use client";

import { Handle, Position } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { createHKGAIVoice } from "@/features/canvas/services/hkgaiAudioClient";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import type { CanvasNodeData } from "@/shared/canvas";

const panel = "nodrag absolute left-1/2 top-[calc(100%+8px)] z-50 w-[580px] -translate-x-1/2 rounded-[24px] border border-[#3f3f46] bg-white p-5 shadow-2xl transition-all dark:border-cyan-400 dark:bg-[#101c29]";
const inputClass = "w-full rounded-xl border border-[#e7eaf0] bg-white px-3 py-2 text-xs text-[#030303] outline-none focus:border-[#030303] dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100 dark:focus:border-cyan-300";
const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#676f7b] dark:text-slate-400";
const primaryButton = "rounded-full bg-[#030303] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-45 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400";
const ghostButton = "rounded-full border border-[#d9dee8] px-3 py-2 text-xs font-semibold text-[#404040] transition hover:border-[#030303] disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-300";
const builtInVoices = [
  { id: "Mandarin_治愈女声", label: "Mandarin · Soothing female" },
  { id: "Mandarin_沉稳男声", label: "Mandarin · Calm male" },
  { id: "Cantonese_暖心师奶", label: "Cantonese · Warm female" },
  { id: "English_元气女声", label: "English · Energetic female" },
];
const sections = ["[intro]", "[verse]", "[chorus]", "[bridge]", "[inst]", "[outro]"];

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const audioUrlFrom = (data: CanvasNodeData) => {
  const output = record(data.output?.value);
  return text(output.audioUrl) || text(output.url) || text(output.resultUrl) || data.audioUrl || "";
};

function NodeShell({ id, data, selected, title, subtitle, children }: { id: string; data: CanvasNodeData; selected: boolean; title: string; subtitle: string; children: React.ReactNode }) {
  const removeNode = useCanvasStore((state) => state.removeNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const isRunning = data.status === "running" || data.status === "waiting";
  return (
    <div className={`relative flex h-[280px] w-[390px] flex-col rounded-[24px] border bg-white shadow-sm dark:bg-[#101c29] ${selected ? "border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
      {isRunning && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": "#f5510b" } as React.CSSProperties} />}
      <div className="absolute -top-8 left-1 text-[20px] font-bold text-[#030303] dark:text-slate-100">{title}</div>
      <Handle type="target" id="text" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#f59e0b] dark:!border-[#101c29]" />
      <Handle type="source" id="audio" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#f5510b] dark:!border-[#101c29]" />
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f5510b]">{subtitle}</p>
        {children}
        {data.error && <p className="mt-2 line-clamp-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
      </div>
      <div className="nodrag flex justify-end gap-3 border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
        <button onClick={() => duplicateNode(id)} className="text-[10px] text-[#676f7b] hover:text-[#030303] dark:text-slate-400">Duplicate</button>
        <button onClick={() => removeNode(id)} className="text-[10px] text-[#676f7b] hover:text-rose-600 dark:text-slate-400">Delete</button>
      </div>
    </div>
  );
}

export function MusicGenerationNodeLayout({ id, data, selected, runNode }: { id: string; data: CanvasNodeData; selected: boolean; runNode(id: string): Promise<void> }) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const isRunning = data.status === "running" || data.status === "waiting";
  const audioUrl = audioUrlFrom(data);
  const appendSection = (section: string) => updateNodeData(id, { prompt: `${data.prompt?.trim() ? `${data.prompt.trim()}\n` : ""}${section};` });
  return (
    <>
      <NodeShell id={id} data={data} selected={selected} title="HKGAI Music" subtitle="Structured music generation">
        <p className="mt-3 truncate text-sm font-bold text-[#030303] dark:text-slate-100">{data.musicName || "mindverse_track"}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#676f7b] dark:text-slate-400">{data.musicTags || "Add genre, mood and vocal tags"}</p>
        <div className="mt-auto">{audioUrl ? <audio controls src={audioUrl} className="w-full" /> : <div className="rounded-2xl border border-dashed border-[#c9ccd1] px-3 py-5 text-center text-[11px] text-[#676f7b] dark:border-slate-700 dark:text-slate-400">48 kHz stereo WAV will appear here</div>}</div>
      </NodeShell>
      <div className={`${panel} ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <div className="grid grid-cols-[180px_1fr] gap-3">
          <label><span className={labelClass}>Track name</span><input className={inputClass} value={data.musicName || ""} maxLength={80} onChange={(event) => updateNodeData(id, { musicName: event.target.value })} /></label>
          <label><span className={labelClass}>Tags</span><input className={inputClass} value={data.musicTags || ""} placeholder="folk, mid tempo, warm, female" onChange={(event) => updateNodeData(id, { musicTags: event.target.value })} /></label>
        </div>
        <label className="mt-3 block"><span className={labelClass}>Song structure / lyrics</span><textarea className={`${inputClass} min-h-36 resize-y font-mono leading-5`} value={data.prompt || ""} placeholder="[intro];[verse] ...;[chorus] ...;[outro];" onChange={(event) => updateNodeData(id, { prompt: event.target.value })} /></label>
        <div className="mt-2 flex flex-wrap gap-1.5">{sections.map((section) => <button key={section} className="rounded-full bg-[#fff1e9] px-2.5 py-1 text-[10px] font-semibold text-[#b93800] dark:bg-orange-400/10 dark:text-orange-200" onClick={() => appendSection(section)}>{section}</button>)}</div>
        <div className="mt-4 flex items-center justify-between"><p className="text-[10px] text-[#676f7b] dark:text-slate-400">Separate sections with semicolons. The API does not currently expose a duration setting.</p><button className={primaryButton} disabled={isRunning || !data.musicTags?.trim() || !data.prompt?.trim()} onClick={() => void runNode(id)}>{isRunning ? "Generating..." : "Generate music"}</button></div>
      </div>
    </>
  );
}

export function HKGAITTSNodeLayout({ id, data, selected, runNode }: { id: string; data: CanvasNodeData; selected: boolean; runNode(id: string): Promise<void> }) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const connected = useMemo(() => edges.some((edge) => edge.target === id && (edge.targetHandle === "text" || !edge.targetHandle)), [edges, id]);
  const isRunning = data.status === "running" || data.status === "waiting";
  const audioUrl = audioUrlFrom(data);
  const usingBuiltIn = builtInVoices.some((item) => item.id === data.voice);
  const voiceLabel = builtInVoices.find((item) => item.id === data.voice)?.label || data.voice;

  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const uploadVoice = async () => {
    if (!file) return updateNodeData(id, { error: "Select a 1–30 second reference audio file no larger than 10 MB." });
    setUploading(true);
    updateNodeData(id, { error: undefined, referenceAudioName: file.name });
    try {
      const result = await createHKGAIVoice({ audio: file, refText: data.transcript, language: data.language, consentConfirmed: data.consentConfirmed === true });
      updateNodeData(id, { voice: result.voiceId, status: "idle", error: undefined });
    } catch (error) {
      updateNodeData(id, { error: error instanceof Error ? error.message : "HKGAI voice upload failed." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <NodeShell id={id} data={data} selected={selected} title="HKGAI TTS" subtitle="Voice synthesis">
        <div className="mt-3 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${data.voice ? "bg-emerald-500" : "bg-slate-300"}`} /><p className="truncate text-sm font-bold text-[#030303] dark:text-slate-100">{voiceLabel || "No voice selected"}</p></div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#676f7b] dark:text-slate-400">{data.ttsInstructions || "Natural speech"}</p>
        <div className="mt-auto">{audioUrl ? <audio controls src={audioUrl} className="w-full" /> : <div className="rounded-2xl border border-dashed border-[#c9ccd1] px-3 py-5 text-center text-[11px] text-[#676f7b] dark:border-slate-700 dark:text-slate-400">{connected ? "Connected text will be used when the editor is empty" : "Synthesized WAV will appear here"}</div>}</div>
      </NodeShell>
      <div className={`${panel} ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        {data.ttsMode === "advanced" && <label className="mb-4 block"><span className={labelClass}>Text-to-Speech type</span><select className={inputClass} value="advanced" onChange={(event) => {
          if (event.target.value !== "quick") return;
          updateNodeData(id, { nodeType: "audio", title: "Audio* Text-to-Speech", ttsMode: "quick", prompt: data.ttsText || "", model: "TTS" });
        }}><option value="quick">Quick TTS</option><option value="advanced">Advanced TTS (HKGAI)</option></select></label>}
        <label><span className={labelClass}>Text</span><textarea className={`${inputClass} min-h-24 resize-y`} value={data.ttsText || ""} placeholder="Leave blank to use connected upstream text" onChange={(event) => updateNodeData(id, { ttsText: event.target.value })} /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label><span className={labelClass}>Built-in voice</span><select className={inputClass} value={usingBuiltIn ? data.voice : ""} onChange={(event) => updateNodeData(id, { voice: event.target.value })}><option value="">Custom voice_id</option>{builtInVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label>
          <label><span className={labelClass}>Voice ID</span><input className={inputClass} value={data.voice || ""} placeholder="voice_xxx" onChange={(event) => updateNodeData(id, { voice: event.target.value })} /></label>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_150px] gap-3">
          <label><span className={labelClass}>Instructions</span><input className={inputClass} value={data.ttsInstructions || ""} placeholder="Warm, natural, and conversational" onChange={(event) => updateNodeData(id, { ttsInstructions: event.target.value })} /></label>
          <label><span className={labelClass}>Reference language</span><select className={inputClass} value={data.language || "auto"} onChange={(event) => updateNodeData(id, { language: event.target.value })}>{["auto", "mandarin", "cantonese", "english"].map((language) => <option key={language} value={language}>{language}</option>)}</select></label>
        </div>
        <div className="mt-4 rounded-2xl border border-[#e7eaf0] bg-[#fafafa] p-3 dark:border-slate-700 dark:bg-[#0c1622]">
          <div className="grid grid-cols-2 gap-3"><label><span className={labelClass}>Reference audio (optional)</span><input className={inputClass} type="file" accept="audio/*,.wav,.mp3,.m4a,.flac" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><label><span className={labelClass}>Exact transcript (optional)</span><input className={inputClass} value={data.transcript || ""} onChange={(event) => updateNodeData(id, { transcript: event.target.value })} /></label></div>
          {previewUrl && <audio controls src={previewUrl} className="mt-3 w-full" />}
          <label className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-[#404040] dark:text-slate-200"><input className="mt-0.5" type="checkbox" checked={data.consentConfirmed === true} onChange={(event) => updateNodeData(id, { consentConfirmed: event.target.checked })} /><span>I confirm that I have explicit authorization from the voice owner to use this recording to create a synthetic voice.</span></label>
          <button className={`${ghostButton} mt-3`} disabled={!file || !data.consentConfirmed || uploading} onClick={() => void uploadVoice()}>{uploading ? "Uploading..." : "Create reference voice"}</button>
        </div>
        <div className="mt-4 flex items-center justify-between"><label className="flex items-center gap-2 text-xs text-[#404040] dark:text-slate-200"><input type="checkbox" checked={data.xVectorOnly !== false} onChange={(event) => updateNodeData(id, { xVectorOnly: event.target.checked })} />x_vector_only</label><button className={primaryButton} disabled={isRunning || !data.voice?.trim() || (!data.ttsText?.trim() && !connected)} onClick={() => void runNode(id)}>{isRunning ? "Generating..." : "Generate speech"}</button></div>
      </div>
    </>
  );
}
