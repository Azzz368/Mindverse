import "server-only";

import type { AgentImageSearchResult, AgentImageSearchToolResult } from "@/shared/agent/agentTools";

type ImageSearchProvider = AgentImageSearchToolResult["provider"];
type ConfiguredProvider = ImageSearchProvider | "auto";

type WikimediaImageInfo = {
  url?: unknown;
  thumburl?: unknown;
  width?: unknown;
  height?: unknown;
  descriptionurl?: unknown;
  extmetadata?: Record<string, { value?: unknown }>;
};

type WikimediaPage = {
  pageid?: unknown;
  title?: unknown;
  imageinfo?: WikimediaImageInfo[];
};

type SerpImage = {
  position?: unknown;
  title?: unknown;
  thumbnail?: unknown;
  original?: unknown;
  original_width?: unknown;
  original_height?: unknown;
  link?: unknown;
  source?: unknown;
  domain?: unknown;
  unsafe?: unknown;
};

type GoogleCseItem = {
  title?: unknown;
  link?: unknown;
  displayLink?: unknown;
  image?: {
    contextLink?: unknown;
    thumbnailLink?: unknown;
    width?: unknown;
    height?: unknown;
  };
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const finiteNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const httpsUrl = (value: unknown) => {
  const url = text(value);
  return /^https:\/\//i.test(url) ? url : "";
};
const webUrl = (value: unknown) => {
  const url = text(value);
  return /^https?:\/\//i.test(url) ? url : "";
};
const decodeEntities = (value: string) => value
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, "\"")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/\s+/g, " ")
  .trim();
const metadataText = (metadata: WikimediaImageInfo["extmetadata"], key: string) => decodeEntities(text(metadata?.[key]?.value));
const hostname = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "Web image";
  }
};
const stableId = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
const uniqueResults = (results: AgentImageSearchResult[], limit: number) => {
  const seen = new Set<string>();
  return results.filter((item) => {
    if (seen.has(item.imageUrl)) return false;
    seen.add(item.imageUrl);
    return true;
  }).slice(0, limit);
};

const fetchJson = async <T>(url: string, label: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mindverse-Agent/1.0 image-search",
      },
    });
    const payload = await response.json().catch(() => undefined) as (T & { error?: unknown }) | undefined;
    if (!response.ok) throw new Error(`${label} failed (${response.status}): ${text(payload?.error) || response.statusText}`);
    if (!payload) throw new Error(`${label} returned an empty response.`);
    if (text(payload.error)) throw new Error(`${label} failed: ${text(payload.error)}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeWikimediaPage = (page: WikimediaPage): AgentImageSearchResult | undefined => {
  const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
  if (!info) return undefined;
  const imageUrl = httpsUrl(info.url);
  const thumbnailUrl = httpsUrl(info.thumburl) || imageUrl;
  const sourcePageUrl = webUrl(info.descriptionurl);
  if (!imageUrl || !thumbnailUrl || !sourcePageUrl) return undefined;
  const rawTitle = text(page.title).replace(/^File:/i, "").replace(/_/g, " ");
  const metadata = info.extmetadata;
  return {
    id: `wikimedia-${String(page.pageid || stableId(imageUrl))}`,
    title: rawTitle || "Wikimedia image",
    thumbnailUrl,
    imageUrl,
    sourcePageUrl,
    sourceName: "Wikimedia Commons",
    creator: metadataText(metadata, "Artist") || metadataText(metadata, "Credit") || undefined,
    license: metadataText(metadata, "LicenseShortName") || metadataText(metadata, "UsageTerms") || undefined,
    licenseUrl: httpsUrl(metadata?.LicenseUrl?.value) || undefined,
    width: finiteNumber(info.width),
    height: finiteNumber(info.height),
  };
};

const searchWikimedia = async (query: string, limit: number): Promise<AgentImageSearchToolResult> => {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: String(Math.max(limit * 2, 12)),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "1280",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const payload = await fetchJson<{ query?: { pages?: WikimediaPage[] } }>(
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    "Wikimedia image search",
  );
  const pages = Array.isArray(payload.query?.pages) ? payload.query.pages : [];
  const results = uniqueResults(pages.map(normalizeWikimediaPage).filter((item): item is AgentImageSearchResult => Boolean(item)), limit);
  return { name: "image_search", query, provider: "wikimedia", results };
};

const normalizeSerpImage = (item: SerpImage, provider: "serpapi-google" | "serpapi-bing"): AgentImageSearchResult | undefined => {
  if (item.unsafe === true) return undefined;
  const imageUrl = httpsUrl(item.original) || httpsUrl(item.thumbnail);
  const thumbnailUrl = httpsUrl(item.thumbnail) || imageUrl;
  const sourcePageUrl = webUrl(item.link);
  if (!imageUrl || !thumbnailUrl || !sourcePageUrl) return undefined;
  const sourceName = text(item.source) || text(item.domain) || hostname(sourcePageUrl);
  return {
    id: `${provider}-${stableId(`${imageUrl}|${sourcePageUrl}`)}`,
    title: text(item.title) || `${sourceName} image`,
    thumbnailUrl,
    imageUrl,
    sourcePageUrl,
    sourceName,
    width: finiteNumber(item.original_width),
    height: finiteNumber(item.original_height),
  };
};

const searchSerpApi = async (
  query: string,
  limit: number,
  provider: "serpapi-google" | "serpapi-bing",
): Promise<AgentImageSearchToolResult> => {
  const apiKey = text(process.env.SERPAPI_API_KEY);
  if (!apiKey) throw new Error("SERPAPI_API_KEY is required for Google/Bing full-web image search.");
  const language = text(process.env.AGENT_IMAGE_SEARCH_LANGUAGE) || "zh-cn";
  const country = text(process.env.AGENT_IMAGE_SEARCH_COUNTRY) || "hk";
  const params = new URLSearchParams({
    api_key: apiKey,
    engine: provider === "serpapi-bing" ? "bing_images" : "google_images",
    q: query,
  });
  if (provider === "serpapi-bing") {
    params.set("mkt", text(process.env.AGENT_IMAGE_SEARCH_MARKET) || "zh-HK");
    params.set("safeSearch", "strict");
    params.set("photo", "photo");
    params.set("imagesize", "large");
    params.set("count", String(Math.max(limit * 2, 20)));
  } else {
    params.set("hl", language);
    params.set("gl", country);
    params.set("safe", "active");
    params.set("image_type", "photo");
    params.set("imgsz", "l");
  }
  const payload = await fetchJson<{ images_results?: SerpImage[] }>(
    `https://serpapi.com/search.json?${params.toString()}`,
    provider === "serpapi-bing" ? "Bing Images search" : "Google Images search",
  );
  const items = Array.isArray(payload.images_results) ? payload.images_results : [];
  const results = uniqueResults(items.map((item) => normalizeSerpImage(item, provider)).filter((item): item is AgentImageSearchResult => Boolean(item)), limit);
  return { name: "image_search", query, provider, results };
};

const normalizeGoogleCseItem = (item: GoogleCseItem): AgentImageSearchResult | undefined => {
  const imageUrl = httpsUrl(item.link);
  const thumbnailUrl = httpsUrl(item.image?.thumbnailLink) || imageUrl;
  const sourcePageUrl = webUrl(item.image?.contextLink);
  if (!imageUrl || !thumbnailUrl || !sourcePageUrl) return undefined;
  const sourceName = text(item.displayLink) || hostname(sourcePageUrl);
  return {
    id: `google-cse-${stableId(`${imageUrl}|${sourcePageUrl}`)}`,
    title: text(item.title) || `${sourceName} image`,
    thumbnailUrl,
    imageUrl,
    sourcePageUrl,
    sourceName,
    width: finiteNumber(item.image?.width),
    height: finiteNumber(item.image?.height),
  };
};

const searchGoogleCse = async (query: string, limit: number): Promise<AgentImageSearchToolResult> => {
  const apiKey = text(process.env.GOOGLE_SEARCH_API_KEY);
  const engineId = text(process.env.GOOGLE_SEARCH_ENGINE_ID);
  if (!apiKey || !engineId) throw new Error("GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID are required for Google CSE image search.");
  const params = new URLSearchParams({
    key: apiKey,
    cx: engineId,
    q: query,
    searchType: "image",
    safe: "active",
    imgType: "photo",
    imgSize: "large",
    num: String(Math.min(10, Math.max(limit, 1))),
  });
  const payload = await fetchJson<{ items?: GoogleCseItem[] }>(
    `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
    "Google CSE image search",
  );
  const items = Array.isArray(payload.items) ? payload.items : [];
  const results = uniqueResults(items.map(normalizeGoogleCseItem).filter((item): item is AgentImageSearchResult => Boolean(item)), limit);
  return { name: "image_search", query, provider: "google-cse", results };
};

const configuredProvider = (): ConfiguredProvider => {
  const value = text(process.env.AGENT_IMAGE_SEARCH_PROVIDER).toLowerCase() || "auto";
  const aliases: Record<string, ConfiguredProvider> = {
    auto: "auto",
    google: "serpapi-google",
    "serpapi-google": "serpapi-google",
    bing: "serpapi-bing",
    "serpapi-bing": "serpapi-bing",
    "google-cse": "google-cse",
    wikimedia: "wikimedia",
  };
  const provider = aliases[value];
  if (!provider) throw new Error(`Unsupported AGENT_IMAGE_SEARCH_PROVIDER: ${value}`);
  return provider;
};

const automaticProvider = (): ImageSearchProvider => {
  if (text(process.env.SERPAPI_API_KEY)) return "serpapi-google";
  if (text(process.env.GOOGLE_SEARCH_API_KEY) && text(process.env.GOOGLE_SEARCH_ENGINE_ID)) return "google-cse";
  return "wikimedia";
};

const searchWithProvider = (query: string, limit: number, provider: ImageSearchProvider) => {
  if (provider === "serpapi-google" || provider === "serpapi-bing") return searchSerpApi(query, limit, provider);
  if (provider === "google-cse") return searchGoogleCse(query, limit);
  return searchWikimedia(query, limit);
};

export async function searchImages({ query, limit = 8 }: { query: string; limit?: number }): Promise<AgentImageSearchToolResult> {
  const normalizedQuery = query.trim().slice(0, 160);
  if (!normalizedQuery) throw new Error("Image search query is required.");
  const requestedLimit = Math.max(1, Math.min(12, Math.floor(limit)));
  const configured = configuredProvider();
  const provider = configured === "auto" ? automaticProvider() : configured;
  try {
    return await searchWithProvider(normalizedQuery, requestedLimit, provider);
  } catch (error) {
    if (configured !== "auto" || provider === "wikimedia") throw error;
    console.warn(`Agent image search provider ${provider} failed; falling back to Wikimedia Commons.`, error instanceof Error ? error.message : error);
    return searchWikimedia(normalizedQuery, requestedLimit);
  }
}
