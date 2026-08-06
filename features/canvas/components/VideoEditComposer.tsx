"use client";

import { useMemo, useState } from "react";
import { ImeTextarea } from "./ImeTextFields";
import type { CanvasNodeData } from "@/shared/canvas";

export type VideoEditSource = {
  id: string;
  source: number;
  label: string;
  url?: string;
};

type EditClip = {
  source: number;
  start?: number;
  end?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  speed?: number;
  rotate?: 0 | 90 | 180 | 270;
  fit?: "contain" | "cover" | "stretch";
  [key: string]: unknown;
};

type EditSubtitle = { start: number; end: number; text: string; [key: string]: unknown };
type EditPlan = {
  clips: EditClip[];
  preserveAudio?: boolean;
  originalVolume?: number;
  backgroundAudio?: { source: number; volume?: number; loop?: boolean; start?: number; duration?: number; offset?: number; [key: string]: unknown };
  subtitles?: EditSubtitle[];
  fadeIn?: number;
  fadeOut?: number;
  output?: { resolution?: string; aspectRatio?: string; fps?: number; [key: string]: unknown };
  [key: string]: unknown;
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const optionalNumber = (value: string) => value.trim() === "" ? undefined : Number(value);
const inputClass = "h-9 w-full rounded-lg border border-[#dfe3ea] bg-white px-2.5 text-[12px] font-medium text-[#111827] outline-none transition focus:border-[#7322e3] focus:ring-2 focus:ring-[#7322e3]/10 dark:border-slate-700 dark:bg-[#0c1622] dark:text-slate-100";
const selectClass = `${inputClass} appearance-none`;
const labelClass = "mb-1 block text-[10px] font-semibold tracking-wide text-[#676f7b] dark:text-slate-400";

const parsePlan = (raw: string | undefined, videoSources: VideoEditSource[]) => {
  if (!raw?.trim()) return {
    plan: { clips: videoSources.map((item) => ({ source: item.source })) } as EditPlan,
    error: "",
  };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const data = parsed as EditPlan;
    return { plan: { ...data, clips: Array.isArray(data.clips) ? data.clips : [] }, error: "" };
  } catch {
    return {
      plan: { clips: videoSources.map((item) => ({ source: item.source })) } as EditPlan,
      error: "当前高级 JSON 无法解析。重置为连接顺序后再编辑，或让 Agent 重新生成。",
    };
  }
};

const sourceName = (source: VideoEditSource | undefined, fallback: number) => source ? `@${source.source} ${source.label}` : `@${fallback} 未连接素材`;

export function VideoEditComposer({
  data,
  videoSources,
  audioSources,
  onChange,
}: {
  data: CanvasNodeData;
  videoSources: VideoEditSource[];
  audioSources: VideoEditSource[];
  onChange(patch: Partial<CanvasNodeData>): void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourceDurations, setSourceDurations] = useState<Record<number, number>>({});
  const parsed = useMemo(() => parsePlan(data.editPlan, videoSources), [data.editPlan, videoSources]);
  const plan = parsed.plan;
  const clips = plan.clips || [];
  const subtitles = Array.isArray(plan.subtitles) ? plan.subtitles : [];
  const output = object(plan.output);
  const invalidClipCount = clips.filter((clip) => {
    const sourceDuration = sourceDurations[Number(clip.source)];
    if (!sourceDuration) return false;
    const start = finite(clip.start, 0);
    const requestedEnd = clip.end !== undefined ? finite(clip.end, 0) : clip.duration !== undefined ? start + finite(clip.duration, 0) : undefined;
    return start >= sourceDuration || (requestedEnd !== undefined && (requestedEnd <= start || requestedEnd > sourceDuration + 0.05));
  }).length;

  const commit = (next: EditPlan, patch: Partial<CanvasNodeData> = {}) => {
    onChange({ ...patch, editPlan: JSON.stringify(next, null, 2) });
  };
  const reset = () => commit({
    ...plan,
    clips: videoSources.map((item) => ({ source: item.source, volume: 1, speed: 1, rotate: 0, fit: "contain" })),
    preserveAudio: data.preserveAudio !== false,
    originalVolume: finite(data.originalVolume, 1),
    output: { resolution: data.resolution || "720p", aspectRatio: data.aspectRatio || "16:9", fps: finite(data.fps, 30), ...object(plan.output) },
  });
  const updateClip = (index: number, key: keyof EditClip, value: unknown) => {
    const nextClips = clips.map((item, clipIndex) => {
      if (clipIndex !== index) return item;
      const next = { ...item };
      if (value === undefined || value === "") delete next[key];
      else next[key] = value as never;
      if (key === "end") delete next.duration;
      return next;
    });
    commit({ ...plan, clips: nextClips });
  };
  const useFullSource = (index: number, sourceNumber = clips[index]?.source || videoSources[0]?.source || 1) => {
    const nextClips = clips.map((item, clipIndex) => {
      if (clipIndex !== index) return item;
      const next = { ...item, source: Number(sourceNumber), start: 0 };
      delete next.end;
      delete next.duration;
      return next;
    });
    commit({ ...plan, clips: nextClips });
  };
  const moveClip = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= clips.length) return;
    const next = [...clips];
    [next[index], next[target]] = [next[target], next[index]];
    commit({ ...plan, clips: next });
  };
  const removeClip = (index: number) => commit({ ...plan, clips: clips.filter((_, clipIndex) => clipIndex !== index) });
  const addClip = () => {
    const source = videoSources[0]?.source || 1;
    commit({ ...plan, clips: [...clips, { source, volume: 1, speed: 1, rotate: 0, fit: "contain" }] });
  };
  const updateOutput = (key: string, value: string | number) => {
    const nextOutput = { ...output, [key]: value };
    commit({ ...plan, output: nextOutput }, {
      ...(key === "resolution" ? { resolution: String(value) } : {}),
      ...(key === "aspectRatio" ? { aspectRatio: String(value) } : {}),
      ...(key === "fps" ? { fps: String(value) } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-[#dfe3ea] bg-[#f8f9fb] dark:border-slate-700 dark:bg-[#071019]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe3ea] px-4 py-3 dark:border-slate-700">
          <div>
            <p className="text-[13px] font-bold text-[#111827] dark:text-slate-100">合成顺序</p>
            <p className="mt-0.5 text-[11px] text-[#676f7b] dark:text-slate-400">从上到下依次输出；每段入点、出点都从各自源视频的 0 秒开始计算。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="rounded-full border border-[#c9ccd1] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#30343b] hover:border-[#7322e3] hover:text-[#7322e3] dark:border-slate-600 dark:bg-[#101c29] dark:text-slate-200">重置为完整素材</button>
            <button type="button" onClick={addClip} disabled={!videoSources.length} className="rounded-full bg-[#7322e3] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#5f18c8] disabled:opacity-40">＋ 添加片段</button>
          </div>
        </div>

        {invalidClipCount > 0 && <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-950 dark:bg-rose-950/30"><p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">有 {invalidClipCount} 个片段的入点或出点超出源视频时长，运行前必须修正。</p><button type="button" onClick={reset} className="shrink-0 rounded-full bg-rose-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-rose-700">全部使用完整素材</button></div>}

        {!videoSources.length && (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-semibold text-[#30343b] dark:text-slate-200">先连接并运行 Video 节点</p>
            <p className="mt-1 text-[11px] text-[#7b8491]">可用视频会按连线顺序编号为 @1、@2、@3。</p>
          </div>
        )}

        <div className="space-y-2 p-3">
          {clips.map((clip, index) => {
            const source = videoSources.find((item) => item.source === Number(clip.source));
            const sourceDuration = sourceDurations[Number(clip.source)];
            const start = finite(clip.start, 0);
            const requestedEnd = clip.end !== undefined ? finite(clip.end, 0) : clip.duration !== undefined ? start + finite(clip.duration, 0) : undefined;
            const invalidRange = Boolean(sourceDuration && (start >= sourceDuration || (requestedEnd !== undefined && (requestedEnd <= start || requestedEnd > sourceDuration + 0.05))));
            return (
              <article key={`${index}-${clip.source}`} className="relative rounded-xl border border-[#e0e4eb] bg-white p-3 shadow-[0_1px_0_rgba(17,24,39,0.03)] dark:border-slate-700 dark:bg-[#101c29]">
                <div className="absolute bottom-3 left-[23px] top-12 w-px bg-[#d8c8f5] dark:bg-violet-900" aria-hidden="true" />
                <div className="flex items-start gap-3">
                  <div className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#7322e3] text-[11px] font-black text-white shadow-sm">{index + 1}</div>
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#ece8f6] dark:bg-slate-800">
                    {source?.url ? <video src={source.url} muted playsInline preload="metadata" onLoadedMetadata={(event) => { const duration = event.currentTarget.duration; if (Number.isFinite(duration) && duration > 0) setSourceDurations((current) => current[Number(clip.source)] === duration ? current : { ...current, [Number(clip.source)]: duration }); }} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[10px] font-semibold text-[#7d6b9f]">等待视频</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <select className={selectClass} value={clip.source || 1} onChange={(event) => useFullSource(index, Number(event.target.value))}>
                        {videoSources.map((item) => <option key={item.id} value={item.source}>{sourceName(item, item.source)}</option>)}
                      </select>
                      <button type="button" aria-label="上移片段" title="上移" disabled={index === 0} onClick={() => moveClip(index, -1)} className="h-9 w-9 shrink-0 rounded-lg border border-[#dfe3ea] text-sm hover:border-[#7322e3] disabled:opacity-30 dark:border-slate-700">↑</button>
                      <button type="button" aria-label="下移片段" title="下移" disabled={index === clips.length - 1} onClick={() => moveClip(index, 1)} className="h-9 w-9 shrink-0 rounded-lg border border-[#dfe3ea] text-sm hover:border-[#7322e3] disabled:opacity-30 dark:border-slate-700">↓</button>
                      <button type="button" aria-label="删除片段" title="删除" onClick={() => removeClip(index)} className="h-9 w-9 shrink-0 rounded-lg border border-[#f0d4d8] text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-950 dark:hover:bg-rose-950/30">×</button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className={`text-[10px] ${invalidRange ? "font-semibold text-rose-600 dark:text-rose-300" : "text-[#7b8491] dark:text-slate-400"}`}>{sourceDuration ? `源视频时长 ${sourceDuration.toFixed(2)} 秒` : "读取源视频时长中…"}{invalidRange ? " · 当前入点/出点超出源视频" : ""}</span>
                      <button type="button" onClick={() => useFullSource(index)} className="shrink-0 rounded-full bg-[#f1eafd] px-2.5 py-1 text-[10px] font-bold text-[#5f18c8] hover:bg-[#e6d8fb] dark:bg-violet-950/50 dark:text-violet-200">使用完整素材</button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label><span className={labelClass}>源视频入点 / 秒</span><input className={`${inputClass} ${invalidRange ? "!border-rose-400 !ring-rose-100" : ""}`} type="number" min="0" max={sourceDuration} step="0.1" value={clip.start ?? ""} placeholder="0" onChange={(event) => updateClip(index, "start", optionalNumber(event.target.value))} /></label>
                      <label><span className={labelClass}>源视频出点 / 秒</span><input className={`${inputClass} ${invalidRange ? "!border-rose-400 !ring-rose-100" : ""}`} type="number" min="0" max={sourceDuration} step="0.1" value={requestedEnd ?? ""} placeholder="留空直到结尾" onChange={(event) => updateClip(index, "end", optionalNumber(event.target.value))} /></label>
                      <label><span className={labelClass}>速度</span><select className={selectClass} value={clip.speed ?? 1} onChange={(event) => updateClip(index, "speed", Number(event.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>
                      <label><span className={labelClass}>原声音量</span><input className={inputClass} type="number" min="0" max="3" step="0.1" value={clip.volume ?? 1} onChange={(event) => updateClip(index, "volume", Number(event.target.value))} /></label>
                      <label><span className={labelClass}>淡入 / 秒</span><input className={inputClass} type="number" min="0" max="10" step="0.1" value={clip.fadeIn ?? 0} onChange={(event) => updateClip(index, "fadeIn", Number(event.target.value))} /></label>
                      <label><span className={labelClass}>淡出 / 秒</span><input className={inputClass} type="number" min="0" max="10" step="0.1" value={clip.fadeOut ?? 0} onChange={(event) => updateClip(index, "fadeOut", Number(event.target.value))} /></label>
                      <label><span className={labelClass}>画面适应</span><select className={selectClass} value={clip.fit || "contain"} onChange={(event) => updateClip(index, "fit", event.target.value)}><option value="contain">完整显示</option><option value="cover">铺满裁切</option><option value="stretch">拉伸铺满</option></select></label>
                      <label><span className={labelClass}>旋转</span><select className={selectClass} value={clip.rotate ?? 0} onChange={(event) => updateClip(index, "rotate", Number(event.target.value))}><option value="0">不旋转</option><option value="90">顺时针 90°</option><option value="180">旋转 180°</option><option value="270">逆时针 90°</option></select></label>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-[11px] font-medium text-[#4b5563] dark:text-slate-300"><input type="checkbox" checked={clip.muted === true} onChange={(event) => updateClip(index, "muted", event.target.checked)} className="accent-[#7322e3]" />此片段静音</label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl border border-[#dfe3ea] bg-white p-4 dark:border-slate-700 dark:bg-[#101c29]">
          <p className="text-[12px] font-bold text-[#111827] dark:text-slate-100">输出与原声</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label><span className={labelClass}>画面比例</span><select className={selectClass} value={String(output.aspectRatio || data.aspectRatio || "16:9")} onChange={(event) => updateOutput("aspectRatio", event.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
            <label><span className={labelClass}>分辨率</span><select className={selectClass} value={String(output.resolution || data.resolution || "720p")} onChange={(event) => updateOutput("resolution", event.target.value)}><option>480p</option><option>720p</option><option>1080p</option></select></label>
            <label><span className={labelClass}>帧率</span><select className={selectClass} value={String(output.fps || data.fps || "30")} onChange={(event) => updateOutput("fps", Number(event.target.value))}><option value="24">24 fps</option><option value="25">25 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
            <label><span className={labelClass}>总原声音量</span><input className={inputClass} type="number" min="0" max="3" step="0.1" value={plan.originalVolume ?? data.originalVolume ?? 1} onChange={(event) => { const value = Number(event.target.value); commit({ ...plan, originalVolume: value }, { originalVolume: value }); }} /></label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px] font-medium text-[#4b5563] dark:text-slate-300"><input type="checkbox" checked={(plan.preserveAudio ?? data.preserveAudio) !== false} onChange={(event) => commit({ ...plan, preserveAudio: event.target.checked }, { preserveAudio: event.target.checked })} className="accent-[#7322e3]" />保留视频原声</label>
        </section>

        <section className="rounded-2xl border border-[#dfe3ea] bg-white p-4 dark:border-slate-700 dark:bg-[#101c29]">
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-[12px] font-bold text-[#111827] dark:text-slate-100">背景音乐</p><p className="mt-0.5 text-[10px] text-[#7b8491]">音频编号与视频编号独立。</p></div>
            <label className="flex items-center gap-2 text-[11px] font-medium"><input type="checkbox" disabled={!audioSources.length} checked={Boolean(plan.backgroundAudio)} onChange={(event) => commit({ ...plan, backgroundAudio: event.target.checked ? { source: audioSources[0]?.source || 1, volume: 0.2, loop: true } : undefined })} className="accent-[#f5510b]" />启用</label>
          </div>
          {audioSources.length ? <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="col-span-2"><span className={labelClass}>音乐素材</span><select className={selectClass} disabled={!plan.backgroundAudio} value={plan.backgroundAudio?.source || audioSources[0].source} onChange={(event) => commit({ ...plan, backgroundAudio: { ...plan.backgroundAudio, source: Number(event.target.value) } })}>{audioSources.map((item) => <option key={item.id} value={item.source}>{sourceName(item, item.source)}</option>)}</select></label>
            <label><span className={labelClass}>音乐音量</span><input className={inputClass} disabled={!plan.backgroundAudio} type="number" min="0" max="3" step="0.05" value={plan.backgroundAudio?.volume ?? 0.2} onChange={(event) => commit({ ...plan, backgroundAudio: { source: plan.backgroundAudio?.source || audioSources[0].source, ...plan.backgroundAudio, volume: Number(event.target.value) } })} /></label>
            <label><span className={labelClass}>延后进入 / 秒</span><input className={inputClass} disabled={!plan.backgroundAudio} type="number" min="0" step="0.1" value={plan.backgroundAudio?.offset ?? 0} onChange={(event) => commit({ ...plan, backgroundAudio: { source: plan.backgroundAudio?.source || audioSources[0].source, ...plan.backgroundAudio, offset: Number(event.target.value) } })} /></label>
            <label className="col-span-2 flex items-center gap-2 text-[11px] font-medium text-[#4b5563] dark:text-slate-300"><input type="checkbox" disabled={!plan.backgroundAudio} checked={plan.backgroundAudio?.loop !== false} onChange={(event) => commit({ ...plan, backgroundAudio: { source: plan.backgroundAudio?.source || audioSources[0].source, ...plan.backgroundAudio, loop: event.target.checked } })} className="accent-[#f5510b]" />循环到成片结束</label>
          </div> : <p className="mt-4 rounded-lg bg-orange-50 px-3 py-2 text-[11px] text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">连接 Audio 或 Voice TTS 节点后即可混入背景音乐。</p>}
        </section>
      </div>

      <section className="rounded-2xl border border-[#dfe3ea] bg-white p-4 dark:border-slate-700 dark:bg-[#101c29]">
        <div className="flex items-center justify-between"><div><p className="text-[12px] font-bold text-[#111827] dark:text-slate-100">烧录字幕</p><p className="mt-0.5 text-[10px] text-[#7b8491]">字幕时间基于最终合成视频。</p></div><button type="button" onClick={() => commit({ ...plan, subtitles: [...subtitles, { start: 0, end: 2, text: "" }] })} className="rounded-full border border-[#c9ccd1] px-3 py-1.5 text-[11px] font-semibold hover:border-[#7322e3] hover:text-[#7322e3] dark:border-slate-600">＋ 添加字幕</button></div>
        <div className="mt-3 space-y-2">
          {subtitles.map((subtitle, index) => <div key={index} className="grid grid-cols-[80px_80px_1fr_36px] gap-2"><input aria-label="字幕开始时间" className={inputClass} type="number" min="0" step="0.1" value={subtitle.start} onChange={(event) => commit({ ...plan, subtitles: subtitles.map((item, itemIndex) => itemIndex === index ? { ...item, start: Number(event.target.value) } : item) })} /><input aria-label="字幕结束时间" className={inputClass} type="number" min="0" step="0.1" value={subtitle.end} onChange={(event) => commit({ ...plan, subtitles: subtitles.map((item, itemIndex) => itemIndex === index ? { ...item, end: Number(event.target.value) } : item) })} /><input aria-label="字幕文本" className={inputClass} value={subtitle.text} placeholder="输入字幕内容" onChange={(event) => commit({ ...plan, subtitles: subtitles.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} /><button type="button" aria-label="删除字幕" onClick={() => commit({ ...plan, subtitles: subtitles.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg border border-[#f0d4d8] text-rose-600 hover:bg-rose-50 dark:border-rose-950">×</button></div>)}
          {!subtitles.length && <p className="py-2 text-center text-[11px] text-[#8a929d]">没有字幕；需要时再添加。</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#dfe3ea] bg-white p-4 dark:border-slate-700 dark:bg-[#101c29]">
        <label className={labelClass}>给 Agent 的剪辑说明</label>
        <ImeTextarea value={data.prompt || ""} rows={2} onValueChange={(prompt) => onChange({ prompt })} placeholder="例如：先放产品特写，再放人物体验；每段淡入淡出 0.4 秒，最后加入品牌字幕。" className="w-full resize-none rounded-xl border border-[#dfe3ea] bg-[#f8f9fb] px-3 py-2 text-[12px] text-[#111827] outline-none focus:border-[#7322e3] dark:border-slate-700 dark:bg-[#071019] dark:text-slate-100" />
        <p className="mt-1.5 text-[10px] text-[#7b8491]">在 Agent 对话中提出修改后，Agent 会把这段说明转换为上面的结构化剪辑方案。</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#dfe3ea] bg-white dark:border-slate-700 dark:bg-[#101c29]">
        <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-semibold text-[#4b5563] hover:bg-[#f8f9fb] dark:text-slate-300 dark:hover:bg-slate-800/50"><span>高级 JSON</span><span>{advancedOpen ? "收起" : "展开"}</span></button>
        {advancedOpen && <div className="border-t border-[#e7eaf0] p-3 dark:border-slate-700"><ImeTextarea value={data.editPlan || ""} rows={10} onValueChange={(editPlan) => onChange({ editPlan })} className="w-full resize-y rounded-xl border border-[#dfe3ea] bg-[#071019] px-3 py-2 font-mono text-[11px] leading-5 text-[#d9e2ef] outline-none focus:border-[#a78bfa] dark:border-slate-700" />{parsed.error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{parsed.error}</p>}</div>}
      </section>
    </div>
  );
}
