import "server-only";
import { ai302Provider } from "./302aiProvider";
import { mockAIProvider } from "./mockProvider";
import type { AIProvider } from "./types";

const realProvider = (value: string | undefined) => {
  const provider = value?.toLowerCase();
  return provider === "302ai" || provider === "hkgai";
};

export function getAIProvider(): AIProvider {
  return realProvider(process.env.AI_PROVIDER) ? ai302Provider : mockAIProvider;
}

export function getTextAIProvider(): AIProvider {
  return ai302Provider;
}

export function getImageAIProvider(): AIProvider {
  const provider = process.env.AI_IMAGE_PROVIDER?.toLowerCase();
  if (provider === "mock") return mockAIProvider;
  if (realProvider(provider) || process.env.AI_302_API_KEY) return ai302Provider;
  return getAIProvider();
}
