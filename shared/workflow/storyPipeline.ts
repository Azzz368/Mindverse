import type { ScriptOutput, StoryboardImagePrompt } from "@/shared/canvas";

export const DEFAULT_STORYBOARD_SCENE_COUNT = 3;
export const MAX_STORYBOARD_SCENE_COUNT = 3;
export const clampStoryboardSceneCount = (value: unknown, fallback = DEFAULT_STORYBOARD_SCENE_COUNT) =>
  Math.max(1, Math.min(MAX_STORYBOARD_SCENE_COUNT, Math.round(Number(value) || fallback)));

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const clean = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);
const singleFrameNegative = "拼贴图, 分屏, 双联画, 三联画, 四宫格, 分镜板, 漫画分格, 多面板, 多个画面, 多张图出现在同一张图里, 前后对比图, 缩略图合集, 马赛克布局, collage, split screen, diptych, triptych, quadriptych, contact sheet, storyboard grid, comic panels, multiple panels, multiple frames, four images in one image, image sequence, thumbnails, mosaic, arrows, labels, UI, watermark, text overlay";

export const scriptInstruction = (brief: string, tone: string, sceneCount: number) => {
  sceneCount = clampStoryboardSceneCount(sceneCount);
  if (hasChinese(brief)) return `请根据下面的创意简介，创作一份完整、可拍摄的虚构短片剧本。不要只返回标题、概念、梗概、旅行总结或宣传文案。

语言要求：
- 所有 JSON 字段名必须保持英文，例如 title、characters、scenes。
- 所有 JSON 字段值必须使用简体中文，包括 title、logline、tone、characters、location、action、dialogue、visualDirection。
- 不要输出英文台词，不要输出英文场景描述，除非用户明确要求英文。

只返回严格 JSON，不要 Markdown。JSON 结构必须是：
{
  "title": "中文片名",
  "disclaimer": "虚构创作场景，不是事实报道。",
  "logline": "一句中文故事梗概",
  "tone": "中文风格说明",
  "characters": [{"name":"角色名","description":"角色描述","wardrobe":"服装造型"}],
  "scenes": [{"sceneNumber":1,"location":"地点","timeOfDay":"时间","action":"完整动作段落","dialogue":["角色名：台词","角色名：台词"],"visualDirection":"镜头、调度、光线和视觉方向"}]
}

请创建 exactly ${sceneCount} 个 scenes。每个 scene 都必须能直接用于拍摄：包含清晰地点、时间、具体动作节拍；如果场景中有人物，至少 2 句中文对白；包含镜头/构图/调度/光线方向。创意简介中出现的人物或主体必须进入剧情动作，而不是只出现在标题里。

创意简介：${brief}
风格/语调：${tone}`;

  return `Create a complete, shootable fictional short screenplay from this creative brief. Do not return only a title, premise, travel summary, or concept. Write in the same language as the brief unless the brief explicitly asks for another language. Do not present it as factual reporting.

Return strict JSON only, with this exact shape:
{
  "title": "...",
  "disclaimer": "Fictional creative scenario. Not a factual report.",
  "logline": "...",
  "tone": "...",
  "characters": [{"name":"...","description":"...","wardrobe":"..."}],
  "scenes": [{"sceneNumber":1,"location":"...","timeOfDay":"...","action":"...","dialogue":["Character: line","Character: line"],"visualDirection":"..."}]
}

Create exactly ${sceneCount} scenes. Each scene must be production-ready: include a clear location, time of day, concrete action beats, at least 2 dialogue lines when characters are present, and visual/camera direction. Make the named subject in the brief part of the story action, not just the title.

Brief: ${brief}
Tone: ${tone}`;
};

export function parseScript(value: string, fallback: string, sceneCount: number): ScriptOutput {
  sceneCount = clampStoryboardSceneCount(sceneCount);
  const zh = hasChinese(fallback);
  try {
    const raw = record(JSON.parse(clean(value)));
    const scenes = Array.isArray(raw.scenes) ? raw.scenes.map((scene, index) => {
      const item = record(scene);
      return {
        sceneNumber: Number(item.sceneNumber) || index + 1,
        location: text(item.location, zh ? "校园" : "Campus"),
        timeOfDay: text(item.timeOfDay, zh ? "下午" : "Afternoon"),
        action: text(item.action, fallback),
        dialogue: Array.isArray(item.dialogue) ? item.dialogue.filter((line): line is string => typeof line === "string") : [],
        visualDirection: text(item.visualDirection, zh ? "电影感自然光，清晰调度，镜头运动服务剧情。" : "Cinematic natural light"),
      };
    }).slice(0, sceneCount) : [];
    return {
      title: text(raw.title, zh ? "未命名虚构短片" : "Untitled fictional story"),
      disclaimer: text(raw.disclaimer, zh ? "虚构创作场景，不是事实报道。" : "Fictional creative scenario. Not a factual report."),
      logline: text(raw.logline, fallback),
      tone: text(raw.tone, zh ? "电影感" : "Cinematic"),
      characters: Array.isArray(raw.characters) ? raw.characters.map((character) => {
        const item = record(character);
        return { name: text(item.name, zh ? "角色" : "Character"), description: text(item.description), wardrobe: text(item.wardrobe) };
      }) : [],
      scenes: scenes.length ? scenes : fallbackScenes(fallback, sceneCount),
    };
  } catch {
    return {
      title: zh ? "未命名虚构短片" : "Untitled fictional story",
      disclaimer: zh ? "虚构创作场景，不是事实报道。" : "Fictional creative scenario. Not a factual report.",
      logline: fallback,
      tone: zh ? "电影感" : "Cinematic",
      characters: [],
      scenes: fallbackScenes(fallback, sceneCount),
    };
  }
}

const fallbackScenes = (brief: string, count: number) =>
  Array.from({ length: clampStoryboardSceneCount(count) }, (_, index) => {
    const zh = hasChinese(brief);
    return {
      sceneNumber: index + 1,
      location: zh ? "校园场景" : "Campus setting",
      timeOfDay: zh ? "下午" : "Afternoon",
      action: zh ? `${brief} - 剧情节拍 ${index + 1}` : `${brief} - story beat ${index + 1}`,
      dialogue: zh ? ["角色：我们得把这一刻拍出来。", "角色：那就让它变成一场真正的戏。"] : ["Character: We need to make this moment work.", "Character: Then let's turn it into a scene."],
      visualDirection: zh ? "电影感自然光，清晰人物调度，镜头运动服务剧情动作。" : "Cinematic natural light, clear blocking, camera movement supports the action.",
    };
  });

export const storyboardScenesFromValue = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.map(record).slice(0, MAX_STORYBOARD_SCENE_COUNT);
  const source = record(value);
  const scenes = Array.isArray(source.scenes) ? source.scenes : Array.isArray(source.shots) ? source.shots : [];
  return scenes.map(record).slice(0, MAX_STORYBOARD_SCENE_COUNT);
};

export const storyboardSceneNumber = (scene: Record<string, unknown>, index = 0) =>
  Math.max(1, Math.floor(Number(scene.shotNumber || scene.sceneNumber) || index + 1));

export const storyboardSceneFromValue = (value: unknown, shotNumber: number) => {
  const scenes = storyboardScenesFromValue(value);
  if (!scenes.length) return undefined;
  const requestedShot = Math.max(1, Math.floor(Number(shotNumber) || 1));
  return scenes.find((scene, index) => storyboardSceneNumber(scene, index) === requestedShot)
    || scenes[Math.min(requestedShot - 1, scenes.length - 1)];
};

export const storyboardSceneTextFrom = (scene: Record<string, unknown>, index = 0) => {
  const number = storyboardSceneNumber(scene, index);
  const description = text(scene.description) || text(scene.action);
  const visual = text(scene.imagePrompt) || text(scene.visualPrompt) || text(scene.visualDirection);
  const camera = text(scene.camera) || text(scene.cameraMovement);
  const composition = text(scene.composition);
  const duration = Number(scene.duration);
  const lines = [
    `Scene ${number}`,
    description,
    visual && visual !== description ? `Visual: ${visual}` : "",
    camera ? `Camera: ${camera}` : "",
    composition ? `Composition: ${composition}` : "",
    Number.isFinite(duration) && duration > 0 ? `Duration: ${duration}s` : "",
  ].filter(Boolean);
  return [...new Set(lines)].join("\n");
};

export function promptsFromStoryboard(value: unknown, aspectRatio = "16:9", negativePrompt = singleFrameNegative): StoryboardImagePrompt[] {
  const shots = storyboardScenesFromValue(value);
  return shots.map((shot, index) => {
    const item = record(shot);
    const number = Number(item.shotNumber || item.sceneNumber) || index + 1;
    const visual = text(item.imagePrompt) || text(item.visualPrompt) || text(item.description);
    const mergedNegative = [negativePrompt, singleFrameNegative].filter(Boolean).join(", ");
    return {
      shotNumber: number,
      title: `Shot ${String(number).padStart(2, "0")}`,
      prompt: [
        `第 ${number} 镜。只生成这一镜的一张单独电影关键帧画面。`,
        "这必须是一个完整的单一摄影机画面，不是分镜板，不是拼贴图，不是多张图片合集。",
        visual,
        text(item.camera),
        text(item.composition),
        text(item.action),
        "保持与前后镜头一致的人物、服装、道具、场景空间逻辑、光线风格、镜头语言、色调和故事连续性。",
        "画面应像真实电影拍摄中的单张关键帧：只有一个明确动作瞬间、自然人物调度和连贯背景。"
      ].filter(Boolean).join(" "),
      negativePrompt: mergedNegative,
      aspectRatio,
    };
  });
}
