import "server-only";
import { getAIProvider, getImageAIProvider, getTextAIProvider } from "@/lib/ai/provider";
import { parseScript, promptsFromStoryboard, scriptInstruction } from "@/lib/workflow/storyPipeline";
import type { CanvasNode, NodeOutput } from "@/types/canvas";

const output = (kind: string, summary: string, value: unknown): NodeOutput => ({ kind, summary, value, createdAt: new Date().toISOString() });
const inputSummary = (inputs: unknown[]) => inputs.map((input) => typeof input === "object" ? JSON.stringify(input).slice(0, 90) : String(input)).join("\n");
export async function runCanvasNode(node: CanvasNode, inputs: unknown[] = []): Promise<NodeOutput> {
  const d = node.data, upstream = inputSummary(inputs), prompt = [d.prompt, d.instruction, d.storyBrief, d.inputText, upstream].filter(Boolean).join("\n").trim(), aiProvider = getAIProvider(), imageProvider = getImageAIProvider(), textProvider = getTextAIProvider();
  if (["prompt", "text", "script", "image", "video", "audio", "storyboard"].includes(d.nodeType) && !prompt) throw new Error("Add a prompt or input before running this node.");
  switch (d.nodeType) {
    case "prompt": return output("prompt", "Structured prompt prepared", { prompt: d.prompt, negativePrompt: d.negativePrompt, style: d.style, aspectRatio: d.aspectRatio });
    case "text": { const value = await textProvider.generateText({ prompt, model: d.model, temperature: d.temperature, upstreamContext: inputs }); return output("text", value.text.slice(0, 90), { generatedText: value.text }); }
    case "script": { const count = Math.max(1, Math.min(12, d.numberOfScenes ?? 3)); const value = await textProvider.generateText({ prompt: scriptInstruction(prompt, d.scriptTone || "Cinematic, fictional", count), model: d.model, temperature: 0.5 }); const script = parseScript(value.text, prompt, count); return output("script", script.title, script); }
    case "image": { const value = await imageProvider.generateImage({ prompt, negativePrompt: d.negativePrompt, model: d.model, size: d.size, aspectRatio: d.aspectRatio, referenceImageUrl: d.referenceImageUrl, referenceImageUrls: d.referenceImageUrl ? [d.referenceImageUrl] : undefined }); return output("image", value.imageUrl ? "Image generated" : value.taskId ? `Image task ${value.taskId} pending` : "Image generation did not return a result", value); }
    case "video": { const value = await aiProvider.generateVideo({ prompt, negativePrompt: d.negativePrompt, model: d.model, image: d.referenceImageUrl, duration: d.duration, resolution: d.resolution, aspectRatio: d.aspectRatio, fps: d.fps }); return output("video", value.videoUrl ? "Video generated" : value.taskId ? `Video task ${value.taskId} pending` : "Video request submitted", value); }
    case "audio": { const value = await aiProvider.generateAudio({ text: prompt, model: d.model, voice: d.voice, emotion: d.emotion, volume: d.volume, responseFormat: "mp3" }); return output("audio", value.audioUrl ? "Audio generated" : "Audio task complete", value); }
    case "storyboard": { const value = await textProvider.generateStoryboard({ storyBrief: prompt, numberOfScenes: d.targetShotCount ?? d.numberOfScenes ?? 6, model: d.model }); return output("storyboard", `${value.scenes.length} scenes created`, value.scenes); }
    case "storyboardImage": { const prompts = promptsFromStoryboard(inputs[0], d.aspectRatio, d.negativePrompt); return output("storyboardImage", `${prompts.length} image prompts prepared`, { prompts }); }
    case "reference": return output("reference", "Reference material available", { imageUrl: d.imageUrl, notes: d.notes });
    case "output": return output("output", `${inputs.length} upstream result${inputs.length === 1 ? "" : "s"} collected`, inputs);
  }
}
