import "server-only";
import type { AIProvider } from "./types";

const pause = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (text: string) => text.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char] ?? char);

export const mockAIProvider: AIProvider = {
  name: "mock",
  async generateText(input) { await pause(); return { text: `Creative draft: ${input.prompt.slice(0, 170)}. The tone is vivid, focused, and ready to develop.` }; },
  async generateImage(input) { await pause(550); const size = input.size || "1024×1024"; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#164e63"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="640" cy="130" r="110" fill="#fbbf24" opacity=".8"/><path d="M0 420 Q190 220 370 390 T800 310 V520 H0Z" fill="#0b1320" opacity=".75"/><text x="42" y="55" fill="white" font-family="sans-serif" font-size="22">MOCK IMAGE • ${safe(size)}</text><text x="42" y="475" fill="#dbeafe" font-family="sans-serif" font-size="18">${safe(input.prompt.slice(0, 65))}</text></svg>`; return { imageUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, status: "completed" }; },
  async generateVideo(input) { await pause(650); return { taskId: "mock-video-task", status: "pending", raw: { prompt: input.prompt, duration: input.duration } }; },
  async generateAudio(input) { await pause(520); return { audioUrl: "", status: "completed", raw: { message: `Audio sketch ready · ${input.text.slice(0, 42)}` } }; },
  async generateStoryboard(input) { await pause(620); return { scenes: Array.from({ length: input.numberOfScenes }, (_, i) => ({ sceneNumber: i + 1, description: `${input.storyBrief.slice(0, 72)} — beat ${i + 1}`, visualPrompt: `Cinematic keyframe, scene ${i + 1}, ${input.storyBrief.slice(0, 52)}`, camera: ["Wide orbit", "Close tracking", "Low angle", "Slow push-in"][i % 4], duration: 3 + (i % 3) })) }; },
  async listModels() { return []; },
  async pollTask(type, taskId) { await pause(300); return type === "video" ? { taskId, videoUrl: "", status: "completed", raw: { message: "Mock video concept complete" } } : { taskId, status: "completed" }; },
};
