import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { CanvasNode } from "@/shared/canvas";

const ffprobeStatic = require("ffprobe-static") as { path?: string };

const bundledFfprobePath = () => process.platform === "win32"
  ? join(process.cwd(), "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe")
  : join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe");

const ffprobeExecutable = () => {
  const candidates = [process.env.FFPROBE_PATH?.trim(), ffprobeStatic.path, bundledFfprobePath()].filter((item): item is string => Boolean(item));
  return candidates.find((candidate) => existsSync(candidate)) || "ffprobe";
};

export type AgentMediaProbe = {
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const mediaUrlFrom = (node: CanvasNode) => {
  const value = record(node.data.output?.value);
  const candidates = [
    value.finalVideoUrl,
    value.videoUrl,
    value.resultUrl,
    value.imageUrl,
    value.revisedImageUrl,
    value.audioUrl,
    value.url,
    node.data.resultUrl,
    node.data.imageUrl,
    node.data.audioUrl,
  ].map(text);
  return candidates.find((url) => /^https:\/\//i.test(url) || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(url));
};

const probeFile = (filePath: string, timeoutMs = 30_000) => new Promise<AgentMediaProbe>((resolve, reject) => {
  const executable = ffprobeExecutable();
  const child = spawn(executable, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json",
    filePath,
  ], { windowsHide: true });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("ffprobe timed out while inspecting generated media."));
  }, timeoutMs);
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) return reject(new Error(stderr.trim() || `ffprobe exited with code ${code}.`));
    try {
      const raw = JSON.parse(stdout) as { format?: { duration?: unknown }; streams?: Array<{ codec_type?: unknown; width?: unknown; height?: unknown }> };
      const streams = Array.isArray(raw.streams) ? raw.streams : [];
      const video = streams.find((stream) => stream.codec_type === "video");
      resolve({
        duration: finiteNumber(raw.format?.duration),
        width: finiteNumber(video?.width),
        height: finiteNumber(video?.height),
        hasAudio: streams.some((stream) => stream.codec_type === "audio"),
        hasVideo: Boolean(video),
      });
    } catch (error) {
      reject(error);
    }
  });
});

const probeUrl = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const directory = await mkdtemp(join(tmpdir(), "mindverse-agent-probe-"));
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "video/*,image/*,audio/*,*/*", "User-Agent": "Mindverse-Agent-Probe/1.0" },
    });
    if (!response.ok) throw new Error(`Media probe download failed (${response.status} ${response.statusText}).`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 300 * 1024 * 1024) throw new Error("Media probe skipped a file larger than 300 MB.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > 300 * 1024 * 1024) throw new Error("Media probe skipped a file larger than 300 MB.");
    const extension = extname(new URL(url).pathname).slice(0, 12) || ".media";
    const filePath = join(directory, `source${extension}`);
    await writeFile(filePath, buffer);
    return await probeFile(filePath);
  } finally {
    clearTimeout(timeout);
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
};

export async function probeAgentMediaOutputs(nodes: CanvasNode[], nodeIds: string[]) {
  const requested = new Set(nodeIds);
  const candidates = nodes
    .filter((node) => requested.has(node.id) && node.data.status === "success")
    .map((node) => ({ node, url: mediaUrlFrom(node) }))
    .filter((item): item is { node: CanvasNode; url: string } => Boolean(item.url))
    .slice(0, 8);
  const probes = new Map<string, AgentMediaProbe>();
  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const results = await Promise.all(batch.map(async ({ node, url }) => ({
      nodeId: node.id,
      probe: await probeUrl(url).catch((error) => {
        console.warn("Agent media probe failed", node.id, error instanceof Error ? error.message : "Unknown probe error");
        return undefined;
      }),
    })));
    results.forEach(({ nodeId, probe }) => { if (probe) probes.set(nodeId, probe); });
  }
  return probes;
}
