import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import ffmpegStaticPath from "ffmpeg-static";
import {
  compositionFromJson,
  motionCompositionToJson,
  normalizeMotionComposition,
  type MotionAssetReference,
  type MotionComposition,
  type MotionElement,
} from "@/shared/motion/composition";
import { parseMotionVariablesJson, renderMotionTemplate } from "@/shared/motion/templates";
import { getBunnyFile, uploadToBunny } from "@/server/storage/bunnyClient";

export type MotionCompositionInput = {
  prompt?: string;
  compositionJson?: string;
  templateId?: string;
  motionVariablesJson?: string;
  motionMode?: string;
  codexInstruction?: string;
  referenceVideoUrls?: string[];
  referenceImageUrls?: string[];
  referenceAudioUrls?: string[];
};

const require = createRequire(import.meta.url);
const ffprobeStatic = require("ffprobe-static") as { path?: string };

const asset = (type: MotionAssetReference["type"], url: string, index: number): MotionAssetReference => ({
  id: `${type}-${index + 1}`,
  type,
  url,
  title: `${type} ${index + 1}`,
});

const pathSeparator = process.platform === "win32" ? ";" : ":";
const dateKey = () => new Date().toISOString().slice(0, 10);
const isCodexHyperframesMode = (input: MotionCompositionInput) => input.motionMode === "codex-hyperframes";
const codexRequired = () => !["0", "false", "no"].includes(String(process.env.MINDVERSE_CODEX_REQUIRED || "true").trim().toLowerCase());
const codexBypassSandbox = () => ["1", "true", "yes", "on"].includes(String(process.env.MINDVERSE_CODEX_BYPASS_SANDBOX || "").trim().toLowerCase());

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escapeAttr = (value: unknown) => escapeHtml(value).replace(/'/g, "&#39;");

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pct = (value: number, total: number) => `${clamp(total > 0 ? value / total * 100 : 0, 0, 100).toFixed(4)}%`;
const cssNumber = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? Number(value).toFixed(3).replace(/\.?0+$/, "") : String(fallback);
const cssSize = (value: number | undefined, fallback: number) => `${cssNumber(value, fallback)}px`;

const cssProp = (key: string) => key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
const styleNumber = (style: Record<string, string | number | boolean> | undefined, key: string, fallback: number) => {
  const value = style?.[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const styleText = (style: Record<string, string | number | boolean> | undefined, key: string, fallback = "") => {
  const value = style?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const safeStyle = (style: Record<string, string | number | boolean> | undefined) => {
  const allowed = new Set([
    "alignItems", "background", "backgroundColor", "border", "borderRadius", "boxShadow", "color",
    "display", "fontFamily", "fontSize", "fontStyle", "fontWeight", "gap", "justifyContent",
    "letterSpacing", "lineHeight", "objectFit", "objectPosition", "opacity", "overflow", "padding",
    "textAlign", "textShadow", "textTransform", "whiteSpace", "zIndex",
  ]);
  return Object.entries(style || {})
    .filter(([key, value]) => allowed.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"))
    .map(([key, value]) => `${cssProp(key)}:${escapeAttr(value)}${typeof value === "number" && ["fontSize", "borderRadius", "letterSpacing", "gap"].includes(key) ? "px" : ""}`)
    .join(";");
};

const mimeExtension = (mime: string | undefined, type: MotionAssetReference["type"]) => {
  const normalized = mime?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "video/webm") return ".webm";
  if (normalized === "video/quicktime") return ".mov";
  if (normalized === "audio/mpeg") return ".mp3";
  if (normalized === "audio/wav") return ".wav";
  if (normalized === "audio/flac") return ".flac";
  if (normalized === "video/mp4") return ".mp4";
  return type === "image" ? ".png" : type === "audio" ? ".mp3" : ".mp4";
};

const extensionFromUrl = (url: string, type: MotionAssetReference["type"]) => {
  try {
    const ext = path.extname(new URL(url).pathname).replace(/[^a-zA-Z0-9.]/g, "");
    return ext || mimeExtension(undefined, type);
  } catch {
    return mimeExtension(undefined, type);
  }
};

const dataUrlPattern = /^data:([^;,]+);base64,(.+)$/i;

const bunnyStoragePathFromPullUrl = (url: string) => {
  const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL?.trim().replace(/\/+$/g, "");
  if (!pullZoneUrl) return undefined;
  try {
    const source = new URL(url);
    const pullZone = new URL(pullZoneUrl);
    if (source.origin !== pullZone.origin) return undefined;
    const basePath = pullZone.pathname.replace(/\/+$/g, "");
    if (basePath && source.pathname !== basePath && !source.pathname.startsWith(`${basePath}/`)) return undefined;
    return decodeURIComponent(source.pathname.slice(basePath.length).replace(/^\/+/g, ""));
  } catch {
    return undefined;
  }
};

const bunnyStoragePathFromCanvasUrl = (url: string) => {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/g, "");
    return pathname.startsWith("canvas/") ? pathname : undefined;
  } catch {
    return undefined;
  }
};

const downloadAsset = async (assetItem: MotionAssetReference, filePath: string) => {
  const url = assetItem.url || "";
  const dataUrl = dataUrlPattern.exec(url);
  if (dataUrl) {
    await writeFile(filePath, Buffer.from(dataUrl[2], "base64"));
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Motion asset ${assetItem.id} must use an HTTP(S) or data URL.`);
  }
  const bunnyStoragePath = bunnyStoragePathFromPullUrl(url) || bunnyStoragePathFromCanvasUrl(url);
  if (bunnyStoragePath) {
    const file = await getBunnyFile(bunnyStoragePath);
    if (!file) throw new Error(`Motion asset ${assetItem.id} was not found in Bunny storage.`);
    await writeFile(filePath, file);
    return;
  }
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "video/*,image/*,audio/*,*/*", "User-Agent": "Mindverse-HyperFrames/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Could not download motion asset ${assetItem.id} (${response.status} ${response.statusText}).`);
  }
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
};

const buildComposition = (input: MotionCompositionInput) => {
  const codexMode = isCodexHyperframesMode(input);
  const templateComposition = !codexMode && input.templateId
    ? renderMotionTemplate(input.templateId, parseMotionVariablesJson(input.motionVariablesJson))
    : undefined;
  const base = templateComposition || compositionFromJson(input.compositionJson, input.prompt || "HyperFrames Composition");
  const requestedTitle = titleFromPrompt([input.codexInstruction, input.prompt].filter(Boolean).join("\n"));
  const assets: MotionAssetReference[] = [
    ...(input.referenceVideoUrls || []).filter(Boolean).map((url, index) => asset("video", url, index)),
    ...(input.referenceImageUrls || []).filter(Boolean).map((url, index) => asset("image", url, index)),
    ...(input.referenceAudioUrls || []).filter(Boolean).map((url, index) => asset("audio", url, index)),
  ];
  const visualAssets = assets.filter(
    (item): item is MotionAssetReference & { type: "video" | "image" } =>
      item.type === "video" || item.type === "image",
  );
  const baselineVisuals = codexMode && visualAssets.length > 1
    ? visualAssets.map((item, index) => {
      const slotDuration = base.canvas.duration / visualAssets.length;
      return {
        id: `source-media-${index + 1}`,
        type: item.type,
        assetId: item.id,
        start: slotDuration * index,
        duration: slotDuration,
        x: 0,
        y: 0,
        width: base.canvas.width,
        height: base.canvas.height,
        style: { objectFit: "cover" },
      } satisfies MotionElement;
    })
    : visualAssets.slice(0, 1).map((item) => ({
      id: "main-media",
      type: item.type,
      assetId: item.id,
      start: 0,
      duration: base.canvas.duration,
      x: 0,
      y: 0,
      width: base.canvas.width,
      height: base.canvas.height,
      style: { objectFit: "cover" },
    } satisfies MotionElement));
  const composition: MotionComposition = normalizeMotionComposition({
    ...base,
    templateId: codexMode ? undefined : input.templateId || base.templateId,
    notes: input.prompt || base.notes,
    assets: [...base.assets, ...assets],
    elements: [
      ...baselineVisuals,
      ...base.elements,
    ],
  }, input.prompt || "HyperFrames Composition");
  if (requestedTitle) {
    composition.title = requestedTitle;
    composition.elements = composition.elements.map((element) =>
      element.type === "text" && isGenericMotionTitle(element.text)
        ? { ...element, text: requestedTitle }
        : element,
    );
  }
  return composition;
};

const isGenericMotionTitle = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || ["hyperframes composition", "mindverse motion", "create a clean motion graphics package"].includes(normalized);
};

const titleFromPrompt = (prompt: string | undefined) => {
  const raw = prompt?.trim();
  if (!raw) return undefined;
  const patterns = [
    /(?:\u5f00\u573a\u6807\u9898|\u4e3b\u6807\u9898|\u6807\u9898|\u7247\u540d)\s*(?:\u4e3a|\u662f|\u53eb|:|\uff1a)\s*[\u201c\u201d"']?([^\u201c\u201d"'\u3002\uff0c,\n]{1,60})/i,
    /(?:opening title|main title|title|headline)\s*(?:is|as|:)\s*["']?([^"'\n.]{1,60})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
};

const localizedAssets = async (composition: MotionComposition, projectDir: string) => {
  const assetDir = path.join(projectDir, "assets");
  await mkdir(assetDir, { recursive: true });
  const sourceById = new Map<string, string>();
  for (const [index, item] of composition.assets.entries()) {
    if (!item.url) continue;
    const ext = dataUrlPattern.exec(item.url)?.[1]
      ? mimeExtension(dataUrlPattern.exec(item.url)?.[1], item.type)
      : extensionFromUrl(item.url, item.type);
    const fileName = `${item.type}-${index + 1}${ext}`;
    const filePath = path.join(assetDir, fileName);
    await downloadAsset(item, filePath);
    sourceById.set(item.id, `assets/${fileName}`);
  }
  return sourceById;
};

const localizeRuntimeAssets = async (projectDir: string) => {
  const gsapSource = path.join(process.cwd(), "node_modules", "gsap", "dist", "gsap.min.js");
  if (!existsSync(gsapSource)) {
    throw new Error("The local GSAP runtime is missing. Run `npm install` before executing Codex + HyperFrames.");
  }
  await copyFile(gsapSource, path.join(projectDir, "assets", "gsap.min.js"));
};

const slideTransform = (direction: "left" | "right" | "up" | "down" | undefined) => {
  if (direction === "right") return "translateX(42px)";
  if (direction === "up") return "translateY(-42px)";
  if (direction === "down") return "translateY(42px)";
  return "translateX(-42px)";
};

const animationTransform = (element: MotionElement, phase: "in" | "steady" | "out") => {
  const animations = element.animations || [];
  const slideIn = animations.find((item) => item.type === "slideIn");
  const slideOut = animations.find((item) => item.type === "slideOut");
  const scaleIn = animations.find((item) => item.type === "scaleIn");
  const scaleOut = animations.find((item) => item.type === "scaleOut");
  if (phase === "steady") return "translate(0,0) scale(1)";
  const parts: string[] = [];
  if (phase === "in" && slideIn) parts.push(slideTransform(slideIn.direction));
  if (phase === "out" && slideOut) parts.push(slideTransform(slideOut.direction));
  if (phase === "in" && scaleIn) parts.push("scale(0.92)");
  if (phase === "out" && scaleOut) parts.push("scale(0.96)");
  return parts.length ? parts.join(" ") : "translate(0,0) scale(1)";
};

const animationDuration = (element: MotionElement, type: string, fallback: number) =>
  element.animations?.find((item) => item.type === type)?.duration ?? fallback;

const animationCss = (element: MotionElement, totalDuration: number) => {
  const name = `mv-${element.id.replace(/[^a-z0-9_-]/gi, "-")}`;
  const start = element.start;
  const end = element.start + element.duration;
  const opacity = element.opacity ?? 1;
  const entrance = Math.max(
    animationDuration(element, "fadeIn", 0),
    animationDuration(element, "slideIn", 0),
    animationDuration(element, "scaleIn", 0),
  );
  const exit = Math.max(
    animationDuration(element, "fadeOut", 0),
    animationDuration(element, "slideOut", 0),
    animationDuration(element, "scaleOut", 0),
  );
  const fadeInEnd = Math.min(end, start + entrance);
  const fadeOutStart = Math.max(start, end - exit);
  return {
    name,
    css: `@keyframes ${name}{0%,${pct(start, totalDuration)}{opacity:0;transform:${animationTransform(element, "in")}}${pct(fadeInEnd, totalDuration)},${pct(fadeOutStart, totalDuration)}{opacity:${opacity};transform:${animationTransform(element, "steady")}}${pct(end, totalDuration)},100%{opacity:0;transform:${animationTransform(element, "out")}}}`,
  };
};

const splitTitleSubtitle = (textValue: string | undefined) => {
  const [title = "", ...rest] = String(textValue || "").split(/\r?\n/);
  return { title: title.trim(), subtitle: rest.join(" ").trim() };
};

const elementHtml = (element: MotionElement, sourceById: Map<string, string>, totalDuration: number) => {
  const animation = animationCss(element, totalDuration);
  const width = element.width ?? 640;
  const height = element.height ?? 360;
  const style = [
    `left:${cssSize(element.x, 0)}`,
    `top:${cssSize(element.y, 0)}`,
    `width:${cssSize(width, 640)}`,
    `height:${cssSize(height, 360)}`,
    `animation:${animation.name} ${cssNumber(totalDuration, 10)}s linear both`,
    safeStyle(element.style),
  ].filter(Boolean).join(";");
  const src = element.assetId ? sourceById.get(element.assetId) : undefined;
  if ((element.type === "video" || element.type === "image" || element.type === "logo") && src) {
    const fit = String(element.style?.objectFit || "cover");
    const position = String(element.style?.objectPosition || "center");
    const mediaStyle = `object-fit:${escapeAttr(fit)};object-position:${escapeAttr(position)};display:block;`;
    const media = element.type === "video"
      ? `<video class="element" src="${escapeAttr(src)}" data-start="${cssNumber(element.start)}" data-duration="${cssNumber(element.duration)}" muted playsinline preload="auto" style="${style};${mediaStyle}"></video>`
      : `<img class="element" src="${escapeAttr(src)}" alt="" style="${style};${mediaStyle}" />`;
    return { css: animation.css, html: media };
  }
  if (element.type === "audio" && src) {
    const volume = clamp(styleNumber(element.style, "volume", element.opacity ?? 1), 0, 1);
    return { css: "", html: `<audio src="${escapeAttr(src)}" data-start="${cssNumber(element.start)}" data-duration="${cssNumber(element.duration)}" data-volume="${cssNumber(volume, 1)}" preload="auto"></audio>` };
  }
  if (element.type === "progressBar") {
    const fillName = `${animation.name}-fill`;
    const fillColor = styleText(element.style, "fillColor", styleText(element.style, "backgroundColor", "#ffffff"));
    const trackColor = styleText(element.style, "trackColor", "rgba(255,255,255,0.16)");
    const progressCss = `@keyframes ${fillName}{0%,${pct(element.start, totalDuration)}{width:0%}${pct(element.start + element.duration, totalDuration)},100%{width:100%}}`;
    return {
      css: `${animation.css}\n${progressCss}`,
      html: `<div class="element progress-track" style="${style};background:${escapeAttr(trackColor)}"><div class="progress-fill" style="height:100%;width:0%;background:${escapeAttr(fillColor)};animation:${fillName} ${cssNumber(totalDuration, 10)}s linear both"></div></div>`,
    };
  }
  if (element.type === "shape") {
    return { css: animation.css, html: `<div class="element" style="${style}"></div>` };
  }
  if (element.type === "lowerThird") {
    const { title, subtitle } = splitTitleSubtitle(element.text);
    return {
      css: animation.css,
      html: `<div class="element lower-third" style="${style}"><div class="lower-third-title">${escapeHtml(title)}</div>${subtitle ? `<div class="lower-third-subtitle">${escapeHtml(subtitle)}</div>` : ""}</div>`,
    };
  }
  if (element.type === "caption") {
    return { css: animation.css, html: `<div class="element caption-element" style="${style}">${escapeHtml(element.text || "")}</div>` };
  }
  return { css: animation.css, html: `<div class="element text-element" style="${style}">${escapeHtml(element.text || "")}</div>` };
};

const writeProject = async (composition: MotionComposition, projectDir: string) => {
  const sourceById = await localizedAssets(composition, projectDir);
  await localizeRuntimeAssets(projectDir);
  const rendered = composition.elements.map((element) => elementHtml(element, sourceById, composition.canvas.duration));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(composition.title || "Mindverse Motion")}</title>
  <style>
    html,body{margin:0;width:100%;height:100%;background:${escapeAttr(composition.canvas.background || "#05070a")};overflow:hidden;}
    [data-composition-id]{position:relative;width:${composition.canvas.width}px;height:${composition.canvas.height}px;background:${escapeAttr(composition.canvas.background || "#05070a")};overflow:hidden;font-family:Inter,Arial,sans-serif;color:#fff;}
    .element{position:absolute;box-sizing:border-box;will-change:opacity,transform;}
    .text-element{display:flex;align-items:center;line-height:1.1;white-space:pre-wrap;}
    .caption-element{display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.2;white-space:pre-wrap;padding:14px 22px;border-radius:16px;background:rgba(0,0,0,0.58);box-shadow:0 12px 34px rgba(0,0,0,0.28);}
    .lower-third{display:flex;flex-direction:column;justify-content:center;gap:6px;padding:18px 24px;border-radius:18px;background:linear-gradient(90deg,rgba(8,12,20,.88),rgba(8,12,20,.58));box-shadow:0 18px 44px rgba(0,0,0,.28);}
    .lower-third-title{font-size:34px;font-weight:800;line-height:1.05;}
    .lower-third-subtitle{font-size:18px;opacity:.78;line-height:1.2;}
    .progress-track{border-radius:999px;overflow:hidden;}
    .progress-fill{border-radius:999px;}
    ${rendered.map((item) => item.css).filter(Boolean).join("\n    ")}
  </style>
</head>
<body>
  <div data-composition-id="mindverse-motion" data-no-timeline="true" data-start="0" data-width="${composition.canvas.width}" data-height="${composition.canvas.height}" data-duration="${composition.canvas.duration}" data-fps="${composition.canvas.fps}">
    ${rendered.map((item) => item.html).join("\n    ")}
  </div>
</body>
</html>`;
  await writeFile(path.join(projectDir, "index.html"), ensureLocalVideoAudioTracks(html).html, "utf8");
};

type TimedLocalVideo = {
  src: string;
  start: number;
  duration: number;
  mediaStart?: number;
};

const htmlAttribute = (tag: string, name: string) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escapedName}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag);
  return match?.[2];
};

const htmlNumberAttribute = (tag: string, name: string, fallback: number) => {
  const value = Number(htmlAttribute(tag, name));
  return Number.isFinite(value) ? value : fallback;
};

const localVideoSource = (src: string | undefined) => Boolean(src && /^assets\/video-[^/]+\.(?:mp4|webm|mov|mkv)$/i.test(src));

const sourceAudioTracks = (html: string): TimedLocalVideo[] => {
  const tracks: TimedLocalVideo[] = [];
  for (const match of html.matchAll(/<audio\b[^>]*>/gi)) {
    const src = htmlAttribute(match[0], "src");
    if (!localVideoSource(src)) continue;
    const duration = htmlNumberAttribute(match[0], "data-duration", 0);
    if (duration <= 0) continue;
    tracks.push({
      src: src!,
      start: htmlNumberAttribute(match[0], "data-start", 0),
      duration,
      mediaStart: htmlAttribute(match[0], "data-media-start") === undefined
        ? undefined
        : htmlNumberAttribute(match[0], "data-media-start", 0),
    });
  }
  return tracks;
};

/**
 * HyperFrames requires muted video plus a separate root-level audio element.
 * Codex occasionally keeps only the muted visual media, which produces a
 * perfectly valid but silent render. Add deterministic companions for every
 * localized source video that has no authored audio track yet.
 */
const ensureLocalVideoAudioTracks = (html: string) => {
  const existingAudioTracks = sourceAudioTracks(html);
  const videos: TimedLocalVideo[] = [];
  for (const match of html.matchAll(/<video\b[^>]*>/gi)) {
    const src = htmlAttribute(match[0], "src");
    if (!localVideoSource(src)) continue;
    const duration = htmlNumberAttribute(match[0], "data-duration", 0);
    if (duration <= 0) continue;
    videos.push({
      src: src!,
      start: htmlNumberAttribute(match[0], "data-start", 0),
      duration,
      mediaStart: htmlAttribute(match[0], "data-media-start") === undefined
        ? undefined
        : htmlNumberAttribute(match[0], "data-media-start", 0),
    });
  }

  const additions: string[] = [];
  let nextTrack = 90;
  for (const [sourceIndex, source] of [...new Set(videos.map((video) => video.src))].entries()) {
    // A split-screen often has several visual copies of the same source at
    // once. Keep one audio companion per non-overlapping time span so the
    // original sound is preserved without being multiplied.
    let coveredUntil = Number.NEGATIVE_INFINITY;
    for (const clip of videos.filter((video) => video.src === source).sort((a, b) => a.start - b.start)) {
      if (clip.start < coveredUntil - 0.001) continue;
      const existingTrack = existingAudioTracks.find((track) =>
        track.src === source &&
        track.start <= clip.start + 0.02 &&
        track.start + track.duration >= clip.start + clip.duration - 0.02,
      );
      if (existingTrack) {
        coveredUntil = Math.max(coveredUntil, existingTrack.start + existingTrack.duration);
        continue;
      }
      const mediaStart = clip.mediaStart === undefined ? "" : ` data-media-start="${cssNumber(clip.mediaStart)}"`;
      additions.push(`<audio id="source-video-audio-${sourceIndex + 1}-${additions.length + 1}" src="${escapeAttr(clip.src)}" data-start="${cssNumber(clip.start)}" data-duration="${cssNumber(clip.duration)}"${mediaStart} data-track-index="${nextTrack}" data-volume="1" preload="auto"></audio>`);
      nextTrack += 1;
      coveredUntil = Math.max(coveredUntil, clip.start + clip.duration);
    }
  }

  if (!additions.length) return { html, addedTracks: 0 };
  const rootMatch = /<([a-z][\w:-]*)\b[^>]*\bdata-composition-id\s*=\s*(["']).*?\2[^>]*>/i.exec(html);
  if (!rootMatch || rootMatch.index === undefined) {
    throw new Error("Codex output has no HyperFrames composition root; cannot preserve source video audio.");
  }
  const insertionPoint = rootMatch.index + rootMatch[0].length;
  return {
    html: `${html.slice(0, insertionPoint)}\n    ${additions.join("\n    ")}${html.slice(insertionPoint)}`,
    addedTracks: additions.length,
  };
};

const restoreSourceVideoAudioTracks = async (projectDir: string) => {
  const indexPath = path.join(projectDir, "index.html");
  const result = ensureLocalVideoAudioTracks(await readFile(indexPath, "utf8"));
  if (result.addedTracks) await writeFile(indexPath, result.html, "utf8");
  return result.addedTracks;
};

const writeCodexPrompt = async (input: MotionCompositionInput, composition: MotionComposition, projectDir: string) => {
  const localAssets = composition.assets
    .map((item, index) => {
      const ext = item.url && dataUrlPattern.exec(item.url)?.[1]
        ? mimeExtension(dataUrlPattern.exec(item.url)?.[1], item.type)
        : extensionFromUrl(item.url || "", item.type);
      return `- ${item.type} ${item.id}: assets/${item.type}-${index + 1}${ext}`;
    });
  const prompt = [
    "# Codex HyperFrames Video Edit Job",
    "",
    "You are editing this HyperFrames project for Mindverse.",
    "",
    "## User / Agent Instruction",
    input.codexInstruction || input.prompt || "Create a polished short-video HyperFrames edit from the connected media.",
    "",
    "## Current Composition",
    `- Entry file: index.html`,
    `- Canvas: ${composition.canvas.width}x${composition.canvas.height}`,
    `- Duration: ${composition.canvas.duration}s`,
    `- FPS: ${composition.canvas.fps}`,
    `- Assets: ${composition.assets.length}`,
    `- Elements: ${composition.elements.length}`,
    "",
    "## Local Assets",
    ...(localAssets.length ? localAssets : ["- No localized media assets were provided."]),
    "",
    "## Local Runtime",
    "- GSAP is frozen locally at `assets/gsap.min.js`. Load it with `<script src=\"assets/gsap.min.js\"></script>` when using GSAP.",
    "- Do not load scripts, styles, fonts, images, audio, or video from a remote URL or CDN. HyperFrames renders must be deterministic and network-independent.",
    "",
    "## Required Workflow",
    "1. Edit index.html directly. Do not only change JSON variables or leave the generated baseline unchanged.",
    "2. Use every localized connected asset listed above. When multiple visual assets are connected, assemble all of them in listed order unless the user explicitly requests another order. Never leave the edit showing only the first asset.",
    "3. Preserve original audio from every connected video unless the user explicitly requests silence. Videos must remain `muted`; create separate direct-child `<audio>` elements using the same local video source, matching `data-start`, `data-duration`, and `data-media-start` for each audible source segment. Do not replace source sound with silence.",
    "4. Use connected audio as soundtrack, voice, or sound design according to the instruction. Mix external BGM with original video audio; do not silently ignore either source.",
    "5. Inspect local video duration with ffprobe when available. Do not make a media slot longer than its source unless the user explicitly requested looping or extension.",
    "6. The user instruction overrides the generated baseline. Keep the requested canvas dimensions and duration; when neither is requested, align root, media, and animation timing to the sources.",
    "7. Add a visible requested title, short-video pacing, animated caption/overlay treatment, subtle vignette, progress motion, and tasteful transitions.",
    "8. Keep title and caption text readable over every sampled frame with a compact dark backing, scrim, stroke, or strong shadow; do not rely on white text directly over changing footage.",
    "9. Ensure the video remains full-bleed and correctly framed for the current canvas, especially 9:16 vertical output.",
    "10. Use `node ../../../scripts/hyperframes-cli.mjs lint` while making structural edits. Run one final `node ../../../scripts/hyperframes-cli.mjs check --json`; it already includes lint.",
    "11. When the final check returns `ok: true`, stop immediately and return the result. Do not start optional polish passes or repeat a passing check.",
    "",
    "## Notes",
    "- This file is generated so Codex can take over the edit from the app.",
    "- The app already produced a renderable baseline; improve it rather than starting from an empty file.",
  ].join("\n");
  await writeFile(path.join(projectDir, "CODEX_PROMPT.md"), prompt, "utf8");
};

type RunProcessOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdoutLogPath?: string;
  stderrLogPath?: string;
};

class ProcessTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessTimeoutError";
  }
}

const terminateProcessTree = (pid: number | undefined) => {
  if (!pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.unref();
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The process may have exited between the timeout and cleanup.
  }
};

const runProcess = (command: string, args: string[], options: RunProcessOptions = {}) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      // Codex treats a piped stdin as additional prompt input and waits for EOF.
      // These jobs pass the complete prompt as an argument, so stdin must be closed.
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutLog = options.stdoutLogPath
      ? createWriteStream(options.stdoutLogPath, { flags: "w", encoding: "utf8" })
      : undefined;
    const stderrLog = options.stderrLogPath
      ? createWriteStream(options.stderrLogPath, { flags: "w", encoding: "utf8" })
      : undefined;
    stdoutLog?.on("error", () => undefined);
    stderrLog?.on("error", () => undefined);
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const closeLogs = () => {
      stdoutLog?.end();
      stderrLog?.end();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      closeLogs();
      reject(error);
    };
    timer = options.timeoutMs
      ? setTimeout(() => {
        terminateProcessTree(child.pid);
        const tail = (stderr.trim() || stdout.trim()).slice(-1800);
        fail(new ProcessTimeoutError(
          `${path.basename(command)} timed out after ${options.timeoutMs}ms.` +
          (tail ? ` Last output: ${tail}` : " No Codex output was received."),
        ));
      }, options.timeoutMs)
      : undefined;
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      stdoutLog?.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      stderrLog?.write(text);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      closeLogs();
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} failed with exit code ${code}.${stderr ? ` ${stderr.slice(-1800)}` : ""}`));
    });
  });

const codexCliPath = () => path.join(process.cwd(), "node_modules", "@openai", "codex", "bin", "codex.js");

const resolveHomePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  if (trimmed === "~") return homeDir || trimmed;
  if ((trimmed.startsWith("~/") || trimmed.startsWith("~\\")) && homeDir) {
    return path.join(homeDir, trimmed.slice(2));
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
};

const codexHome = () => {
  const configured =
    process.env.MINDVERSE_CODEX_HOME?.trim() ||
    process.env.CODEX_HOME?.trim();
  return resolveHomePath(configured || path.join(process.env.USERPROFILE || process.env.HOME || "", ".codex"));
};

type CodexRunRecord = {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  warning?: string;
  timedOut?: boolean;
  recoveredByCheck?: boolean;
  eventLogPath?: string;
  stderrLogPath?: string;
  instruction: string;
  completedAt: string;
};

const runCodexHyperframesEdit = async (projectDir: string, input: MotionCompositionInput) => {
  const cliPath = codexCliPath();
  if (!existsSync(cliPath)) {
    throw new Error("Codex CLI executable was not found. Run `npm install` so node_modules/@openai/codex is available.");
  }
  const promptPath = path.join(projectDir, "CODEX_PROMPT.md");
  const prompt = [
    await readFile(promptPath, "utf8"),
    "",
    "## Automation Constraints",
    "- Modify only files inside this HyperFrames job directory.",
    "- Make the composition visually richer than the generated baseline.",
    "- Do not ask follow-up questions.",
    "- Keep the result renderable by the existing HyperFrames CLI.",
    "- Stop after writing the improved files and obtaining the first passing final check.",
  ].join("\n");
  const outputPath = path.join(projectDir, "CODEX_RESULT.md");
  const eventLogPath = path.join(projectDir, "codex-events.jsonl");
  const stderrLogPath = path.join(projectDir, "codex-stderr.log");
  const args = [
    cliPath,
    "exec",
    "--ephemeral",
    "--cd", projectDir,
    "--skip-git-repo-check",
    "--json",
    "--output-last-message", outputPath,
    "--color", "never",
  ];
  if (codexBypassSandbox()) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("--sandbox", "workspace-write");
  }
  const model = process.env.MINDVERSE_CODEX_MODEL?.trim();
  if (model) args.push("--model", model);
  args.push(prompt);
  const env = {
    ...hyperframesEnv(),
    CODEX_HOME: codexHome(),
  };
  const configuredTimeout = Number(process.env.MINDVERSE_CODEX_TIMEOUT_MS || 600000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 600000;
  const result = await runProcess(process.execPath, args, {
    cwd: projectDir,
    env,
    timeoutMs,
    stdoutLogPath: eventLogPath,
    stderrLogPath,
  });
  const record: CodexRunRecord = {
    ok: true,
    stdout: result.stdout.slice(-4000),
    stderr: result.stderr.slice(-4000),
    eventLogPath,
    stderrLogPath,
    instruction: input.codexInstruction || input.prompt || "",
    completedAt: new Date().toISOString(),
  };
  await writeFile(path.join(projectDir, "codex-run.json"), JSON.stringify(record, null, 2), "utf8");
  return record;
};

const hyperframesEnv = () => {
  const ffprobePath = ffprobeStatic.path as string | undefined;
  const extraPaths = [
    ffmpegStaticPath ? path.dirname(ffmpegStaticPath) : undefined,
    ffprobePath ? path.dirname(ffprobePath) : undefined,
  ].filter((item): item is string => Boolean(item));
  return { ...process.env, PATH: [...extraPaths, process.env.PATH || ""].join(pathSeparator) };
};

const remoteDependencyPattern = /<(?:script|link|img|video|audio|source)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|fetch\(\s*["']https?:\/\//i;

const assertLocalRuntimeDependencies = async (projectDir: string) => {
  const html = await readFile(path.join(projectDir, "index.html"), "utf8");
  if (remoteDependencyPattern.test(html)) {
    throw new Error("Codex generated a remote script, style, or asset dependency. HyperFrames jobs must use localized assets and `assets/gsap.min.js` instead of a CDN.");
  }
};

const checkWithHyperframes = async (projectDir: string) => {
  const cliPath = path.join(process.cwd(), "node_modules", "hyperframes", "dist", "cli.js");
  await runProcess(process.execPath, [
    cliPath,
    "check",
    projectDir,
    "--json",
  ], {
    cwd: projectDir,
    env: hyperframesEnv(),
    timeoutMs: 180_000,
  });
};

const renderWithHyperframes = async (projectDir: string, outputPath: string, composition: MotionComposition) => {
  const cliPath = path.join(process.cwd(), "node_modules", "hyperframes", "dist", "cli.js");
  await runProcess(process.execPath, [
    cliPath,
    "render",
    projectDir,
    "--output", outputPath,
    "--format", "mp4",
    "--fps", String(composition.canvas.fps),
    "--quality", "standard",
    "--workers", "1",
    "--browser-timeout", "120",
    "--player-ready-timeout", "120000",
    "--low-memory-mode",
    "--quiet",
  ], { cwd: projectDir, env: hyperframesEnv() });
};

export const createMotionComposition = async (input: MotionCompositionInput) => {
  const composition = buildComposition(input);
  const persistent = isCodexHyperframesMode(input);
  const projectDir = persistent
    ? path.join(process.cwd(), ".mindverse", "hyperframes-jobs", randomUUID())
    : await mkdtemp(path.join(tmpdir(), "mindverse-motion-"));
  try {
    if (persistent) await mkdir(projectDir, { recursive: true });
    await writeProject(composition, projectDir);
    let codexRun: CodexRunRecord | undefined;
    if (persistent) {
      await writeCodexPrompt(input, composition, projectDir);
      let codexCompleted = false;
      try {
        codexRun = await runCodexHyperframesEdit(projectDir, input);
        codexCompleted = true;
        await restoreSourceVideoAudioTracks(projectDir);
        await assertLocalRuntimeDependencies(projectDir);
        await checkWithHyperframes(projectDir);
      } catch (error) {
        const timedOut = !codexCompleted && error instanceof ProcessTimeoutError;
        let recoveredByCheck = false;
        let recoveryError: unknown;
        if (timedOut) {
          await new Promise((resolve) => setTimeout(resolve, 750));
          try {
            await restoreSourceVideoAudioTracks(projectDir);
            await assertLocalRuntimeDependencies(projectDir);
            await checkWithHyperframes(projectDir);
            recoveredByCheck = true;
          } catch (checkError) {
            recoveryError = checkError;
          }
        }
        codexRun = recoveredByCheck
          ? {
            ok: true,
            warning: "Codex reached its time limit after editing, but the saved composition passed an independent HyperFrames check and was accepted.",
            timedOut: true,
            recoveredByCheck: true,
            eventLogPath: path.join(projectDir, "codex-events.jsonl"),
            stderrLogPath: path.join(projectDir, "codex-stderr.log"),
            instruction: input.codexInstruction || input.prompt || "",
            completedAt: new Date().toISOString(),
          }
          : {
            ok: false,
            error: [
              error instanceof Error ? error.message : "Codex execution failed.",
              recoveryError instanceof Error ? `Recovery check failed: ${recoveryError.message}` : "",
            ].filter(Boolean).join(" "),
            timedOut,
            recoveredByCheck: false,
            eventLogPath: path.join(projectDir, "codex-events.jsonl"),
            stderrLogPath: path.join(projectDir, "codex-stderr.log"),
            instruction: input.codexInstruction || input.prompt || "",
            completedAt: new Date().toISOString(),
          };
        await writeFile(path.join(projectDir, "codex-run.json"), JSON.stringify(codexRun, null, 2), "utf8");
        if (!recoveredByCheck && codexRequired()) {
          throw new Error(codexRun.error || "Codex HyperFrames execution failed.");
        }
      }
    }
    const outputPath = path.join(projectDir, "motion.mp4");
    await renderWithHyperframes(projectDir, outputPath, composition);
    const remotePath = `canvas/${dateKey()}/motion/${randomUUID()}.mp4`;
    const videoUrl = await uploadToBunny(await readFile(outputPath), remotePath, "video/mp4");
    const compositionJson = motionCompositionToJson(composition);
    return {
      status: "succeeded",
      composition,
      compositionJson,
      provider: "hyperframes",
      renderStatus: "rendered",
      videoUrl,
      resultUrl: videoUrl,
      width: composition.canvas.width,
      height: composition.canvas.height,
      duration: composition.canvas.duration,
      fps: composition.canvas.fps,
      assetCount: composition.assets.length,
      elementCount: composition.elements.length,
      motionMode: input.motionMode || "template",
      codexInstruction: input.codexInstruction,
      hyperframesProjectDir: persistent ? projectDir : undefined,
      codexPromptPath: persistent ? path.join(projectDir, "CODEX_PROMPT.md") : undefined,
      codexRunPath: persistent ? path.join(projectDir, "codex-run.json") : undefined,
      codexRun,
    };
  } finally {
    if (!persistent) await rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
  }
};
