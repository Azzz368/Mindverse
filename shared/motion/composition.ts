export type MotionAssetType = "video" | "image" | "audio" | "font" | "lottie";
export type MotionElementType = "video" | "image" | "text" | "caption" | "shape" | "audio" | "logo" | "progressBar" | "lowerThird";
export type MotionAnimationType = "fadeIn" | "fadeOut" | "slideIn" | "slideOut" | "scaleIn" | "scaleOut" | "typewriter" | "wordHighlight";

export type MotionAssetReference = {
  id: string;
  type: MotionAssetType;
  url?: string;
  title?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

export type MotionAnimation = {
  type: MotionAnimationType;
  duration: number;
  delay?: number;
  direction?: "left" | "right" | "up" | "down";
};

export type MotionElement = {
  id: string;
  type: MotionElementType;
  assetId?: string;
  text?: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  opacity?: number;
  style?: Record<string, string | number | boolean>;
  animations?: MotionAnimation[];
};

export type MotionComposition = {
  version: 1;
  title?: string;
  provider?: "hyperframes";
  canvas: {
    width: number;
    height: number;
    fps: number;
    duration: number;
    background?: string;
  };
  assets: MotionAssetReference[];
  elements: MotionElement[];
  templateId?: string;
  notes?: string;
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

const finiteNumber = (value: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const stringRecord = (value: unknown): Record<string, string | number | boolean> => {
  const raw = object(value);
  return Object.fromEntries(Object.entries(raw).filter(([, item]) =>
    typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  )) as Record<string, string | number | boolean>;
};

export const defaultMotionComposition = (title = "HyperFrames Composition"): MotionComposition => ({
  version: 1,
  title,
  provider: "hyperframes",
  canvas: { width: 1280, height: 720, fps: 30, duration: 10, background: "#05070a" },
  assets: [],
  elements: [
    {
      id: "title-1",
      type: "text",
      text: title,
      start: 0,
      duration: 3,
      x: 80,
      y: 80,
      width: 760,
      style: { fontSize: 56, color: "#ffffff", fontWeight: 700 },
      animations: [{ type: "fadeIn", duration: 0.4 }, { type: "fadeOut", duration: 0.4, delay: 2.6 }],
    },
  ],
});

export const compositionFromJson = (rawJson: string | undefined, title?: string): MotionComposition => {
  if (!rawJson?.trim()) return defaultMotionComposition(title);
  try {
    return normalizeMotionComposition(JSON.parse(rawJson), title);
  } catch {
    return defaultMotionComposition(title);
  }
};

export const motionCompositionToJson = (composition: MotionComposition) =>
  JSON.stringify(composition, null, 2);

export const normalizeMotionComposition = (value: unknown, fallbackTitle = "HyperFrames Composition"): MotionComposition => {
  const raw = object(value);
  const canvas = object(raw.canvas);
  const width = finiteNumber(canvas.width, 1280, 64, 7680);
  const height = finiteNumber(canvas.height, 720, 64, 7680);
  const fps = finiteNumber(canvas.fps, 30, 1, 120);
  const duration = finiteNumber(canvas.duration, 10, 0.1, 3600);
  const assets = Array.isArray(raw.assets) ? raw.assets.map((item, index) => {
    const asset = object(item);
    const type = text(asset.type) as MotionAssetType;
    return {
      id: text(asset.id) || `asset-${index + 1}`,
      type: ["video", "image", "audio", "font", "lottie"].includes(type) ? type : "video",
      url: text(asset.url) || undefined,
      title: text(asset.title) || undefined,
      mimeType: text(asset.mimeType) || undefined,
      metadata: object(asset.metadata),
    };
  }) : [];
  const elements = Array.isArray(raw.elements) ? raw.elements.map((item, index) => {
    const element = object(item);
    const type = text(element.type) as MotionElementType;
    const animations = Array.isArray(element.animations) ? element.animations.map((animationItem) => {
      const animation = object(animationItem);
      const animationType = text(animation.type) as MotionAnimationType;
      return {
        type: ["fadeIn", "fadeOut", "slideIn", "slideOut", "scaleIn", "scaleOut", "typewriter", "wordHighlight"].includes(animationType) ? animationType : "fadeIn",
        duration: finiteNumber(animation.duration, 0.4, 0, 30),
        delay: animation.delay === undefined ? undefined : finiteNumber(animation.delay, 0, 0, 3600),
        direction: ["left", "right", "up", "down"].includes(text(animation.direction)) ? text(animation.direction) as MotionAnimation["direction"] : undefined,
      };
    }) : undefined;
    return {
      id: text(element.id) || `element-${index + 1}`,
      type: ["video", "image", "text", "caption", "shape", "audio", "logo", "progressBar", "lowerThird"].includes(type) ? type : "text",
      assetId: text(element.assetId) || undefined,
      text: text(element.text) || undefined,
      start: finiteNumber(element.start, 0, 0, 3600),
      duration: finiteNumber(element.duration, 3, 0.1, 3600),
      x: finiteNumber(element.x, 0, -20000, 20000),
      y: finiteNumber(element.y, 0, -20000, 20000),
      width: element.width === undefined ? undefined : finiteNumber(element.width, 640, 0, 20000),
      height: element.height === undefined ? undefined : finiteNumber(element.height, 360, 0, 20000),
      opacity: element.opacity === undefined ? undefined : finiteNumber(element.opacity, 1, 0, 1),
      style: stringRecord(element.style),
      animations,
    };
  }) : defaultMotionComposition(fallbackTitle).elements;
  return {
    version: 1,
    title: text(raw.title) || fallbackTitle,
    provider: "hyperframes",
    canvas: { width, height, fps, duration, background: text(canvas.background) || "#05070a" },
    assets,
    elements,
    templateId: text(raw.templateId) || undefined,
    notes: text(raw.notes) || undefined,
  };
};
