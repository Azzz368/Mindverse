import type { ScriptOutput, StoryboardImagePrompt, StoryboardScene } from "@/types/canvas";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const clean = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
const lines = (value: unknown) => Array.isArray(value) ? value.filter((line): line is string => typeof line === "string" && line.trim().length > 0) : [];

const fallbackScenes = (brief: string, count: number) => Array.from({ length: count }, (_, index) => ({
  sceneNumber: index + 1,
  location: "主要故事地点",
  timeOfDay: "下午",
  action: `${brief} - 剧情段落 ${index + 1}`,
  dialogue: [],
  visualDirection: "电影化自然光，调度清晰，人物保持一致",
  emotionalBeat: "明确的情绪推进",
  storyPurpose: "推进故事前提",
  soundDesign: "轻微环境声",
  transition: "切",
}));

export function parseScript(value: string, fallback: string, sceneCount: number): ScriptOutput {
  try {
    const raw = record(JSON.parse(clean(value)));
    const scenes = Array.isArray(raw.scenes) ? raw.scenes.map((scene, index) => {
      const item = record(scene);
      return {
        sceneNumber: Number(item.sceneNumber) || index + 1,
      location: text(item.location, "主要故事地点"),
      timeOfDay: text(item.timeOfDay, "下午"),
      action: text(item.action, fallback),
      dialogue: lines(item.dialogue),
      visualDirection: text(item.visualDirection, "电影化自然光，调度清晰"),
        emotionalBeat: text(item.emotionalBeat),
        storyPurpose: text(item.storyPurpose),
        soundDesign: text(item.soundDesign),
        transition: text(item.transition, "Cut"),
      };
    }) : [];
    return {
      title: text(raw.title, "未命名虚构故事"),
      disclaimer: text(raw.disclaimer, "虚构创作场景，并非事实报道。"),
      logline: text(raw.logline, fallback),
      tone: text(raw.tone, "电影化"),
      genre: text(raw.genre),
      theme: text(raw.theme),
      visualStyle: text(raw.visualStyle),
      characters: Array.isArray(raw.characters) ? raw.characters.map((character) => {
        const item = record(character);
        return { name: text(item.name, "角色"), description: text(item.description), wardrobe: text(item.wardrobe), motivation: text(item.motivation), consistencyNotes: text(item.consistencyNotes) };
      }) : [],
      scenes: scenes.length ? scenes : fallbackScenes(fallback, sceneCount),
    };
  } catch {
    return { title: "未命名虚构故事", disclaimer: "虚构创作场景，并非事实报道。", logline: fallback, tone: "电影化", characters: [], scenes: fallbackScenes(fallback, sceneCount) };
  }
}

export function normalizeProfessionalStoryboard(value: unknown, fallback: string, sceneCount: number): StoryboardScene[] {
  const rawScenes = Array.isArray(value) ? value : Array.isArray(record(value).scenes) ? record(value).scenes as unknown[] : [];
  const scenes = rawScenes.map((scene, index) => {
    const item = record(scene);
    const description = text(item.description, fallback);
    const visualPrompt = text(item.visualPrompt) || text(item.imagePrompt) || description;
    return {
      sceneNumber: Number(item.sceneNumber) || index + 1,
      shotNumber: Number(item.shotNumber) || index + 1,
      description,
      visualPrompt,
      imagePrompt: text(item.imagePrompt) || visualPrompt,
      cinematicLanguage: text(item.cinematicLanguage),
      blocking: text(item.blocking),
      visualContinuity: text(item.visualContinuity),
      characterContinuity: text(item.characterContinuity),
      sceneContinuity: text(item.sceneContinuity),
      composition: text(item.composition),
      lens: text(item.lens),
      camera: text(item.camera, "Professional cinematic framing"),
      cameraMovement: text(item.cameraMovement),
      lighting: text(item.lighting),
      colorPalette: text(item.colorPalette),
      mood: text(item.mood),
      actionRhythm: text(item.actionRhythm),
      soundCue: text(item.soundCue),
      transition: text(item.transition),
      duration: Number(item.duration) || 5,
      negativePrompt: text(item.negativePrompt),
    };
  });
  return scenes.length ? scenes : Array.from({ length: sceneCount }, (_, index) => ({
    sceneNumber: index + 1,
    shotNumber: index + 1,
    description: `${fallback} - storyboard beat ${index + 1}`,
    visualPrompt: `Cinematic keyframe, ${fallback}, beat ${index + 1}`,
    imagePrompt: `Production storyboard frame, cinematic composition, ${fallback}, beat ${index + 1}`,
    camera: "Professional cinematic framing",
    duration: 5,
    lighting: "Motivated cinematic lighting",
    mood: "Controlled dramatic tone",
    actionRhythm: "Readable action beat",
    soundCue: "Subtle ambience",
  }));
}

export function promptsFromStoryboard(value: unknown, aspectRatio = "16:9", negativePrompt = "arrows, labels, UI, watermark, text overlay"): StoryboardImagePrompt[] {
  const shots = Array.isArray(value) ? value : Array.isArray(record(value).shots) ? record(value).shots as unknown[] : Array.isArray(record(value).scenes) ? record(value).scenes as unknown[] : [];
  return shots.map((shot, index) => {
    const item = record(shot);
    const number = Number(item.shotNumber || item.sceneNumber) || index + 1;
    const visual = text(item.imagePrompt) || text(item.visualPrompt) || text(item.description);
    const prompt = [
      visual,
      text(item.cinematicLanguage),
      text(item.blocking),
      text(item.composition),
      text(item.lens),
      text(item.camera),
      text(item.cameraMovement),
      text(item.lighting),
      text(item.colorPalette),
      text(item.mood),
      text(item.actionRhythm),
      text(item.visualContinuity),
      text(item.characterContinuity),
      text(item.sceneContinuity),
      "single production storyboard frame, film still, no text, maintain character wardrobe, location, lighting, props, and story continuity",
    ].filter(Boolean).join(". ");
    return { shotNumber: number, title: `Shot ${String(number).padStart(2, "0")}`, prompt, negativePrompt: text(item.negativePrompt, negativePrompt), aspectRatio };
  });
}
