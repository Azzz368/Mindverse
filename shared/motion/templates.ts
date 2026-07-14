import type { MotionComposition, MotionElement } from "./composition";

export type MotionTemplateVariableType = "string" | "number" | "color" | "select" | "boolean";

export type MotionTemplateVariableSchema = Record<string, {
  type: MotionTemplateVariableType;
  label: string;
  description?: string;
  options?: string[];
}>;

export type MotionTemplateInput = Record<string, unknown>;

export type MotionTemplate = {
  id: string;
  name: string;
  description: string;
  variableSchema: MotionTemplateVariableSchema;
  defaults: MotionTemplateInput;
  renderToComposition(input: MotionTemplateInput): MotionComposition;
};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const num = (value: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : typeof value === "string" ? value.toLowerCase() === "true" : fallback;

const color = (value: unknown, fallback: string) => {
  const next = text(value);
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(next) || /^(rgb|hsl)a?\(/i.test(next) ? next : fallback;
};

const canvasFor = (aspectRatio: unknown, duration: unknown, background: unknown) => {
  const ratio = text(aspectRatio, "16:9");
  const size = ratio === "9:16"
    ? { width: 1080, height: 1920 }
    : ratio === "1:1"
      ? { width: 1080, height: 1080 }
      : { width: 1280, height: 720 };
  return { ...size, fps: 30, duration: num(duration, 8, 1, 60), background: text(background, "#05070a") };
};

const fade = (duration = 0.45): MotionElement["animations"] => [
  { type: "fadeIn", duration },
  { type: "fadeOut", duration },
];

const slideFade = (direction: "left" | "right" | "up" | "down" = "up"): MotionElement["animations"] => [
  { type: "fadeIn", duration: 0.35 },
  { type: "slideIn", duration: 0.45, direction },
  { type: "fadeOut", duration: 0.45 },
];

const optionalTextElement = (element: MotionElement, value: string) => value ? [element] : [];

const baseComposition = (
  templateId: string,
  title: string,
  canvas: MotionComposition["canvas"],
  elements: MotionElement[],
): MotionComposition => ({
  version: 1,
  title,
  provider: "hyperframes",
  canvas,
  assets: [],
  elements,
  templateId,
});

const commonSchema = {
  title: { type: "string", label: "Title" },
  subtitle: { type: "string", label: "Subtitle" },
  duration: { type: "number", label: "Duration seconds" },
  aspectRatio: { type: "select", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
  background: { type: "color", label: "Background" },
  accentColor: { type: "color", label: "Accent color" },
  textColor: { type: "color", label: "Text color" },
} satisfies MotionTemplateVariableSchema;

export const motionTemplates: MotionTemplate[] = [
  {
    id: "basic-title",
    name: "Basic Title",
    description: "A clean animated title and optional subtitle over connected media.",
    variableSchema: commonSchema,
    defaults: {
      title: "Mindverse Motion",
      subtitle: "",
      duration: 6,
      aspectRatio: "16:9",
      background: "#05070a",
      accentColor: "#38bdf8",
      textColor: "#ffffff",
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const title = text(v.title, "Mindverse Motion");
      const subtitle = text(v.subtitle);
      const textColor = color(v.textColor, "#ffffff");
      const accentColor = color(v.accentColor, "#38bdf8");
      return baseComposition("basic-title", title, canvas, [
        {
          id: "title",
          type: "text",
          text: title,
          start: 0.3,
          duration: canvas.duration - 0.6,
          x: Math.round(canvas.width * 0.07),
          y: Math.round(canvas.height * 0.16),
          width: Math.round(canvas.width * 0.72),
          height: Math.round(canvas.height * 0.18),
          style: { fontSize: Math.round(canvas.width * 0.05), color: textColor, fontWeight: 800, lineHeight: 1.05, textShadow: "0 12px 40px rgba(0,0,0,.38)" },
          animations: fade(0.45),
        },
        ...optionalTextElement({
          id: "subtitle",
          type: "caption",
          text: subtitle,
          start: 0.9,
          duration: Math.max(2, canvas.duration - 1.4),
          x: Math.round(canvas.width * 0.07),
          y: Math.round(canvas.height * 0.36),
          width: Math.round(canvas.width * 0.52),
          height: Math.round(canvas.height * 0.08),
          style: { fontSize: Math.round(canvas.width * 0.018), color: textColor, background: "rgba(0,0,0,.42)", border: `1px solid ${accentColor}` },
          animations: slideFade("left"),
        }, subtitle),
      ]);
    },
  },
  {
    id: "cinematic-title-lower-third",
    name: "Cinematic Title Lower Third",
    description: "Opening title, lower third, and optional bottom progress bar.",
    variableSchema: {
      ...commonSchema,
      lowerTitle: { type: "string", label: "Lower-third title" },
      lowerSubtitle: { type: "string", label: "Lower-third subtitle" },
      showProgress: { type: "boolean", label: "Show progress bar" },
    },
    defaults: {
      title: "Opening Title",
      subtitle: "",
      lowerTitle: "Subject",
      lowerSubtitle: "Scene detail",
      duration: 8,
      aspectRatio: "16:9",
      background: "#05070a",
      accentColor: "#f8d66d",
      textColor: "#ffffff",
      showProgress: true,
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const title = text(v.title, "Opening Title");
      const subtitle = text(v.subtitle);
      const lowerTitle = text(v.lowerTitle, title);
      const lowerSubtitle = text(v.lowerSubtitle);
      const accentColor = color(v.accentColor, "#f8d66d");
      const textColor = color(v.textColor, "#ffffff");
      const progress = bool(v.showProgress, true);
      return baseComposition("cinematic-title-lower-third", title, canvas, [
        {
          id: "vignette",
          type: "shape",
          start: 0,
          duration: canvas.duration,
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          style: { background: "linear-gradient(90deg,rgba(0,0,0,.62),rgba(0,0,0,.12) 58%,rgba(0,0,0,.5))" },
          animations: [],
        },
        {
          id: "title",
          type: "text",
          text: title,
          start: 0.35,
          duration: Math.min(4.2, canvas.duration - 0.7),
          x: Math.round(canvas.width * 0.07),
          y: Math.round(canvas.height * 0.14),
          width: Math.round(canvas.width * 0.72),
          height: Math.round(canvas.height * 0.18),
          style: { fontSize: Math.round(canvas.width * 0.055), color: textColor, fontWeight: 900, lineHeight: 1.02, textShadow: "0 16px 44px rgba(0,0,0,.42)" },
          animations: [{ type: "fadeIn", duration: 0.5 }, { type: "slideIn", duration: 0.5, direction: "left" }, { type: "fadeOut", duration: 0.45 }],
        },
        ...optionalTextElement({
          id: "subtitle",
          type: "text",
          text: subtitle,
          start: 1.0,
          duration: Math.min(3.6, canvas.duration - 1.2),
          x: Math.round(canvas.width * 0.075),
          y: Math.round(canvas.height * 0.32),
          width: Math.round(canvas.width * 0.58),
          height: Math.round(canvas.height * 0.08),
          style: { fontSize: Math.round(canvas.width * 0.023), color: accentColor, fontWeight: 700, textTransform: "uppercase" },
          animations: fade(0.35),
        }, subtitle),
        {
          id: "lower-third",
          type: "lowerThird",
          text: [lowerTitle, lowerSubtitle].filter(Boolean).join("\n"),
          start: Math.max(1.2, canvas.duration * 0.48),
          duration: Math.max(2.2, canvas.duration * 0.42),
          x: Math.round(canvas.width * 0.055),
          y: Math.round(canvas.height * 0.68),
          width: Math.round(canvas.width * 0.44),
          height: Math.round(canvas.height * 0.16),
          style: { border: `1px solid ${accentColor}`, borderRadius: 14, background: "linear-gradient(90deg,rgba(5,7,10,.9),rgba(5,7,10,.56))" },
          animations: slideFade("left"),
        },
        ...(progress ? [{
          id: "progress",
          type: "progressBar" as const,
          start: 0,
          duration: canvas.duration,
          x: Math.round(canvas.width * 0.055),
          y: Math.round(canvas.height - 28),
          width: Math.round(canvas.width * 0.89),
          height: 7,
          style: { fillColor: accentColor, trackColor: "rgba(255,255,255,.18)", borderRadius: 999 },
          animations: [{ type: "fadeIn" as const, duration: 0.25 }, { type: "fadeOut" as const, duration: 0.35 }],
        }] : []),
      ]);
    },
  },
  {
    id: "captioned-social-video",
    name: "Captioned Social Video",
    description: "Vertical-friendly title and caption treatment for short social clips.",
    variableSchema: {
      ...commonSchema,
      caption: { type: "string", label: "Caption" },
      captionBackground: { type: "color", label: "Caption background" },
    },
    defaults: {
      title: "Social Clip",
      subtitle: "",
      caption: "Add a clear caption here",
      duration: 10,
      aspectRatio: "9:16",
      background: "#05070a",
      accentColor: "#22c55e",
      textColor: "#ffffff",
      captionBackground: "rgba(0,0,0,.64)",
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const title = text(v.title, "Social Clip");
      const caption = text(v.caption, text(v.subtitle, title));
      return baseComposition("captioned-social-video", title, canvas, [
        {
          id: "top-title",
          type: "text",
          text: title,
          start: 0.4,
          duration: Math.max(2.5, canvas.duration * 0.45),
          x: Math.round(canvas.width * 0.08),
          y: Math.round(canvas.height * 0.06),
          width: Math.round(canvas.width * 0.84),
          height: Math.round(canvas.height * 0.12),
          style: { fontSize: Math.round(canvas.width * 0.065), color: color(v.textColor, "#ffffff"), fontWeight: 900, lineHeight: 1.05, textAlign: "center" },
          animations: slideFade("up"),
        },
        {
          id: "caption",
          type: "caption",
          text: caption,
          start: Math.max(0.8, canvas.duration * 0.42),
          duration: Math.max(2.6, canvas.duration * 0.48),
          x: Math.round(canvas.width * 0.07),
          y: Math.round(canvas.height * 0.72),
          width: Math.round(canvas.width * 0.86),
          height: Math.round(canvas.height * 0.13),
          style: { fontSize: Math.round(canvas.width * 0.05), color: color(v.textColor, "#ffffff"), background: text(v.captionBackground, "rgba(0,0,0,.64)"), border: `1px solid ${color(v.accentColor, "#22c55e")}` },
          animations: fade(0.3),
        },
      ]);
    },
  },
  {
    id: "progress-bar-overlay",
    name: "Progress Bar Overlay",
    description: "A minimal timed progress bar with optional label.",
    variableSchema: {
      label: { type: "string", label: "Label" },
      duration: { type: "number", label: "Duration seconds" },
      aspectRatio: { type: "select", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
      fillColor: { type: "color", label: "Fill color" },
      trackColor: { type: "string", label: "Track color" },
      height: { type: "number", label: "Bar height" },
      background: { type: "color", label: "Background" },
    },
    defaults: {
      label: "",
      duration: 10,
      aspectRatio: "16:9",
      fillColor: "#38bdf8",
      trackColor: "rgba(255,255,255,.18)",
      height: 8,
      background: "#05070a",
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const label = text(v.label);
      const barHeight = num(v.height, 8, 2, 40);
      return baseComposition("progress-bar-overlay", label || "Progress Overlay", canvas, [
        ...optionalTextElement({
          id: "label",
          type: "text",
          text: label,
          start: 0.2,
          duration: canvas.duration - 0.4,
          x: Math.round(canvas.width * 0.055),
          y: Math.round(canvas.height - 68),
          width: Math.round(canvas.width * 0.45),
          height: 28,
          style: { fontSize: 20, color: "#ffffff", fontWeight: 700, textShadow: "0 10px 28px rgba(0,0,0,.45)" },
          animations: fade(0.25),
        }, label),
        {
          id: "progress",
          type: "progressBar",
          start: 0,
          duration: canvas.duration,
          x: Math.round(canvas.width * 0.055),
          y: Math.round(canvas.height - 32),
          width: Math.round(canvas.width * 0.89),
          height: barHeight,
          style: { fillColor: color(v.fillColor, "#38bdf8"), trackColor: text(v.trackColor, "rgba(255,255,255,.18)"), borderRadius: 999 },
          animations: fade(0.25),
        },
      ]);
    },
  },
  {
    id: "product-card-overlay",
    name: "Product Card Overlay",
    description: "A compact product card with name, tagline, price, and CTA.",
    variableSchema: {
      productName: { type: "string", label: "Product name" },
      tagline: { type: "string", label: "Tagline" },
      price: { type: "string", label: "Price" },
      cta: { type: "string", label: "CTA" },
      duration: { type: "number", label: "Duration seconds" },
      aspectRatio: { type: "select", label: "Aspect ratio", options: ["16:9", "9:16", "1:1"] },
      background: { type: "color", label: "Background" },
      accentColor: { type: "color", label: "Accent color" },
      textColor: { type: "color", label: "Text color" },
    },
    defaults: {
      productName: "Product Name",
      tagline: "A sharp benefit in one line",
      price: "",
      cta: "Learn more",
      duration: 8,
      aspectRatio: "16:9",
      background: "#05070a",
      accentColor: "#38bdf8",
      textColor: "#ffffff",
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const productName = text(v.productName, "Product Name");
      const tagline = text(v.tagline);
      const price = text(v.price);
      const cta = text(v.cta, "Learn more");
      const cardWidth = Math.round(canvas.width * (canvas.width < canvas.height ? 0.84 : 0.38));
      const cardHeight = Math.round(canvas.height * (canvas.width < canvas.height ? 0.26 : 0.36));
      const x = Math.round(canvas.width * 0.06);
      const y = Math.round(canvas.height - cardHeight - canvas.height * 0.08);
      return baseComposition("product-card-overlay", productName, canvas, [
        {
          id: "card",
          type: "shape",
          start: 0.35,
          duration: canvas.duration - 0.7,
          x,
          y,
          width: cardWidth,
          height: cardHeight,
          style: { background: "rgba(4,8,14,.78)", border: `1px solid ${color(v.accentColor, "#38bdf8")}`, borderRadius: 18, boxShadow: "0 22px 60px rgba(0,0,0,.32)" },
          animations: slideFade("left"),
        },
        {
          id: "product-name",
          type: "text",
          text: productName,
          start: 0.55,
          duration: canvas.duration - 1,
          x: x + 30,
          y: y + 28,
          width: cardWidth - 60,
          height: Math.round(cardHeight * 0.26),
          style: { fontSize: Math.round(cardWidth * 0.09), color: color(v.textColor, "#ffffff"), fontWeight: 900, lineHeight: 1.05 },
          animations: fade(0.3),
        },
        ...optionalTextElement({
          id: "tagline",
          type: "text",
          text: tagline,
          start: 0.75,
          duration: canvas.duration - 1.2,
          x: x + 30,
          y: y + Math.round(cardHeight * 0.42),
          width: cardWidth - 60,
          height: Math.round(cardHeight * 0.2),
          style: { fontSize: Math.round(cardWidth * 0.045), color: "rgba(255,255,255,.76)", lineHeight: 1.18 },
          animations: fade(0.3),
        }, tagline),
        ...optionalTextElement({
          id: "price",
          type: "text",
          text: price,
          start: 0.95,
          duration: canvas.duration - 1.4,
          x: x + 30,
          y: y + Math.round(cardHeight * 0.66),
          width: Math.round(cardWidth * 0.38),
          height: Math.round(cardHeight * 0.14),
          style: { fontSize: Math.round(cardWidth * 0.056), color: color(v.accentColor, "#38bdf8"), fontWeight: 800 },
          animations: fade(0.25),
        }, price),
        {
          id: "cta",
          type: "caption",
          text: cta,
          start: 1.1,
          duration: canvas.duration - 1.55,
          x: x + Math.round(cardWidth * 0.52),
          y: y + Math.round(cardHeight * 0.64),
          width: Math.round(cardWidth * 0.34),
          height: Math.round(cardHeight * 0.17),
          style: { fontSize: Math.round(cardWidth * 0.04), color: "#030303", background: color(v.accentColor, "#38bdf8"), fontWeight: 800 },
          animations: fade(0.25),
        },
      ]);
    },
  },
  {
    id: "social-cinematic-hook",
    name: "Social Cinematic Hook",
    description: "A polished vertical short-video hook with metadata chrome, bold title, caption, and progress.",
    variableSchema: {
      title: { type: "string", label: "Title" },
      kicker: { type: "string", label: "Kicker" },
      caption: { type: "string", label: "Caption" },
      location: { type: "string", label: "Location" },
      duration: { type: "number", label: "Duration seconds" },
      aspectRatio: { type: "select", label: "Aspect ratio", options: ["9:16", "16:9", "1:1"] },
      background: { type: "color", label: "Background" },
      accentColor: { type: "color", label: "Accent color" },
      textColor: { type: "color", label: "Text color" },
      showProgress: { type: "boolean", label: "Show progress bar" },
    },
    defaults: {
      title: "The Visit",
      kicker: "TODAY",
      caption: "A cinematic campus moment",
      location: "HKUST",
      duration: 5,
      aspectRatio: "9:16",
      background: "#05070a",
      accentColor: "#f8d66d",
      textColor: "#ffffff",
      showProgress: true,
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const title = text(v.title, "The Visit");
      const kicker = text(v.kicker, "TODAY");
      const caption = text(v.caption);
      const location = text(v.location, "HKUST");
      const accentColor = color(v.accentColor, "#f8d66d");
      const textColor = color(v.textColor, "#ffffff");
      const showProgress = bool(v.showProgress, true);
      const margin = Math.round(canvas.width * 0.055);
      return baseComposition("social-cinematic-hook", title, canvas, [
        {
          id: "cinematic-vignette",
          type: "shape",
          start: 0,
          duration: canvas.duration,
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          style: { background: "linear-gradient(180deg,rgba(0,0,0,.58),rgba(0,0,0,.08) 42%,rgba(0,0,0,.72))" },
          animations: [],
        },
        {
          id: "top-rule",
          type: "shape",
          start: 0.15,
          duration: canvas.duration - 0.3,
          x: margin,
          y: Math.round(canvas.height * 0.045),
          width: canvas.width - margin * 2,
          height: 2,
          style: { background: "rgba(255,255,255,.38)" },
          animations: fade(0.25),
        },
        {
          id: "kicker",
          type: "caption",
          text: kicker,
          start: 0.25,
          duration: Math.max(2.2, canvas.duration - 0.6),
          x: margin,
          y: Math.round(canvas.height * 0.062),
          width: Math.round(canvas.width * 0.28),
          height: Math.round(canvas.height * 0.036),
          style: { fontSize: Math.round(canvas.width * 0.026), color: "#05070a", background: accentColor, fontWeight: 900, textTransform: "uppercase" },
          animations: slideFade("left"),
        },
        {
          id: "location",
          type: "text",
          text: location,
          start: 0.35,
          duration: Math.max(2.2, canvas.duration - 0.75),
          x: Math.round(canvas.width * 0.55),
          y: Math.round(canvas.height * 0.068),
          width: Math.round(canvas.width * 0.38),
          height: Math.round(canvas.height * 0.035),
          style: { fontSize: Math.round(canvas.width * 0.027), color: "rgba(255,255,255,.82)", fontWeight: 700, textAlign: "right", textTransform: "uppercase" },
          animations: fade(0.25),
        },
        {
          id: "title",
          type: "text",
          text: title,
          start: 0.45,
          duration: Math.max(2.6, canvas.duration * 0.62),
          x: margin,
          y: Math.round(canvas.height * 0.15),
          width: canvas.width - margin * 2,
          height: Math.round(canvas.height * 0.22),
          style: { fontSize: Math.round(canvas.width * 0.092), color: textColor, fontWeight: 900, lineHeight: 0.98, textShadow: "0 18px 54px rgba(0,0,0,.55)" },
          animations: [{ type: "fadeIn", duration: 0.25 }, { type: "scaleIn", duration: 0.45 }, { type: "fadeOut", duration: 0.35 }],
        },
        ...optionalTextElement({
          id: "caption",
          type: "caption",
          text: caption,
          start: Math.max(0.9, canvas.duration * 0.5),
          duration: Math.max(1.8, canvas.duration * 0.42),
          x: margin,
          y: Math.round(canvas.height * 0.74),
          width: canvas.width - margin * 2,
          height: Math.round(canvas.height * 0.1),
          style: { fontSize: Math.round(canvas.width * 0.044), color: textColor, background: "rgba(4,8,14,.72)", border: `1px solid ${accentColor}`, fontWeight: 800, lineHeight: 1.12 },
          animations: slideFade("up"),
        }, caption),
        ...(showProgress ? [{
          id: "progress",
          type: "progressBar" as const,
          start: 0,
          duration: canvas.duration,
          x: margin,
          y: Math.round(canvas.height - canvas.height * 0.065),
          width: canvas.width - margin * 2,
          height: 6,
          style: { fillColor: accentColor, trackColor: "rgba(255,255,255,.22)", borderRadius: 999 },
          animations: fade(0.2),
        }] : []),
      ]);
    },
  },
  {
    id: "campus-news-reel",
    name: "Campus News Reel",
    description: "A produced campus/news package with headline, location slug, ticker, frame marks, and progress.",
    variableSchema: {
      headline: { type: "string", label: "Headline" },
      subhead: { type: "string", label: "Subhead" },
      location: { type: "string", label: "Location" },
      ticker: { type: "string", label: "Ticker" },
      duration: { type: "number", label: "Duration seconds" },
      aspectRatio: { type: "select", label: "Aspect ratio", options: ["9:16", "16:9", "1:1"] },
      accentColor: { type: "color", label: "Accent color" },
      textColor: { type: "color", label: "Text color" },
      background: { type: "color", label: "Background" },
    },
    defaults: {
      headline: "Campus Visit",
      subhead: "A five-second highlight",
      location: "HONG KONG UNIVERSITY OF SCIENCE AND TECHNOLOGY",
      ticker: "MINDVERSE FIELD NOTE / SHORT VIDEO PACKAGE",
      duration: 5,
      aspectRatio: "9:16",
      accentColor: "#67e8f9",
      textColor: "#ffffff",
      background: "#041016",
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const headline = text(v.headline, "Campus Visit");
      const subhead = text(v.subhead);
      const location = text(v.location, "HKUST");
      const ticker = text(v.ticker, "MINDVERSE FIELD NOTE");
      const accentColor = color(v.accentColor, "#67e8f9");
      const textColor = color(v.textColor, "#ffffff");
      const margin = Math.round(canvas.width * 0.052);
      const lowerY = Math.round(canvas.height * 0.68);
      return baseComposition("campus-news-reel", headline, canvas, [
        {
          id: "news-vignette",
          type: "shape",
          start: 0,
          duration: canvas.duration,
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          style: { background: "linear-gradient(180deg,rgba(0,0,0,.48),rgba(0,0,0,.04) 44%,rgba(0,0,0,.78))" },
          animations: [],
        },
        {
          id: "frame-top-left",
          type: "shape",
          start: 0.15,
          duration: canvas.duration - 0.3,
          x: margin,
          y: Math.round(canvas.height * 0.04),
          width: Math.round(canvas.width * 0.18),
          height: 3,
          style: { background: accentColor },
          animations: slideFade("left"),
        },
        {
          id: "frame-bottom-right",
          type: "shape",
          start: 0.2,
          duration: canvas.duration - 0.35,
          x: Math.round(canvas.width * 0.76),
          y: Math.round(canvas.height * 0.94),
          width: Math.round(canvas.width * 0.18),
          height: 3,
          style: { background: accentColor },
          animations: slideFade("right"),
        },
        {
          id: "location",
          type: "caption",
          text: location,
          start: 0.3,
          duration: Math.max(2, canvas.duration - 0.55),
          x: margin,
          y: Math.round(canvas.height * 0.055),
          width: canvas.width - margin * 2,
          height: Math.round(canvas.height * 0.045),
          style: { fontSize: Math.round(canvas.width * 0.025), color: "#061016", background: accentColor, fontWeight: 900, textTransform: "uppercase" },
          animations: fade(0.25),
        },
        {
          id: "headline-card",
          type: "shape",
          start: 0.55,
          duration: Math.max(2, canvas.duration - 0.9),
          x: margin,
          y: lowerY,
          width: canvas.width - margin * 2,
          height: Math.round(canvas.height * 0.17),
          style: { background: "rgba(3,10,18,.78)", border: `1px solid ${accentColor}`, borderRadius: 10, boxShadow: "0 24px 70px rgba(0,0,0,.42)" },
          animations: slideFade("up"),
        },
        {
          id: "headline",
          type: "text",
          text: headline,
          start: 0.7,
          duration: Math.max(2, canvas.duration - 1.1),
          x: margin + 24,
          y: lowerY + 20,
          width: canvas.width - margin * 2 - 48,
          height: Math.round(canvas.height * 0.075),
          style: { fontSize: Math.round(canvas.width * 0.062), color: textColor, fontWeight: 900, lineHeight: 1.0 },
          animations: fade(0.25),
        },
        ...optionalTextElement({
          id: "subhead",
          type: "text",
          text: subhead,
          start: 0.9,
          duration: Math.max(1.8, canvas.duration - 1.25),
          x: margin + 24,
          y: lowerY + Math.round(canvas.height * 0.095),
          width: canvas.width - margin * 2 - 48,
          height: Math.round(canvas.height * 0.04),
          style: { fontSize: Math.round(canvas.width * 0.034), color: "rgba(255,255,255,.76)", fontWeight: 600 },
          animations: fade(0.25),
        }, subhead),
        {
          id: "ticker",
          type: "caption",
          text: ticker,
          start: Math.max(1, canvas.duration * 0.45),
          duration: Math.max(1.6, canvas.duration * 0.45),
          x: margin,
          y: Math.round(canvas.height * 0.88),
          width: canvas.width - margin * 2,
          height: Math.round(canvas.height * 0.044),
          style: { fontSize: Math.round(canvas.width * 0.027), color: textColor, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.22)", fontWeight: 800, textTransform: "uppercase" },
          animations: slideFade("left"),
        },
        {
          id: "progress",
          type: "progressBar",
          start: 0,
          duration: canvas.duration,
          x: margin,
          y: Math.round(canvas.height * 0.925),
          width: canvas.width - margin * 2,
          height: 5,
          style: { fillColor: accentColor, trackColor: "rgba(255,255,255,.2)", borderRadius: 999 },
          animations: fade(0.2),
        },
      ]);
    },
  },
  {
    id: "creator-recap-stack",
    name: "Creator Recap Stack",
    description: "A creator-style recap overlay with three stacked beats, useful for vlogs and punchy shorts.",
    variableSchema: {
      title: { type: "string", label: "Title" },
      beat1: { type: "string", label: "Beat 1" },
      beat2: { type: "string", label: "Beat 2" },
      beat3: { type: "string", label: "Beat 3" },
      footer: { type: "string", label: "Footer" },
      duration: { type: "number", label: "Duration seconds" },
      aspectRatio: { type: "select", label: "Aspect ratio", options: ["9:16", "16:9", "1:1"] },
      accentColor: { type: "color", label: "Accent color" },
      textColor: { type: "color", label: "Text color" },
      background: { type: "color", label: "Background" },
    },
    defaults: {
      title: "5 秒回顾",
      beat1: "到达现场",
      beat2: "校园参观",
      beat3: "高光瞬间",
      footer: "Mindverse Cut",
      duration: 5,
      aspectRatio: "9:16",
      accentColor: "#fb7185",
      textColor: "#ffffff",
      background: "#08070a",
    },
    renderToComposition(input) {
      const v = input;
      const canvas = canvasFor(v.aspectRatio, v.duration, v.background);
      const title = text(v.title, "5 秒回顾");
      const beats = [text(v.beat1), text(v.beat2), text(v.beat3)].filter(Boolean);
      const footer = text(v.footer, "Mindverse Cut");
      const accentColor = color(v.accentColor, "#fb7185");
      const textColor = color(v.textColor, "#ffffff");
      const margin = Math.round(canvas.width * 0.06);
      const cardWidth = canvas.width - margin * 2;
      const cardHeight = Math.round(canvas.height * 0.068);
      const firstY = Math.round(canvas.height * 0.58);
      const beatElements: MotionElement[] = beats.flatMap((beat, index) => {
        const y = firstY + index * Math.round(cardHeight * 1.22);
        const items: MotionElement[] = [
          {
            id: `beat-bg-${index + 1}`,
            type: "shape",
            start: 0.55 + index * 0.18,
            duration: Math.max(1.8, canvas.duration - 0.9 - index * 0.12),
            x: margin,
            y,
            width: cardWidth,
            height: cardHeight,
            style: { background: "rgba(4,8,14,.72)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 12, boxShadow: "0 16px 44px rgba(0,0,0,.28)" },
            animations: slideFade(index % 2 ? "right" : "left"),
          },
          {
            id: `beat-accent-${index + 1}`,
            type: "shape",
            start: 0.62 + index * 0.18,
            duration: Math.max(1.8, canvas.duration - 1 - index * 0.12),
            x: margin + 12,
            y: y + Math.round(cardHeight * 0.22),
            width: 7,
            height: Math.round(cardHeight * 0.56),
            style: { background: accentColor, borderRadius: 999 },
            animations: fade(0.2),
          },
          {
            id: `beat-text-${index + 1}`,
            type: "text",
            text: beat,
            start: 0.72 + index * 0.18,
            duration: Math.max(1.7, canvas.duration - 1.1 - index * 0.12),
            x: margin + 34,
            y: y + Math.round(cardHeight * 0.22),
            width: cardWidth - 56,
            height: Math.round(cardHeight * 0.56),
            style: { fontSize: Math.round(canvas.width * 0.04), color: textColor, fontWeight: 800, lineHeight: 1.08 },
            animations: fade(0.18),
          },
        ];
        return items;
      });
      return baseComposition("creator-recap-stack", title, canvas, [
        {
          id: "recap-vignette",
          type: "shape",
          start: 0,
          duration: canvas.duration,
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
          style: { background: "linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,.08) 46%,rgba(0,0,0,.72))" },
          animations: [],
        },
        {
          id: "title-pill-bg",
          type: "shape",
          start: 0.2,
          duration: Math.max(2, canvas.duration - 0.45),
          x: margin,
          y: Math.round(canvas.height * 0.07),
          width: Math.round(canvas.width * 0.55),
          height: Math.round(canvas.height * 0.055),
          style: { background: "rgba(0,0,0,.58)", border: `1px solid ${accentColor}`, borderRadius: 999, boxShadow: "0 18px 50px rgba(0,0,0,.35)" },
          animations: slideFade("left"),
        },
        {
          id: "title",
          type: "text",
          text: title,
          start: 0.32,
          duration: Math.max(2, canvas.duration - 0.7),
          x: margin + 22,
          y: Math.round(canvas.height * 0.081),
          width: Math.round(canvas.width * 0.48),
          height: Math.round(canvas.height * 0.035),
          style: { fontSize: Math.round(canvas.width * 0.038), color: textColor, fontWeight: 900, lineHeight: 1.0 },
          animations: fade(0.2),
        },
        ...beatElements,
        {
          id: "footer",
          type: "caption",
          text: footer,
          start: Math.max(1.1, canvas.duration * 0.62),
          duration: Math.max(1.4, canvas.duration * 0.32),
          x: margin,
          y: Math.round(canvas.height * 0.89),
          width: cardWidth,
          height: Math.round(canvas.height * 0.04),
          style: { fontSize: Math.round(canvas.width * 0.027), color: "#05070a", background: accentColor, fontWeight: 900, textTransform: "uppercase" },
          animations: fade(0.2),
        },
      ]);
    },
  },
];

export const motionTemplateIds = motionTemplates.map((template) => template.id);

export const getMotionTemplate = (templateId: string | undefined) =>
  motionTemplates.find((template) => template.id === templateId);

export const parseMotionVariablesJson = (rawJson: string | undefined): MotionTemplateInput => {
  if (!rawJson?.trim()) return {};
  try {
    const value = JSON.parse(rawJson);
    return value && typeof value === "object" && !Array.isArray(value) ? value as MotionTemplateInput : {};
  } catch {
    return {};
  }
};

export const renderMotionTemplate = (templateId: string, input: MotionTemplateInput = {}) => {
  const template = getMotionTemplate(templateId);
  return template ? template.renderToComposition({ ...template.defaults, ...input }) : undefined;
};

export const defaultMotionTemplateVariablesJson = (templateId = "basic-title") => {
  const template = getMotionTemplate(templateId);
  return JSON.stringify(template?.defaults || {}, null, 2);
};
