import "server-only";

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { archiveMediaBuffer } from "@/server/storage/mediaArchive";
import { getBunnyFile } from "@/server/storage/bunnyClient";

const require = createRequire(import.meta.url);
const ffmpegStaticPath = require("ffmpeg-static") as string | null;
const ffprobeStatic = require("ffprobe-static") as { path?: string };

export type VideoFrameMode = "last" | "timestamp";

export type ExtractVideoFrameInput = {
  videoUrl: string;
  sourceStorageKey?: string;
  mode: VideoFrameMode;
  timestampSeconds?: number;
  sourceNodeId?: string;
  projectId?: string;
};

type VideoMetadata = {
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
};

const firstExistingPath = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).find((value): value is string => Boolean(value && existsSync(value)));

const bundledFfmpegPath = () => process.platform === "win32"
  ? path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")
  : path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");

const bundledFfprobePath = () => process.platform === "win32"
  ? path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe")
  : path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");

const ffmpegExecutable = () => firstExistingPath([
  process.env.FFMPEG_PATH,
  ffmpegStaticPath,
  bundledFfmpegPath(),
]) || process.env.FFMPEG_PATH?.trim() || ffmpegStaticPath || "ffmpeg";

const ffprobeExecutable = () => firstExistingPath([
  process.env.FFPROBE_PATH,
  ffprobeStatic.path,
  bundledFfprobePath(),
]) || process.env.FFPROBE_PATH?.trim() || ffprobeStatic.path || "ffprobe";

const processTimeoutMs = Math.max(10_000, Number(process.env.VIDEO_FRAME_PROCESS_TIMEOUT_MS || 90_000));
const downloadTimeoutMs = Math.max(10_000, Number(process.env.VIDEO_FRAME_DOWNLOAD_TIMEOUT_MS || 120_000));
const maxSourceBytes = Math.max(1, Number(process.env.VIDEO_FRAME_MAX_SOURCE_MB || 300)) * 1024 * 1024;

const runProcess = (command: string, args: string[]) => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error(`${path.basename(command)} timed out while extracting the video frame.`));
  }, processTimeoutMs);
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", (error: NodeJS.ErrnoException) => {
    clearTimeout(timer);
    if (error.code === "ENOENT") {
      reject(new Error(`${path.basename(command)} executable was not found.`));
      return;
    }
    reject(error);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`${path.basename(command)} failed with exit code ${code}.${stderr ? ` ${stderr.slice(-1200)}` : ""}`));
  });
});

const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const rateFrom = (value: unknown) => {
  if (typeof value !== "string" || !value) return undefined;
  const [numerator, denominator = "1"] = value.split("/");
  const rate = Number(numerator) / Number(denominator);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
};

const probeVideo = async (filePath: string): Promise<VideoMetadata> => {
  const { stdout } = await runProcess(ffprobeExecutable(), [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=duration,width,height,avg_frame_rate,r_frame_rate:format=duration",
    "-of", "json",
    filePath,
  ]);
  const raw = JSON.parse(stdout) as {
    streams?: Array<{ duration?: unknown; width?: unknown; height?: unknown; avg_frame_rate?: unknown; r_frame_rate?: unknown }>;
    format?: { duration?: unknown };
  };
  const stream = raw.streams?.[0];
  if (!stream) throw new Error("The selected media does not contain a video stream.");
  return {
    duration: finiteNumber(stream.duration) ?? finiteNumber(raw.format?.duration),
    width: finiteNumber(stream.width),
    height: finiteNumber(stream.height),
    fps: rateFrom(stream.avg_frame_rate) ?? rateFrom(stream.r_frame_rate),
  };
};

const safeStorageKey = (value: string | undefined) => {
  const normalized = value?.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || !normalized.startsWith("canvas/") || normalized.split("/").includes("..")) return undefined;
  return normalized;
};

const bunnyStorageKeyFromUrl = (url: string) => {
  const pullZone = process.env.BUNNY_PULL_ZONE_URL?.trim().replace(/\/+$/, "");
  if (!pullZone || !url.startsWith(`${pullZone}/`)) return undefined;
  return safeStorageKey(decodeURIComponent(url.slice(pullZone.length + 1)));
};

const downloadVideo = async (input: ExtractVideoFrameInput) => {
  const storageKey = safeStorageKey(input.sourceStorageKey) || bunnyStorageKeyFromUrl(input.videoUrl);
  if (storageKey) {
    const buffer = await getBunnyFile(storageKey);
    if (!buffer) throw new Error("The archived source video could not be found.");
    if (buffer.byteLength > maxSourceBytes) throw new Error("The source video is too large to extract a frame.");
    return buffer;
  }

  if (!/^https:\/\//i.test(input.videoUrl)) throw new Error("Only archived videos or HTTPS video URLs can be used for frame extraction.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), downloadTimeoutMs);
  try {
    const response = await fetch(input.videoUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "video/*,*/*", "User-Agent": "Mindverse-Frame-Extractor/1.0" },
    });
    if (!response.ok) throw new Error(`Could not download the source video (${response.status} ${response.statusText}).`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxSourceBytes) throw new Error("The source video is too large to extract a frame.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxSourceBytes) throw new Error("The source video is too large to extract a frame.");
    return buffer;
  } finally {
    clearTimeout(timer);
  }
};

const extractLastFrame = async (sourcePath: string, outputPath: string, duration?: number) => {
  const tailWindow = Math.min(2, Math.max(0.1, duration || 2));
  const tailArgs = [
    "-y",
    "-sseof", `-${tailWindow.toFixed(3)}`,
    "-i", sourcePath,
    "-map", "0:v:0",
    "-an",
    "-fps_mode", "passthrough",
    "-update", "1",
    outputPath,
  ];
  try {
    await runProcess(ffmpegExecutable(), tailArgs);
    if (!existsSync(outputPath)) throw new Error("No frame was produced from the end of the video.");
  } catch {
    await runProcess(ffmpegExecutable(), [
      "-y",
      "-i", sourcePath,
      "-map", "0:v:0",
      "-an",
      "-fps_mode", "passthrough",
      "-update", "1",
      outputPath,
    ]);
  }
};

const extractTimestampFrame = async (sourcePath: string, outputPath: string, timestampSeconds: number) => {
  await runProcess(ffmpegExecutable(), [
    "-y",
    "-i", sourcePath,
    "-ss", timestampSeconds.toFixed(3),
    "-map", "0:v:0",
    "-frames:v", "1",
    "-an",
    outputPath,
  ]);
};

export async function extractVideoFrame(input: ExtractVideoFrameInput) {
  if (!input.videoUrl) throw new Error("A source video URL is required.");
  if (input.mode === "timestamp" && (!Number.isFinite(input.timestampSeconds) || Number(input.timestampSeconds) < 0)) {
    throw new Error("A valid current video time is required.");
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "mindverse-frame-"));
  try {
    const sourcePath = path.join(tempRoot, "source.video");
    const outputPath = path.join(tempRoot, "frame.png");
    await writeFile(sourcePath, await downloadVideo(input));
    const metadata = await probeVideo(sourcePath);
    const frameDuration = 1 / Math.max(1, metadata.fps || 25);
    const requestedTimestamp = Math.max(0, Number(input.timestampSeconds) || 0);
    const timestampSeconds = input.mode === "last"
      ? Math.max(0, (metadata.duration || 0) - frameDuration)
      : metadata.duration === undefined
        ? requestedTimestamp
        : Math.min(requestedTimestamp, Math.max(0, metadata.duration - frameDuration));

    if (input.mode === "last") await extractLastFrame(sourcePath, outputPath, metadata.duration);
    else await extractTimestampFrame(sourcePath, outputPath, timestampSeconds);

    if (!existsSync(outputPath)) throw new Error("FFmpeg did not produce an image from the selected frame.");
    const archived = await archiveMediaBuffer(
      await readFile(outputPath),
      "image",
      "image/png",
      {
        nodeId: input.sourceNodeId,
        projectId: input.projectId,
        sourceProvider: "ffmpeg-frame-extractor",
      },
    );
    if (!archived) throw new Error("The extracted frame could not be archived.");

    return {
      status: "completed" as const,
      imageUrl: archived.cdnUrl,
      frameMode: input.mode,
      timestampSeconds,
      width: metadata.width,
      height: metadata.height,
      sourceVideoUrl: input.videoUrl,
      sourceVideoNodeId: input.sourceNodeId,
      archivedMedia: [archived],
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
