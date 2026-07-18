import "server-only";

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { AIProviderError } from "./errors";

const require = createRequire(import.meta.url);
const ffprobeStatic = require("ffprobe-static") as { path?: string };
const MAX_PROBE_BYTES = 350 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 180_000;

export type SupportedVideoAspectRatio = "16:9" | "9:16" | "1:1";

const ratioValues: Record<SupportedVideoAspectRatio, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
};

const firstExistingPath = (values: Array<string | undefined>) =>
  values.map((value) => value?.trim()).find((value): value is string => Boolean(value && existsSync(value)));

const bundledFfprobePath = () => process.platform === "win32"
  ? path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe")
  : path.join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");

const ffprobeExecutable = () => firstExistingPath([
  process.env.FFPROBE_PATH,
  ffprobeStatic.path,
  bundledFfprobePath(),
]) || process.env.FFPROBE_PATH?.trim() || ffprobeStatic.path || "ffprobe";

export const normalizeVideoAspectRatio = (value: unknown, fallback: SupportedVideoAspectRatio = "16:9"): SupportedVideoAspectRatio =>
  value === "16:9" || value === "9:16" || value === "1:1" ? value : fallback;

const dataUrl = (value: string) => {
  const match = /^data:[^;,]+;base64,(.+)$/i.exec(value);
  return match ? Buffer.from(match[1], "base64") : undefined;
};

const mediaBuffer = async (url: string) => {
  const inline = dataUrl(url);
  if (inline) return inline;
  if (!/^https?:\/\//i.test(url)) {
    throw new AIProviderError("Aspect-ratio verification requires an HTTP(S) media URL or base64 data URL.", "INVALID_RATIO_SOURCE", 400);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new AIProviderError(`Could not download media for aspect-ratio verification (HTTP ${response.status}).`, "RATIO_SOURCE_DOWNLOAD_FAILED", 422);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PROBE_BYTES) {
      throw new AIProviderError("Media is too large for aspect-ratio verification.", "RATIO_SOURCE_TOO_LARGE", 422);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new AIProviderError("Downloaded media is empty.", "RATIO_SOURCE_EMPTY", 422);
    if (buffer.length > MAX_PROBE_BYTES) throw new AIProviderError("Media is too large for aspect-ratio verification.", "RATIO_SOURCE_TOO_LARGE", 422);
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
};

const runFfprobe = (filePath: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const child = spawn(ffprobeExecutable(), [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "json",
    filePath,
  ], { windowsHide: true });
  let stdout = "";
  let stderr = "";
  const timeout = setTimeout(() => child.kill(), PROBE_TIMEOUT_MS);
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.on("close", (code) => {
    clearTimeout(timeout);
    if (code !== 0) {
      reject(new Error(stderr.trim() || `ffprobe exited with code ${code}.`));
      return;
    }
    try {
      const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
      const stream = parsed.streams?.[0];
      const width = Number(stream?.width);
      const height = Number(stream?.height);
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new Error("No visual dimensions found.");
      resolve({ width, height });
    } catch (error) {
      reject(error);
    }
  });
});

export async function probeMediaDimensions(url: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "mindverse-ratio-probe-"));
  const filePath = path.join(directory, "media.bin");
  try {
    await writeFile(filePath, await mediaBuffer(url));
    return await runFfprobe(filePath);
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError(`Could not inspect media dimensions: ${error instanceof Error ? error.message : "unknown error"}`, "RATIO_PROBE_FAILED", 422);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const dimensionsMatchAspectRatio = (width: number, height: number, expected: SupportedVideoAspectRatio) =>
  Math.abs(width / height - ratioValues[expected]) / ratioValues[expected] <= 0.025;

export async function assertSourceAspectRatio(url: string, expectedValue: unknown, label: string) {
  const expected = normalizeVideoAspectRatio(expectedValue);
  const dimensions = await probeMediaDimensions(url);
  if (!dimensionsMatchAspectRatio(dimensions.width, dimensions.height, expected)) {
    throw new AIProviderError(
      `${label} is ${dimensions.width}x${dimensions.height}, but ${expected} was selected. This model derives its output ratio from the source frame. Use a ${expected} source image before running it.`,
      "SOURCE_ASPECT_RATIO_MISMATCH",
      400,
    );
  }
  return dimensions;
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

export async function verifyCompletedVideoAspectRatio<T>(output: T, expectedValue: unknown): Promise<T> {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  if (expectedValue !== "16:9" && expectedValue !== "9:16" && expectedValue !== "1:1") return output;
  const source = record(output);
  const expected = normalizeVideoAspectRatio(expectedValue);
  const annotated = { ...source, expectedAspectRatio: expected };
  const status = text(source.status)?.toLowerCase();
  const url = text(source.videoUrl) || text(source.resultUrl) || text(source.finalVideoUrl);
  if (!url || (status !== "completed" && status !== "succeeded" && status !== "success")) return annotated as T;
  try {
    const dimensions = await probeMediaDimensions(url);
    if (!dimensionsMatchAspectRatio(dimensions.width, dimensions.height, expected)) {
      return {
        ...annotated,
        status: "failed",
        errorMessage: `Generated video is ${dimensions.width}x${dimensions.height}, but ${expected} was requested. The provider did not honor the selected aspect ratio.`,
        actualWidth: dimensions.width,
        actualHeight: dimensions.height,
        aspectRatioVerified: false,
      } as T;
    }
    return {
      ...annotated,
      actualWidth: dimensions.width,
      actualHeight: dimensions.height,
      aspectRatioVerified: true,
    } as T;
  } catch (error) {
    return {
      ...annotated,
      status: "failed",
      errorMessage: `Video was generated, but its aspect ratio could not be verified: ${error instanceof Error ? error.message : "unknown error"}`,
      aspectRatioVerified: false,
    } as T;
  }
}
