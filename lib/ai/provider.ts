import "server-only";
import { ai302Provider } from "./302aiProvider";
import { mockAIProvider } from "./mockProvider";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider { return process.env.AI_PROVIDER?.toLowerCase() === "302ai" ? ai302Provider : mockAIProvider; }
