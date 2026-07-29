import type { CanvasSnapshot } from "./snapshot";

const inlineMediaPattern = /^data:(?:image|video|audio)\/[^,]*,/i;

const transformInlineMedia = (value: unknown): unknown => {
  if (typeof value === "string") {
    if (!inlineMediaPattern.test(value)) return value;
    const mediaType = /^data:([^/;,]+)/i.exec(value)?.[1] || "media";
    return `inline-media-omitted:${mediaType}:${value.length}`;
  }
  if (Array.isArray(value)) return value.map(transformInlineMedia);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, transformInlineMedia(item)]));
};

export const hasInlineMedia = (value: unknown): boolean => {
  if (typeof value === "string") return inlineMediaPattern.test(value);
  if (Array.isArray(value)) return value.some(hasInlineMedia);
  return Boolean(value && typeof value === "object" && Object.values(value as Record<string, unknown>).some(hasInlineMedia));
};

/**
 * Agent routes only need node metadata and stable URLs. Never send binary
 * data URIs with a canvas snapshot: they otherwise get duplicated in browser
 * state, request parsing, LLM payloads, and run records.
 */
export const snapshotForAgentTransport = <T extends CanvasSnapshot>(snapshot: T): T => transformInlineMedia(snapshot) as T;

/** Returns a stable snapshot for remote workflow persistence. */
export const snapshotForWorkflowPersistence = (snapshot: CanvasSnapshot): CanvasSnapshot => ({
  ...snapshot,
  nodes: snapshot.nodes.map((node) => ({
    ...node,
    selected: false,
    dragging: false,
  })),
});

export const snapshotJsonSize = (snapshot: CanvasSnapshot) => new Blob([JSON.stringify(snapshot)]).size;
