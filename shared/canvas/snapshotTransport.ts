import type { CanvasSnapshot } from "./snapshot";

const inlineMediaPattern = /^data:(?:image|video|audio)\/[^,]*,/i;
const MAX_PERSISTED_STRING_CHARACTERS = 8_000;
const MAX_PERSISTED_OBJECT_KEYS = 80;
const MAX_PERSISTED_ARRAY_ITEMS = 48;
const MAX_PERSISTED_DEPTH = 12;

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
 * Provider responses and composition drafts can be many megabytes even when
 * their durable result is only a task ID or CDN URL. Keep the useful graph
 * data while preventing a single verbose field from blocking the whole save.
 */
const compactPersistenceValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") {
    if (value.length <= MAX_PERSISTED_STRING_CHARACTERS) return value;
    return `[omitted from workflow persistence: ${value.length} characters]`;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_PERSISTED_ARRAY_ITEMS).map((item) => compactPersistenceValue(item, depth + 1));
    return value.length > MAX_PERSISTED_ARRAY_ITEMS
      ? [...items, `[${value.length - MAX_PERSISTED_ARRAY_ITEMS} additional items omitted]`]
      : items;
  }
  if (!value || typeof value !== "object") return value;
  if (depth >= MAX_PERSISTED_DEPTH) return "[nested value omitted from workflow persistence]";
  const entries = Object.entries(value as Record<string, unknown>);
  const result = Object.fromEntries(entries
    .slice(0, MAX_PERSISTED_OBJECT_KEYS)
    .map(([key, item]) => [key, compactPersistenceValue(item, depth + 1)]));
  if (entries.length > MAX_PERSISTED_OBJECT_KEYS) {
    result.__mindverseTruncatedKeys = `${entries.length - MAX_PERSISTED_OBJECT_KEYS} keys omitted from workflow persistence`;
  }
  return result;
};

/**
 * Agent routes only need node metadata and stable URLs. Never send binary
 * data URIs with a canvas snapshot: they otherwise get duplicated in browser
 * state, request parsing, LLM payloads, and run records.
 */
export const snapshotForAgentTransport = <T extends CanvasSnapshot>(snapshot: T): T => transformInlineMedia(snapshot) as T;

/**
 * Returns a stable snapshot for browser and remote workflow persistence.
 *
 * A single legacy base64 upload used to make callers abandon the whole save,
 * which meant every unrelated node disappeared on the next page visit. Keep
 * the graph and metadata durable; replace only inline binary values with a
 * small marker. New uploads are archived before they reach this point.
 */
export const snapshotForWorkflowPersistence = (snapshot: CanvasSnapshot): CanvasSnapshot => transformInlineMedia({
  ...snapshot,
  nodes: snapshot.nodes.map((node) => ({
    ...node,
    data: compactPersistenceValue(node.data) as typeof node.data,
    selected: false,
    dragging: false,
  })),
  edges: snapshot.edges.map((edge) => compactPersistenceValue(edge) as typeof edge),
  agentMemory: compactPersistenceValue(snapshot.agentMemory) as CanvasSnapshot["agentMemory"],
}) as CanvasSnapshot;

export const snapshotJsonSize = (snapshot: CanvasSnapshot) => new Blob([JSON.stringify(snapshot)]).size;
