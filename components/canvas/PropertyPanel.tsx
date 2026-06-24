"use client";
import { useMemo } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCanvasStore } from "@/store/canvasStore";
import { useLang } from "@/components/LangProvider";
import type { CanvasNodeData } from "@/types/canvas";
import type { Strings } from "@/lib/i18n/strings";

type Field = { key: keyof CanvasNodeData; label: string; kind?: "textarea" | "number" | "select"; options?: string[] };

function buildFields(t: Strings): Record<string, Field[]> {
  return {
    prompt: [{ key: "title", label: t.fieldTitle }, { key: "prompt", label: t.fieldPrompt, kind: "textarea" }, { key: "negativePrompt", label: t.fieldNegativePrompt, kind: "textarea" }, { key: "style", label: t.fieldStyle }, { key: "aspectRatio", label: t.fieldAspectRatio, kind: "select", options: ["1:1", "16:9", "9:16", "4:5"] }],
    text: [{ key: "title", label: t.fieldTitle }, { key: "instruction", label: t.fieldInstruction, kind: "textarea" }, { key: "inputText", label: t.fieldInputText, kind: "textarea" }, { key: "model", label: t.fieldModel }, { key: "temperature", label: t.fieldTemperature, kind: "number" }],
    script: [{ key: "title", label: t.fieldTitle }, { key: "storyBrief", label: t.fieldCreativeBrief, kind: "textarea" }, { key: "scriptTone", label: t.fieldTone }, { key: "numberOfScenes", label: t.fieldSceneCount, kind: "number" }, { key: "model", label: t.fieldModel }],
    image: [{ key: "title", label: t.fieldTitle }, { key: "prompt", label: t.fieldImagePrompt, kind: "textarea" }, { key: "model", label: t.fieldModelNote }, { key: "size", label: t.fieldSize, kind: "select", options: ["1024x1024", "1536x1024", "1024x1536", "auto"] }],
    video: [{ key: "title", label: t.fieldTitle }, { key: "videoProvider", label: t.fieldVideoProvider, kind: "select", options: ["", "mock", "302ai", "302-sora2", "tokenstar", "kling"] }, { key: "prompt", label: t.fieldMotionPrompt, kind: "textarea" }, { key: "referenceImageUrl", label: t.fieldFirstFrameUrl }, { key: "model", label: t.fieldModelKlingNote }, { key: "tokenstarMode", label: t.fieldTokenstarMode, kind: "select", options: ["text-to-video", "asset-video"] }, { key: "referenceImageAssetUrl", label: t.fieldImageAssetUrl, kind: "textarea" }, { key: "referenceVideoAssetUrl", label: t.fieldVideoAssetUrl, kind: "textarea" }, { key: "referenceAudioAssetUrl", label: t.fieldAudioAssetUrl, kind: "textarea" }, { key: "videoInputMode", label: t.field302Mode, kind: "select", options: ["text-to-video", "image-to-video"] }, { key: "duration", label: t.fieldDuration, kind: "number" }, { key: "resolution", label: t.fieldResolution }, { key: "fps", label: t.fieldFps }, { key: "aspectRatio", label: t.fieldAspectRatio, kind: "select", options: ["16:9", "9:16", "1:1"] }, { key: "generateAudio", label: t.fieldGenerateAudio, kind: "select", options: ["true", "false"] }],
    audio: [{ key: "title", label: t.fieldTitle }, { key: "prompt", label: t.fieldAudioPrompt, kind: "textarea" }, { key: "model", label: t.fieldModel }, { key: "voice", label: t.fieldVoice }, { key: "emotion", label: t.fieldEmotion }, { key: "volume", label: t.fieldVolume, kind: "number" }, { key: "duration", label: t.fieldDurationSec, kind: "number" }],
    storyboard: [{ key: "title", label: t.fieldTitle }, { key: "storyBrief", label: t.fieldStoryBrief, kind: "textarea" }, { key: "targetShotCount", label: t.fieldShotCount, kind: "number" }, { key: "model", label: t.fieldModel }],
    storyboardImage: [{ key: "title", label: t.fieldTitle }, { key: "aspectRatio", label: t.fieldAspectRatio, kind: "select", options: ["16:9", "9:16", "1:1"] }, { key: "negativePrompt", label: t.fieldNegativePrompt, kind: "textarea" }],
    reference: [{ key: "title", label: t.fieldTitle }, { key: "notes", label: t.fieldNotes, kind: "textarea" }],
    output: [{ key: "title", label: t.fieldTitle }, { key: "format", label: t.fieldFormat, kind: "select", options: ["Creative package", "Storyboard package", "Campaign brief", "Production sheet", "JSON"] }],
  };
}

export function PropertyPanel() {
  const { nodes, selectedNodeId, updateNodeData, createKeyframeBatch } = useCanvasStore();
  const { t } = useLang();
  const node = nodes.find((item) => item.id === selectedNodeId);
  const fields = useMemo(() => buildFields(t), [t]);

  if (!node) return (
    <aside className="w-72 shrink-0 border-l border-[#e7eaf0] bg-white p-4 dark:border-slate-800 dark:bg-[#0c1622]">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#939393] dark:text-slate-500">{t.inspector}</p>
      <p className="mt-5 text-sm leading-6 text-[#676f7b] dark:text-slate-500">{t.inspectorHint}</p>
    </aside>
  );

  const change = (key: keyof CanvasNodeData, value: string) =>
    updateNodeData(node.id, {
      [key]: key === "duration" || key === "numberOfScenes" || key === "targetShotCount" || key === "temperature" || key === "volume"
        ? Number(value) : key === "generateAudio" ? value === "true" : value,
    });

  const prompts = Array.isArray((node.data.output?.value as { prompts?: unknown })?.prompts)
    ? (node.data.output?.value as { prompts: unknown[] }).prompts : [];

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-[#e7eaf0] bg-white p-4 dark:border-slate-800 dark:bg-[#0c1622]">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#939393] dark:text-slate-500">{t.inspector}</p>
      <div className="mt-4 space-y-4">
        {fields[node.data.nodeType]?.map((field) => (
          <label className="block" key={field.key}>
            <span className="mb-1.5 block text-xs text-[#676f7b] dark:text-slate-400">{field.label}</span>
            {field.kind === "textarea" ? (
              <Textarea value={String(node.data[field.key] ?? "")} onChange={(event) => change(field.key, event.target.value)} />
            ) : field.kind === "select" ? (
              <Select value={String(node.data[field.key] ?? "")} onChange={(event) => change(field.key, event.target.value)}>
                {field.options?.map((option) => <option key={option}>{option || t.serverDefault}</option>)}
              </Select>
            ) : (
              <Input type={field.kind === "number" ? "number" : "text"} value={String(node.data[field.key] ?? "")} onChange={(event) => change(field.key, event.target.value)} />
            )}
          </label>
        ))}
      </div>
      {node.data.nodeType === "storyboardImage" && (
        <button
          type="button"
          disabled={!prompts.length}
          onClick={() => createKeyframeBatch(node.id)}
          className="mt-5 w-full rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-40 dark:border-violet-400/60 dark:bg-violet-400/10 dark:text-violet-100"
        >
          {t.generateKeyframes(prompts.length || 0)}
        </button>
      )}
      {node.data.output && (
        <div className="mt-6 border-t border-[#e7eaf0] pt-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#939393] dark:text-slate-500">{t.lastOutput}</p>
          <p className="mt-2 text-xs leading-5 text-[#404040] dark:text-slate-300">{node.data.output.summary}</p>
        </div>
      )}
    </aside>
  );
}
