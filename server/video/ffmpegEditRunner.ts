import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { uploadToBunny } from "@/server/storage/bunnyClient";

type ClipSpec = {
  sourceIndex: number;
  start?: number;
  duration?: number;
};

type EditPlan = {
  clips: ClipSpec[];
  preserveAudio?: boolean;
};

export type FfmpegVideoEditInput = {
  prompt?: string;
  editPlan?: string;
  referenceVideoUrls?: string[];
  preserveAudio?: boolean;
  transition?: "none" | "fade";
  resolution?: string;
  aspectRatio?: string;
  fps?: string | number;
};

const ffmpegExecutable = () => process.env.FFMPEG_PATH?.trim() || "ffmpeg";

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

const planFromInput = (input: FfmpegVideoEditInput, videoCount: number): EditPlan => {
  const parsed = extractJsonPlan(input.editPlan || input.prompt || "");
  const raw = object(parsed);
  const clipsSource = Array.isArray(raw.clips) ? raw.clips : [];
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
      };
    })
    .filter((clip) => clip.sourceIndex >= 0 && clip.sourceIndex < videoCount);

  return {
    clips: clips.length ? clips : Array.from({ length: videoCount }, (_, sourceIndex) => ({ sourceIndex })),
    preserveAudio: typeof raw.preserveAudio === "boolean" ? raw.preserveAudio : input.preserveAudio,
  };
};

const targetSize = (resolution?: string, aspectRatio?: string) => {
  const ratio = aspectRatio === "9:16" ? 9 / 16 : aspectRatio === "1:1" ? 1 : 16 / 9;
  const height = resolution === "1080p" ? 1080 : resolution === "480p" ? 480 : 720;
  const width = Math.round((height * ratio) / 2) * 2;
  return { width, height };
};

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegExecutable(), args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("FFmpeg executable not found. Install FFmpeg or set FFMPEG_PATH in .env.local."));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed with exit code ${code}.${stderr ? ` ${stderr.slice(-1200)}` : ""}`));
    });
  });

const downloadVideo = async (url: string, filePath: string) => {
  if (url.startsWith("data:")) {
    const base64 = url.split(",", 2)[1] || "";
    await writeFile(filePath, Buffer.from(base64, "base64"));
    return;
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download source video (${response.status} ${response.statusText}).`);
  }
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
};

const concatFileLine = (filePath: string) => `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;

export async function createFfmpegVideoEdit(input: FfmpegVideoEditInput) {
  const sourceUrls = (input.referenceVideoUrls || []).filter(Boolean);
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
      const filePath = path.join(sourceDir, `source-${index + 1}.mp4`);
      await downloadVideo(url, filePath);
      return filePath;
    }));

    const plan = planFromInput(input, sourcePaths.length);
    const preserveAudio = plan.preserveAudio !== false;
    const { width, height } = targetSize(input.resolution, input.aspectRatio);
    const fps = String(input.fps || "30");
    const segmentPaths: string[] = [];

    for (const [index, clip] of plan.clips.entries()) {
      const segmentPath = path.join(segmentDir, `segment-${index + 1}.mp4`);
      const filters = [
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        "setsar=1",
        ...(input.transition === "fade"
          ? [
              "fade=t=in:st=0:d=0.2",
              ...(clip.duration && clip.duration > 0.45 ? [`fade=t=out:st=${Math.max(0, clip.duration - 0.2)}:d=0.2`] : []),
            ]
          : []),
      ];
      const trimArgs = [
        "-y",
        ...(clip.start !== undefined ? ["-ss", String(clip.start)] : []),
        "-i", sourcePaths[clip.sourceIndex],
        ...(clip.duration !== undefined ? ["-t", String(clip.duration)] : []),
        "-vf", filters.join(","),
        "-r", fps,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        ...(preserveAudio ? ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"] : ["-an"]),
        "-movflags", "+faststart",
        segmentPath,
      ];
      await runFfmpeg(trimArgs);
      segmentPaths.push(segmentPath);
    }

    const listPath = path.join(tempRoot, "concat.txt");
    const outputPath = path.join(tempRoot, "edited.mp4");
    await writeFile(listPath, segmentPaths.map(concatFileLine).join("\n"), "utf8");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outputPath]);

    const date = new Date().toISOString().slice(0, 10);
    const remotePath = `canvas/${date}/video-edit/${randomUUID()}.mp4`;
    const videoUrl = await uploadToBunny(await readFile(outputPath), remotePath, "video/mp4");
    return {
      status: "succeeded",
      videoUrl,
      resultUrl: videoUrl,
      clipCount: plan.clips.length,
      sourceCount: sourceUrls.length,
      preserveAudio,
      resolution: `${width}x${height}`,
      fps,
      provider: "ffmpeg",
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
