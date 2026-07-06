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
    image: [{ key: "title", label: t.fieldTitle }, { key: "prompt", label: t.fieldImagePrompt, kind: "textarea" }, { key: "model", label: t.fieldModelNote, kind: "select", options: ["gpt-image-2", "gpt-image-2(tokenstar)", "nano banana(tokenstar)", "gemini-3.1-flash-image-preview"] }, { key: "size", label: t.fieldSize, kind: "select", options: ["1024x1024", "1536x1024", "1024x1536", "2048x2048", "auto"] }],
    video: [{ key: "title", label: t.fieldTitle }, { key: "videoProvider", label: t.fieldVideoProvider, kind: "select", options: ["kling", "302ai", "tokenstar"] }, { key: "prompt", label: t.fieldMotionPrompt, kind: "textarea" }, { key: "referenceImageUrl", label: t.fieldFirstFrameUrl }, { key: "model", label: t.fieldModelKlingNote }, { key: "klingMode", label: t.fieldKlingMode, kind: "select", options: ["image-to-video", "reference-image", "text-to-video", "omni"] }, { key: "klingElementId", label: t.fieldKlingElementId }, { key: "referenceVideoUrl", label: t.fieldReferenceVideoUrl }, { key: "tokenstarMode", label: t.fieldTokenstarMode, kind: "select", options: ["text-to-video", "asset-video", "kling-image", "kling-text", "kling-omni"] }, { key: "referenceImageAssetUrl", label: t.fieldImageAssetUrl, kind: "textarea" }, { key: "referenceVideoAssetUrl", label: t.fieldVideoAssetUrl, kind: "textarea" }, { key: "referenceAudioAssetUrl", label: t.fieldAudioAssetUrl, kind: "textarea" }, { key: "videoInputMode", label: t.field302Mode, kind: "select", options: ["text-to-video", "image-to-video"] }, { key: "duration", label: t.fieldDuration, kind: "number" }, { key: "resolution", label: t.fieldResolution }, { key: "fps", label: t.fieldFps }, { key: "aspectRatio", label: t.fieldAspectRatio, kind: "select", options: ["16:9", "9:16", "1:1"] }, { key: "generateAudio", label: t.fieldGenerateAudio, kind: "select", options: ["true", "false"] }],
    audio: [{ key: "title", label: t.fieldTitle }, { key: "prompt", label: t.fieldAudioPrompt, kind: "textarea" }, { key: "model", label: t.fieldModel }, { key: "voice", label: t.fieldVoice }, { key: "emotion", label: t.fieldEmotion }, { key: "volume", label: t.fieldVolume, kind: "number" }, { key: "duration", label: t.fieldDurationSec, kind: "number" }],
    storyboard: [{ key: "title", label: t.fieldTitle }, { key: "storyBrief", label: t.fieldStoryBrief, kind: "textarea" }, { key: "targetShotCount", label: t.fieldShotCount, kind: "number" }, { key: "model", label: t.fieldModel }],
    storyboardImage: [{ key: "title", label: t.fieldTitle }, { key: "aspectRatio", label: t.fieldAspectRatio, kind: "select", options: ["16:9", "9:16", "1:1"] }, { key: "negativePrompt", label: t.fieldNegativePrompt, kind: "textarea" }],
    reference: [{ key: "title", label: t.fieldTitle }, { key: "notes", label: t.fieldNotes, kind: "textarea" }],
    output: [{ key: "title", label: t.fieldTitle }, { key: "format", label: t.fieldFormat, kind: "select", options: ["Creative package", "Storyboard package", "Campaign brief", "Production sheet", "JSON"] }],
  };
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

function ScriptOutputPreview({ value }: { value: unknown }) {
  const details = record(value);
  const scenes = Array.isArray(details.scenes) ? details.scenes : [];
  return (
    <div className="mt-3 space-y-3">
      {text(details.title) && <p className="text-sm font-semibold text-[#030303] dark:text-slate-100">{text(details.title)}</p>}
      {text(details.logline) && <p className="text-xs leading-5 text-[#404040] dark:text-slate-300">{text(details.logline)}</p>}
      {scenes.map((scene, index) => {
        const item = record(scene);
        const dialogue = Array.isArray(item.dialogue) ? item.dialogue.filter((line): line is string => typeof line === "string") : [];
        return (
          <div key={`${String(item.sceneNumber)}-${index}`} className="rounded-lg border border-[#e7eaf0] bg-[#f7f9fc] p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-[#030303] dark:text-slate-100">
              Scene {String(item.sceneNumber || index + 1)} · {text(item.location)} · {text(item.timeOfDay)}
            </p>
            {text(item.action) && <p className="mt-2 text-xs leading-5 text-[#404040] dark:text-slate-300">{text(item.action)}</p>}
            {!!dialogue.length && (
              <div className="mt-2 space-y-1">
                {dialogue.map((line) => <p key={line} className="text-xs leading-5 text-[#676f7b] dark:text-slate-400">{line}</p>)}
              </div>
            )}
            {text(item.visualDirection) && <p className="mt-2 text-[11px] leading-4 text-[#939393] dark:text-slate-500">{text(item.visualDirection)}</p>}
          </div>
        );
      })}
    </div>
  );
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
  const uploadImageReference = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateNodeData(node.id, { referenceImageUrl: reader.result });
    };
    reader.readAsDataURL(file);
  };

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
      {node.data.nodeType === "image" && (
        <div className="mt-5 rounded-lg border border-[#e7eaf0] bg-[#f7f9fc] p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-xs font-semibold text-[#404040] dark:text-slate-200">图生图参考图</p>
          <p className="mt-1 text-[11px] leading-4 text-[#676f7b] dark:text-slate-500">上传一张图片后，运行该 ImageNode 会基于这张图进行编辑生成。</p>
          {node.data.referenceImageUrl && (
            <div className="mt-3 overflow-hidden rounded-md border border-[#dde3ec] bg-white dark:border-slate-700 dark:bg-slate-950">
              <img src={node.data.referenceImageUrl} alt="Image reference" className="max-h-40 w-full object-contain" />
            </div>
          )}
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs text-[#676f7b] dark:text-slate-400">上传图片</span>
            <Input type="file" accept="image/*" onChange={(event) => uploadImageReference(event.target.files?.[0])} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs text-[#676f7b] dark:text-slate-400">或填写图片 URL</span>
            <Input value={node.data.referenceImageUrl?.startsWith("data:") ? "" : String(node.data.referenceImageUrl ?? "")} placeholder={node.data.referenceImageUrl?.startsWith("data:") ? "已使用本地上传图片" : "https://..."} onChange={(event) => updateNodeData(node.id, { referenceImageUrl: event.target.value })} />
          </label>
          {node.data.referenceImageUrl && (
            <button
              type="button"
              onClick={() => updateNodeData(node.id, { referenceImageUrl: "" })}
              className="mt-3 w-full rounded-md border border-[#d9e1ec] bg-white px-3 py-2 text-xs font-semibold text-[#404040] hover:bg-[#f2f5f9] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              清除参考图
            </button>
          )}
        </div>
      )}
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
          {node.data.nodeType === "script" && <ScriptOutputPreview value={node.data.output.value} />}
        </div>
      )}
    </aside>
  );
}
