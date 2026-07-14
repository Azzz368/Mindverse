import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { uploadToBunny } from "@/server/storage/bunnyClient";

const require = createRequire(import.meta.url);
const ffmpegStaticPath = require("ffmpeg-static") as string | null;
const ffprobeStatic = require("ffprobe-static") as { path?: string };

type ClipSpec = {
  sourceIndex: number;
  start?: number;
  duration?: number;
  muted?: boolean;
  volume?: number;
};

type AudioTrackSpec = {
  sourceIndex: number;
  start?: number;
  duration?: number;
  offset?: number;
  volume: number;
  loop: boolean;
};

type SubtitleSpec = {
  text: string;
  start: number;
  end: number;
};

type EditPlan = {
  clips: ClipSpec[];
  preserveAudio?: boolean;
  originalVolume: number;
  backgroundAudio?: AudioTrackSpec;
  subtitles: SubtitleSpec[];
  fadeIn?: number;
  fadeOut?: number;
  resolution?: string;
  aspectRatio?: string;
  fps?: string | number;
};

export type FfmpegVideoEditInput = {
  prompt?: string;
  editPlan?: string;
  referenceVideoUrls?: string[];
  referenceAudioUrls?: string[];
  preserveAudio?: boolean;
  originalVolume?: number;
  backgroundVolume?: number;
  fadeIn?: number;
  fadeOut?: number;
  transition?: "none" | "fade";
  resolution?: string;
  aspectRatio?: string;
  fps?: string | number;
};

const firstExistingPath = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).find((value): value is string => Boolean(value && existsSync(value)));

const bundledFfmpegPath = () =>
  process.platform === "win32"
    ? path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")
    : path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");

const bundledFfprobePath = () =>
  process.platform === "win32"
    ? path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe")
    : path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");

const ffmpegExecutable = () =>
  firstExistingPath([process.env.FFMPEG_PATH, ffmpegStaticPath, bundledFfmpegPath()]) ||
  process.env.FFMPEG_PATH?.trim() ||
  ffmpegStaticPath ||
  "ffmpeg";

const ffprobeExecutable = () => {
  const explicit = process.env.FFPROBE_PATH?.trim();
  const ffmpeg = ffmpegExecutable();
  const parsed = path.parse(ffmpeg);
  const sibling = path.join(parsed.dir, `${parsed.name.replace(/ffmpeg$/i, "ffprobe")}${parsed.ext}`);
  return firstExistingPath([explicit, ffprobeStatic.path, bundledFfprobePath(), sibling]) ||
    explicit ||
    ffprobeStatic.path ||
    "ffprobe";
};

const parseTime = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== "string" || !value.trim()) return undefined;
  const raw = value.trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Number(raw));
  const parts = raw.split(":").map(Number);
  if (parts.some((item) => !Number.isFinite(item))) return undefined;
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  return undefined;
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const finiteNumber = (value: unknown) => {
  const parsed = typeof value === "string" && value.trim().endsWith("%")
    ? Number(value.trim().slice(0, -1)) / 100
    : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const volumeFrom = (value: unknown, fallback: number) => clamp(finiteNumber(value) ?? fallback, 0, 3);
const boolFrom = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1", "on"].includes(normalized)) return true;
  if (["false", "no", "0", "off"].includes(normalized)) return false;
  return undefined;
};

const sourceIndexFrom = (value: unknown, max: number) => {
  const raw = typeof value === "string" ? value.replace(/^@/, "") : value;
  const index = Math.floor(Number(raw));
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(max - 1, index - 1));
};

const extractJsonPlan = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
};

const fadeDurationFrom = (value: unknown) => {
  const fromObject = object(value);
  const duration = parseTime(fromObject.duration) ?? parseTime(value);
  return duration !== undefined ? clamp(duration, 0, 10) : undefined;
};

const subtitlesFrom = (raw: Record<string, unknown>): SubtitleSpec[] => {
  const subtitleItems = array(raw.subtitles || raw.captions);
  return subtitleItems
    .map((item) => {
      const subtitle = object(item);
      const start = parseTime(subtitle.start) ?? 0;
      const end = parseTime(subtitle.end) ?? (parseTime(subtitle.duration) !== undefined ? start + (parseTime(subtitle.duration) || 0) : undefined);
      const text = typeof subtitle.text === "string" ? subtitle.text.trim() : "";
      return text && end !== undefined && end > start ? { text, start, end } : undefined;
    })
    .filter((item): item is SubtitleSpec => Boolean(item));
};

const audioTrackFrom = (raw: Record<string, unknown>, input: FfmpegVideoEditInput, audioCount: number): AudioTrackSpec | undefined => {
  if (audioCount <= 0) return undefined;
  const candidate = object(raw.backgroundAudio || raw.bgm || raw.music || raw.audio);
  const hasExplicitAudioPlan = Object.keys(candidate).length > 0;
  if (!hasExplicitAudioPlan && !(input.referenceAudioUrls || []).length) return undefined;
  const start = parseTime(candidate.start);
  const end = parseTime(candidate.end);
  const rawDuration = parseTime(candidate.duration);
  const duration = rawDuration ?? (start !== undefined && end !== undefined && end > start ? end - start : undefined);
  return {
    sourceIndex: sourceIndexFrom(candidate.source ?? candidate.sourceIndex ?? candidate.audio ?? candidate.audioIndex, audioCount),
    ...(start !== undefined ? { start } : {}),
    ...(duration !== undefined && duration > 0 ? { duration } : {}),
    offset: parseTime(candidate.offset) ?? 0,
    volume: volumeFrom(candidate.volume ?? raw.backgroundVolume ?? input.backgroundVolume, 0.2),
    loop: boolFrom(candidate.loop) ?? true,
  };
};

const planFromInput = (input: FfmpegVideoEditInput, videoCount: number, audioCount: number): EditPlan => {
  const parsed = extractJsonPlan(input.editPlan || input.prompt || "");
  const raw = object(parsed);
  const output = object(raw.output);
  const clipsSource = array(raw.clips);
  const clips = clipsSource
    .map((item) => {
      const clip = object(item);
      const start = parseTime(clip.start);
      const end = parseTime(clip.end);
      const rawDuration = parseTime(clip.duration);
      const duration = rawDuration ?? (start !== undefined && end !== undefined && end > start ? end - start : undefined);
      return {
        sourceIndex: sourceIndexFrom(clip.source ?? clip.sourceIndex ?? clip.video ?? clip.videoIndex, videoCount),
        ...(start !== undefined ? { start } : {}),
        ...(duration !== undefined && duration > 0 ? { duration } : {}),
        ...(boolFrom(clip.muted ?? clip.mute) !== undefined ? { muted: boolFrom(clip.muted ?? clip.mute) } : {}),
        ...(clip.volume !== undefined ? { volume: volumeFrom(clip.volume, 1) } : {}),
      };
    })
    .filter((clip) => clip.sourceIndex >= 0 && clip.sourceIndex < videoCount);
  const fades = object(raw.fades || raw.fade);
  const preserveAudio = boolFrom(raw.preserveAudio) ?? (boolFrom(raw.muteOriginal) === true ? false : input.preserveAudio);

  return {
    clips: clips.length ? clips : Array.from({ length: videoCount }, (_, sourceIndex) => ({ sourceIndex })),
    preserveAudio,
    originalVolume: volumeFrom(raw.originalVolume ?? input.originalVolume, 1),
    backgroundAudio: audioTrackFrom(raw, input, audioCount),
    subtitles: subtitlesFrom(raw),
    fadeIn: fadeDurationFrom(raw.fadeIn ?? fades.in ?? input.fadeIn),
    fadeOut: fadeDurationFrom(raw.fadeOut ?? fades.out ?? input.fadeOut),
    resolution: typeof output.resolution === "string" ? output.resolution : undefined,
    aspectRatio: typeof output.aspectRatio === "string" ? output.aspectRatio : undefined,
    fps: typeof output.fps === "string" || typeof output.fps === "number" ? output.fps : undefined,
  };
};

const targetSize = (resolution?: string, aspectRatio?: string) => {
  const ratio = aspectRatio === "9:16" ? 9 / 16 : aspectRatio === "1:1" ? 1 : 16 / 9;
  const height = resolution === "1080p" ? 1080 : resolution === "480p" ? 480 : 720;
  const width = Math.round((height * ratio) / 2) * 2;
  return { width, height };
};

const runProcess = (command: string, args: string[], options?: { cwd?: string }) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, cwd: options?.cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`${path.basename(command)} executable not found. Install FFmpeg or set FFMPEG_PATH/FFPROBE_PATH in .env.local.`));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} failed with exit code ${code}.${stderr ? ` ${stderr.slice(-1600)}` : ""}`));
    });
  });

const runFfmpeg = (args: string[], cwd?: string) => runProcess(ffmpegExecutable(), args, { cwd }).then(() => undefined);

const ffprobeDuration = async (filePath: string) => {
  const { stdout } = await runProcess(ffprobeExecutable(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]);
  const value = Number(stdout.trim());
  return Number.isFinite(value) ? value : undefined;
};

const hasAudioStream = async (filePath: string) => {
  const { stdout } = await runProcess(ffprobeExecutable(), ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", filePath]);
  return Boolean(stdout.trim());
};

const extensionFromUrl = (url: string, fallback: string) => {
  try {
    const ext = path.extname(new URL(url).pathname).replace(/[^a-zA-Z0-9.]/g, "");
    return ext || fallback;
  } catch {
    return fallback;
  }
};

const downloadMedia = async (url: string, filePath: string) => {
  if (url.startsWith("data:")) {
    const base64 = url.split(",", 2)[1] || "";
    await writeFile(filePath, Buffer.from(base64, "base64"));
    return;
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download media source (${response.status} ${response.statusText}).`);
  }
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
};

const concatFileLine = (filePath: string) => `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
const secondsForFfmpeg = (value: number) => Number(value.toFixed(3)).toString();

const srtTime = (seconds: number) => {
  const ms = Math.floor((seconds % 1) * 1000);
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

const writeSrt = async (subtitles: SubtitleSpec[], filePath: string) => {
  const content = subtitles
    .map((subtitle, index) => [
      String(index + 1),
      `${srtTime(subtitle.start)} --> ${srtTime(subtitle.end)}`,
      subtitle.text.replace(/\r?\n/g, "\n"),
      "",
    ].join("\n"))
    .join("\n");
  await writeFile(filePath, content, "utf8");
};

export async function createFfmpegVideoEdit(input: FfmpegVideoEditInput) {
  const sourceUrls = (input.referenceVideoUrls || []).filter(Boolean);
  const audioUrls = (input.referenceAudioUrls || []).filter(Boolean);
  if (!sourceUrls.length) {
    throw new Error("Video Edit requires at least one connected video source.");
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "mindverse-video-edit-"));
  try {
    const sourceDir = path.join(tempRoot, "sources");
    const segmentDir = path.join(tempRoot, "segments");
    await mkdir(sourceDir);
    await mkdir(segmentDir);

    const sourcePaths = await Promise.all(sourceUrls.map(async (url, index) => {
      const filePath = path.join(sourceDir, `source-${index + 1}${extensionFromUrl(url, ".mp4")}`);
      await downloadMedia(url, filePath);
      return filePath;
    }));
    const audioPaths = await Promise.all(audioUrls.map(async (url, index) => {
      const filePath = path.join(sourceDir, `audio-${index + 1}${extensionFromUrl(url, ".mp3")}`);
      await downloadMedia(url, filePath);
      return filePath;
    }));

    const plan = planFromInput(input, sourcePaths.length, audioPaths.length);
    const preserveAudio = plan.preserveAudio !== false;
    const { width, height } = targetSize(plan.resolution || input.resolution, plan.aspectRatio || input.aspectRatio);
    const fps = String(plan.fps || input.fps || "30");
    const segmentPaths: string[] = [];

    for (const [index, clip] of plan.clips.entries()) {
      const segmentPath = path.join(segmentDir, `segment-${index + 1}.mp4`);
      const sourceDuration = await ffprobeDuration(sourcePaths[clip.sourceIndex]).catch(() => undefined);
      const clipDuration = clip.duration ?? (sourceDuration !== undefined ? Math.max(0.1, sourceDuration - (clip.start || 0)) : undefined);
      const filters = [
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        "setsar=1",
        ...(input.transition === "fade"
          ? [
              "fade=t=in:st=0:d=0.2",
              ...(clipDuration && clipDuration > 0.45 ? [`fade=t=out:st=${secondsForFfmpeg(Math.max(0, clipDuration - 0.2))}:d=0.2`] : []),
            ]
          : []),
      ];
      const clipPreservesAudio = preserveAudio && clip.muted !== true;
      const trimArgs = [
        "-y",
        ...(clip.start !== undefined ? ["-ss", secondsForFfmpeg(clip.start)] : []),
        "-i", sourcePaths[clip.sourceIndex],
        ...(clipDuration !== undefined ? ["-t", secondsForFfmpeg(clipDuration)] : []),
        "-vf", filters.join(","),
        "-r", fps,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        ...(clipPreservesAudio ? ["-af", `volume=${secondsForFfmpeg(clip.volume ?? 1)}`, "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"] : ["-an"]),
        "-movflags", "+faststart",
        segmentPath,
      ];
      await runFfmpeg(trimArgs);
      segmentPaths.push(segmentPath);
    }

    const listPath = path.join(tempRoot, "concat.txt");
    const concatPath = path.join(tempRoot, "concat.mp4");
    const finalPath = path.join(tempRoot, "edited.mp4");
    await writeFile(listPath, segmentPaths.map(concatFileLine).join("\n"), "utf8");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", concatPath]);

    const totalDuration = await ffprobeDuration(concatPath).catch(() => undefined);
    const baseHasAudio = preserveAudio ? await hasAudioStream(concatPath).catch(() => false) : false;
    const videoFilters: string[] = [];
    if (plan.subtitles.length) {
      const srtPath = path.join(tempRoot, "subtitles.srt");
      await writeSrt(plan.subtitles, srtPath);
      videoFilters.push("subtitles=filename=subtitles.srt:force_style='FontSize=28,Outline=1,Alignment=2,MarginV=48'");
    }
    if (plan.fadeIn && plan.fadeIn > 0) {
      videoFilters.push(`fade=t=in:st=0:d=${secondsForFfmpeg(plan.fadeIn)}`);
    }
    if (plan.fadeOut && plan.fadeOut > 0 && totalDuration !== undefined) {
      videoFilters.push(`fade=t=out:st=${secondsForFfmpeg(Math.max(0, totalDuration - plan.fadeOut))}:d=${secondsForFfmpeg(plan.fadeOut)}`);
    }

    const args = ["-y", "-i", concatPath];
    if (plan.backgroundAudio) {
      if (plan.backgroundAudio.loop) args.push("-stream_loop", "-1");
      args.push("-i", audioPaths[plan.backgroundAudio.sourceIndex]);
    }
    if (videoFilters.length) args.push("-vf", videoFilters.join(","));

    const audioFilters: string[] = [];
    if (plan.backgroundAudio) {
      const bgmParts = [
        ...(plan.backgroundAudio.start !== undefined ? [`atrim=start=${secondsForFfmpeg(plan.backgroundAudio.start)}${plan.backgroundAudio.duration ? `:duration=${secondsForFfmpeg(plan.backgroundAudio.duration)}` : ""}`] : []),
        "asetpts=PTS-STARTPTS",
        `volume=${secondsForFfmpeg(plan.backgroundAudio.volume)}`,
        ...(plan.backgroundAudio.offset && plan.backgroundAudio.offset > 0 ? [`adelay=${Math.round(plan.backgroundAudio.offset * 1000)}:all=1`] : []),
      ];
      if (baseHasAudio) {
        audioFilters.push(`[0:a]volume=${secondsForFfmpeg(plan.originalVolume)}[a0]`);
        audioFilters.push(`[1:a]${bgmParts.join(",")}[a1]`);
        audioFilters.push("[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]");
      } else {
        audioFilters.push(`[1:a]${bgmParts.join(",")}[aout]`);
      }
    } else if (baseHasAudio && plan.originalVolume !== 1) {
      audioFilters.push(`[0:a]volume=${secondsForFfmpeg(plan.originalVolume)}[aout]`);
    }

    if (audioFilters.length) {
      args.push("-filter_complex", audioFilters.join(";"), "-map", "0:v", "-map", "[aout]");
    } else if (!baseHasAudio) {
      args.push("-an");
    }

    args.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      ...(audioFilters.length || baseHasAudio ? ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"] : []),
      "-movflags", "+faststart",
      ...(totalDuration !== undefined ? ["-t", secondsForFfmpeg(totalDuration)] : []),
      finalPath,
    );
    await runFfmpeg(args, tempRoot);

    const date = new Date().toISOString().slice(0, 10);
    const remotePath = `canvas/${date}/video-edit/${randomUUID()}.mp4`;
    const videoUrl = await uploadToBunny(await readFile(finalPath), remotePath, "video/mp4");
    return {
      status: "succeeded",
      videoUrl,
      resultUrl: videoUrl,
      clipCount: plan.clips.length,
      sourceCount: sourceUrls.length,
      audioSourceCount: audioUrls.length,
      preserveAudio,
      originalVolume: plan.originalVolume,
      backgroundAudio: Boolean(plan.backgroundAudio),
      subtitleCount: plan.subtitles.length,
      fadeIn: plan.fadeIn || 0,
      fadeOut: plan.fadeOut || 0,
      resolution: `${width}x${height}`,
      fps,
      provider: "ffmpeg",
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
