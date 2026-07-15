"use client";

import { Handle, Position } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { createQwenVoice, deleteQwenVoice, listQwenVoices } from "@/features/canvas/services/qwenClient";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { DEFAULT_QWEN_VOICE_MODEL, DEFAULT_QWEN_VOICE_PROVIDER, qwenTtsLanguageTypes, qwenVoiceLanguageCodes, type ClonedVoice, type CreateVoiceResult } from "@/shared/api/qwenContracts";
import type { CanvasNodeData, NodeOutput } from "@/shared/canvas";

const panel = "nodrag absolute left-1/2 top-[calc(100%+8px)] z-50 w-[560px] -translate-x-1/2 rounded-[24px] border border-[#3f3f46] bg-white p-5 shadow-2xl transition-all dark:border-cyan-400 dark:bg-[#101c29]";
const inputClass = "w-full rounded-xl border border-[#e7eaf0] bg-white px-3 py-2 text-xs text-[#030303] outline-none focus:border-[#030303] dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100 dark:focus:border-cyan-300";
const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#676f7b] dark:text-slate-400";
const buttonClass = "rounded-full bg-[#030303] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#1a1a1a] disabled:opacity-45 dark:bg-cyan-500 dark:text-[#030303] dark:hover:bg-cyan-400";
const ghostButtonClass = "rounded-full border border-[#d9dee8] px-3 py-2 text-xs font-semibold text-[#404040] transition hover:border-[#030303] dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-300";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

const voiceOutput = (result: CreateVoiceResult & { language?: string }): NodeOutput => ({
  kind: "clonedVoice",
  summary: `Cloned voice ready: ${result.voice}`,
  value: {
    kind: "clonedVoice",
    provider: "qwencloud",
    voiceProvider: result.voiceProvider || DEFAULT_QWEN_VOICE_PROVIDER,
    voice: result.voice,
    targetModel: result.targetModel,
    language: result.language,
    fallbackMode: result.fallbackMode,
    fallbackReason: result.fallbackReason,
  },
  createdAt: new Date().toISOString(),
});

const audioUrlFromOutput = (data: CanvasNodeData) => {
  const value = record(data.output?.value);
  return text(value.audioUrl) || text(value.url) || text(value.resultUrl) || data.audioUrl || "";
};

const requestDownload = async (url: string) => {
  const filename = `qwen-cloned-voice-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Audio download failed.");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

function VoiceSelect({ voices, value, onSelect }: { voices: ClonedVoice[]; value?: string; onSelect(voice: ClonedVoice): void }) {
  return (
    <select
      className={inputClass}
      value={value || ""}
      onChange={(event) => {
        const selected = voices.find((item) => item.voice === event.target.value);
        if (selected) onSelect(selected);
      }}
    >
      <option value="">Select voice...</option>
      {voices.map((item) => <option key={item.voice} value={item.voice}>{item.voice}</option>)}
    </select>
  );
}

export function VoiceCloneNodeLayout({ id, data, selected }: { id: string; data: CanvasNodeData; selected: boolean }) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const removeNode = useCanvasStore((state) => state.removeNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [working, setWorking] = useState(false);
  const connected = new Set(edges.filter((edge) => edge.target === id).map((edge) => edge.targetHandle || ""));
  const isRunning = data.status === "running" || data.status === "waiting";

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const refreshVoices = async () => {
    setLoadingVoices(true);
    try {
      setVoices(await listQwenVoices());
    } catch (error) {
      updateNodeData(id, { error: error instanceof Error ? error.message : "Voice list failed." });
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    if (selected && !voices.length) void refreshVoices();
  }, [selected]);

  const applyVoice = (voice: ClonedVoice | (CreateVoiceResult & { language?: string })) => {
    const normalized = {
      voice: voice.voice,
      targetModel: voice.targetModel || DEFAULT_QWEN_VOICE_MODEL,
      voiceProvider: voice.voiceProvider || DEFAULT_QWEN_VOICE_PROVIDER,
      language: voice.language,
      fallbackMode: "fallbackMode" in voice ? voice.fallbackMode : false,
      fallbackReason: "fallbackReason" in voice ? voice.fallbackReason : undefined,
    };
    updateNodeData(id, {
      voice: normalized.voice,
      targetModel: normalized.targetModel,
      voiceProvider: normalized.voiceProvider,
      language: normalized.language,
      fallbackMode: normalized.fallbackMode,
      fallbackReason: normalized.fallbackReason,
      status: "success",
      error: undefined,
      output: voiceOutput(normalized),
    });
  };

  const createVoice = async () => {
    if (!file) {
      updateNodeData(id, { status: "error", error: "Upload authorized reference audio first." });
      return;
    }
    setWorking(true);
    updateNodeData(id, { status: "running", error: undefined, referenceAudioName: file.name });
    try {
      const result = await createQwenVoice({
        audio: file,
        preferredName: data.preferredName || "voice_1",
        targetModel: data.targetModel || DEFAULT_QWEN_VOICE_MODEL,
        text: data.transcript,
        language: data.language,
        consentConfirmed: data.consentConfirmed === true,
      });
      applyVoice({ ...result, language: data.language });
      void refreshVoices();
    } catch (error) {
      updateNodeData(id, { status: "error", error: error instanceof Error ? error.message : "Voice clone failed." });
    } finally {
      setWorking(false);
    }
  };

  const deleteCurrentVoice = async () => {
    if (!data.voice || !window.confirm(`Delete cloned voice ${data.voice}?`)) return;
    setWorking(true);
    try {
      await deleteQwenVoice(data.voice);
      updateNodeData(id, { voice: "", status: "idle", output: undefined, fallbackMode: undefined, fallbackReason: undefined });
      await refreshVoices();
    } catch (error) {
      updateNodeData(id, { error: error instanceof Error ? error.message : "Voice delete failed." });
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <div className={`relative flex h-[260px] w-[380px] flex-col rounded-[24px] border bg-white shadow-sm dark:bg-[#101c29] ${selected ? "border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        {isRunning && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": "#14b8a6" } as React.CSSProperties} />}
        <div className="absolute -top-8 left-1 text-[20px] font-bold text-[#030303] dark:text-slate-100">Voice Clone</div>
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#030303] dark:!border-[#101c29] dark:!bg-cyan-400" />
        <Handle type="source" id="voice" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#14b8a6] dark:!border-[#101c29]" />
        <div className="flex flex-1 flex-col justify-between p-5">
          <div>
            <p className="truncate text-sm font-bold text-[#030303] dark:text-slate-100">{data.voice || data.preferredName || "New cloned voice"}</p>
            <p className="mt-1 text-[11px] text-[#676f7b] dark:text-slate-400">{data.targetModel || DEFAULT_QWEN_VOICE_MODEL}</p>
            {data.fallbackMode && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">{data.fallbackReason || "QwenCloud used fallback voice mode."}</p>}
            {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
          </div>
          {previewUrl ? <audio controls src={previewUrl} className="w-full" /> : <div className="rounded-2xl border border-dashed border-[#c9ccd1] px-3 py-5 text-center text-[11px] text-[#676f7b] dark:border-slate-700 dark:text-slate-400">Reference audio</div>}
        </div>
        <div className="nodrag flex justify-end gap-1 border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="text-[10px] text-[#676f7b] hover:text-[#030303] dark:text-slate-400">Duplicate</button>
          <button onClick={() => removeNode(id)} className="text-[10px] text-[#676f7b] hover:text-rose-600 dark:text-slate-400">Delete</button>
        </div>
      </div>

      <div className={`${panel} ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={labelClass}>Preferred name</span>
            <input className={inputClass} value={data.preferredName || ""} maxLength={16} onChange={(event) => updateNodeData(id, { preferredName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
          </label>
          <label>
            <span className={labelClass}>Language</span>
            <select className={inputClass} value={data.language || "zh"} onChange={(event) => updateNodeData(id, { language: event.target.value })}>
              {qwenVoiceLanguageCodes.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 block">
          <span className={labelClass}>Reference audio</span>
          <input className={inputClass} type="file" accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/x-m4a,video/mp4,.wav,.mp3,.m4a,.mp4" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <label className="mt-3 block">
          <span className={labelClass}>Exact transcript (optional)</span>
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={data.transcript || ""}
            placeholder="Leave blank unless it exactly matches the reference audio."
            onChange={(event) => updateNodeData(id, { transcript: event.target.value })}
          />
          <span className="mt-1 block text-[10px] text-[#676f7b] dark:text-slate-400">Server sends this only when QWEN_VOICE_CLONE_SEND_TRANSCRIPT=true.</span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#404040] dark:text-slate-200">
          <input className="mt-1" type="checkbox" checked={data.consentConfirmed === true} onChange={(event) => updateNodeData(id, { consentConfirmed: event.target.checked })} />
          <span>我确认已获得该声音所有者的明确授权，并有权使用该录音创建合成声音。</span>
        </label>
        <div className="mt-4 flex items-center gap-2">
          <button className={buttonClass} disabled={working || !data.consentConfirmed} onClick={() => void createVoice()}>{working ? "Working..." : "Create voice"}</button>
          <button className={ghostButtonClass} disabled={loadingVoices} onClick={() => void refreshVoices()}>{loadingVoices ? "Refreshing..." : "Refresh"}</button>
          <button className={ghostButtonClass} disabled={!data.voice || working} onClick={() => void deleteCurrentVoice()}>Delete selected</button>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <VoiceSelect voices={voices} value={data.voice} onSelect={applyVoice} />
          <button
            className={ghostButtonClass}
            disabled={!data.voice}
            onClick={() => data.voice && navigator.clipboard?.writeText(data.voice)}
          >
            Copy ID
          </button>
        </div>
        {connected.size > 0 && <p className="mt-2 text-[10px] text-[#676f7b] dark:text-slate-400">Connected handles: {[...connected].join(", ")}</p>}
      </div>
    </>
  );
}

export function VoiceTTSNodeLayout({ id, data, selected, runNode }: { id: string; data: CanvasNodeData; selected: boolean; runNode(id: string): Promise<void> }) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const edges = useCanvasStore((state) => state.edges);
  const removeNode = useCanvasStore((state) => state.removeNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const connectedHandles = useMemo(() => new Set(edges.filter((edge) => edge.target === id).map((edge) => edge.targetHandle || "")), [edges, id]);
  const isRunning = data.status === "running" || data.status === "waiting";
  const audioUrl = audioUrlFromOutput(data);
  const outputValue = record(data.output?.value);
  const originalAudioUrl = text(outputValue.originalAudioUrl);
  const expiresAt = Number(outputValue.expiresAt || data.expiresAt);
  const textLength = Array.from(data.ttsText || "").length;

  const refreshVoices = async () => {
    setLoadingVoices(true);
    try {
      setVoices(await listQwenVoices());
    } catch (error) {
      updateNodeData(id, { error: error instanceof Error ? error.message : "Voice list failed." });
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    if (selected && !voices.length) void refreshVoices();
  }, [selected]);

  const selectVoice = (voice: ClonedVoice) => updateNodeData(id, {
    voice: voice.voice,
    targetModel: voice.targetModel || DEFAULT_QWEN_VOICE_MODEL,
    voiceProvider: voice.voiceProvider || DEFAULT_QWEN_VOICE_PROVIDER,
    language: voice.language,
  });

  return (
    <>
      <div className={`relative flex h-[260px] w-[380px] flex-col rounded-[24px] border bg-white shadow-sm dark:bg-[#101c29] ${selected ? "border-[#030303] dark:border-cyan-400" : "border-[#e7eaf0] dark:border-slate-700"}`}>
        {isRunning && <div className="running-glow-wrapper !rounded-[24px]" style={{ "--glow-color": "#f5510b" } as React.CSSProperties} />}
        <div className="absolute -top-8 left-1 text-[20px] font-bold text-[#030303] dark:text-slate-100">Cloned Voice TTS</div>
        <div className="absolute -left-[135px] top-[78px] flex flex-col gap-9">
          <div className="flex w-[120px] items-center justify-end gap-3">
            <span className={`text-[13px] font-bold text-[#030303] transition-opacity dark:text-slate-200 ${selected ? "opacity-100" : "opacity-0"}`}>Text</span>
            <div className={`relative h-[18px] w-[18px] rounded-full border-[2.5px] border-[#f59e0b] ${connectedHandles.has("text") ? "bg-[#f59e0b]" : "bg-white dark:bg-[#101c29]"}`}>
              <Handle type="target" id="text" position={Position.Left} className="!absolute !inset-0 !m-auto !h-[26px] !w-[26px] !border-0 !bg-transparent !transform-none opacity-0" />
            </div>
          </div>
          <div className="flex w-[120px] items-center justify-end gap-3">
            <span className={`text-[13px] font-bold text-[#030303] transition-opacity dark:text-slate-200 ${selected ? "opacity-100" : "opacity-0"}`}>Voice</span>
            <div className={`relative h-[18px] w-[18px] rounded-full border-[2.5px] border-[#14b8a6] ${connectedHandles.has("voice") ? "bg-[#14b8a6]" : "bg-white dark:bg-[#101c29]"}`}>
              <Handle type="target" id="voice" position={Position.Left} className="!absolute !inset-0 !m-auto !h-[26px] !w-[26px] !border-0 !bg-transparent !transform-none opacity-0" />
            </div>
          </div>
        </div>
        <Handle type="source" id="audio" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#f5510b] dark:!border-[#101c29]" />
        <div className="flex flex-1 flex-col justify-between p-5">
          <div>
            <p className="truncate text-sm font-bold text-[#030303] dark:text-slate-100">{data.voice || "No voice selected"}</p>
            <p className="mt-1 text-[11px] text-[#676f7b] dark:text-slate-400">{data.targetModel || DEFAULT_QWEN_VOICE_MODEL}</p>
            {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{data.error}</p>}
          </div>
          {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : <div className="rounded-2xl border border-dashed border-[#c9ccd1] px-3 py-5 text-center text-[11px] text-[#676f7b] dark:border-slate-700 dark:text-slate-400">AI 合成声音</div>}
        </div>
        <div className="nodrag flex justify-end gap-1 border-t border-[#e7eaf0] px-3 py-2 dark:border-slate-800">
          <button onClick={() => duplicateNode(id)} className="text-[10px] text-[#676f7b] hover:text-[#030303] dark:text-slate-400">Duplicate</button>
          <button onClick={() => removeNode(id)} className="text-[10px] text-[#676f7b] hover:text-rose-600 dark:text-slate-400">Delete</button>
        </div>
      </div>

      <div className={`${panel} ${selected ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <label className="block">
          <span className={labelClass}>Text</span>
          <textarea
            className={`${inputClass} min-h-28 resize-y`}
            value={data.ttsText || ""}
            maxLength={600}
            onChange={(event) => updateNodeData(id, { ttsText: event.target.value })}
            placeholder="留空时使用上游文本"
          />
          <span className="mt-1 block text-right text-[10px] text-[#676f7b] dark:text-slate-500">{textLength}/600</span>
        </label>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <VoiceSelect voices={voices} value={data.voice} onSelect={selectVoice} />
          <button className={ghostButtonClass} disabled={loadingVoices} onClick={() => void refreshVoices()}>{loadingVoices ? "Refreshing..." : "Refresh"}</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span className={labelClass}>Target model</span>
            <input className={inputClass} value={data.targetModel || DEFAULT_QWEN_VOICE_MODEL} onChange={(event) => updateNodeData(id, { targetModel: event.target.value })} />
          </label>
          <label>
            <span className={labelClass}>Language type</span>
            <select className={inputClass} value={data.languageType || "Auto"} onChange={(event) => updateNodeData(id, { languageType: event.target.value as CanvasNodeData["languageType"] })}>
              {qwenTtsLanguageTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button className={buttonClass} disabled={isRunning} onClick={() => void runNode(id)}>{isRunning ? "Generating..." : "Generate"}</button>
          <button className={ghostButtonClass} disabled={!audioUrl} onClick={() => audioUrl && window.open(audioUrl, "_blank", "noopener,noreferrer")}>Open URL</button>
          <button className={ghostButtonClass} disabled={!audioUrl} onClick={() => audioUrl && void requestDownload(audioUrl)}>Download</button>
        </div>
        {audioUrl && (
          <p className="mt-3 text-[10px] leading-4 text-amber-700 dark:text-amber-200">
            QwenCloud generated audio link is temporary{expiresAt ? `, expires at ${new Date(expiresAt * 1000).toLocaleString()}` : ""}.{originalAudioUrl ? " The node output is archived to media storage." : ""}
          </p>
        )}
      </div>
    </>
  );
}
