import type { ImagePromptPresetId } from "@/shared/workflow/imagePromptPresets";

export type AgentWorkflowSkillId = "fixed-scene-action-video";

export type AgentWorkflowSkill = {
  id: AgentWorkflowSkillId;
  label: string;
  description: string;
  defaultDuration: number;
};

export type FixedSceneReferenceSpec = {
  key: "mainCharacter" | "secondaryCharacter" | "sceneGrid" | "topView";
  token: string;
  title: string;
  preset: ImagePromptPresetId;
  prompt: string;
  negativePrompt?: string;
};

export type FixedSceneVideoSkill = {
  title: string;
  idea: string;
  duration: number;
  shotCount: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  style: string;
  references: FixedSceneReferenceSpec[];
  videoPrompt: string;
  negativePrompt: string;
};

export const agentWorkflowSkills: Record<AgentWorkflowSkillId, AgentWorkflowSkill> = {
  "fixed-scene-action-video": {
    id: "fixed-scene-action-video",
    label: "固定场景短片",
    description: "人物四象图 + 场景九宫图 + 俯视图，生成连续叙事视频。",
    defaultDuration: 10,
  },
};

const DEFAULT_IDEA = "主角进入一个固定场景，在空间中发现异常并逐步走向悬念瞬间。";

const characterNegativePrompt =
  "额外人物, 多角色, 不同人物, 脸不一致, 发型不一致, 服装不一致, 比例不一致, 场景故事画面, 背景复杂, 漫画分格, 拼贴图, 水印, 文字, UI, extra people, multiple characters, different identities, inconsistent face, inconsistent outfit, inconsistent hairstyle, complex scene, collage, text, watermark";

const environmentNegativePrompt =
  "人物, 人脸, 身体, 角色, 群众, 动物, 肖像, 字幕, 文字, 标签, 编号, 箭头, 路线, 轨迹, 指示线, 水印, UI, human, person, people, face, body, character, crowd, portrait, text, label, number, arrow, route line, path line, trajectory, marker, watermark";

const videoNegativePrompt =
  "拼贴图, 分屏, 九宫格画面, 四象图画面, 设定图排版, 俯视平面图直接入镜, 路线图, 箭头, 轨迹线, 文字标签, 分镜板, 多面板, 文字, 字幕, 水印, UI, collage, split screen, contact sheet, storyboard grid, character sheet layout, top-view map on screen, route line, arrow, path line, text label, multiple panels, text overlay, watermark";

const MAX_SKILL_BRIEF_LENGTH = 700;
const MAX_SKILL_NODE_PROMPT_LENGTH = 2200;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const limitText = (value: string, maxLength: number) => {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const sliced = trimmed.slice(0, maxLength);
  const boundaries = ["\n", "。", "！", "？", ".", "!", "?"];
  const boundary = Math.max(...boundaries.map((item) => sliced.lastIndexOf(item)));
  return (boundary > Math.floor(maxLength * 0.72) ? sliced.slice(0, boundary + 1) : sliced).trim();
};

const normalizeBrief = (brief: string) => {
  const trimmed = brief.trim().replace(/\s+/g, " ");
  return limitText(trimmed || DEFAULT_IDEA, MAX_SKILL_BRIEF_LENGTH);
};

const firstNumberMatch = (text: string, pattern: RegExp) => {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(value) ? value : null;
};

const durationFrom = (idea: string) => {
  const explicit = firstNumberMatch(idea, /(\d+)\s*(?:秒|s|sec|second|seconds)/i);
  return clamp(explicit ?? 10, 5, 30);
};

const shotCountFrom = (idea: string, duration: number) => {
  const explicit = firstNumberMatch(idea, /(\d+)\s*(?:个)?(?:镜头|shots?)/i);
  return clamp(explicit ?? Math.round(duration / 2), 3, 8);
};

const aspectRatioFrom = (idea: string): FixedSceneVideoSkill["aspectRatio"] => {
  if (/(竖屏|vertical|9:16)/i.test(idea)) {
    return "9:16";
  }

  if (/(方形|square|1:1)/i.test(idea)) {
    return "1:1";
  }

  return "16:9";
};

const styleFrom = (idea: string) => {
  if (/(喜剧|幽默|comedy)/i.test(idea)) {
    return "轻喜剧短片，节奏明快，动作清楚";
  }

  if (/(动作|追逐|战斗|action)/i.test(idea)) {
    return "动作电影感，运动镜头明确，节奏紧凑";
  }

  if (/(温情|治愈|浪漫|warm|romantic)/i.test(idea)) {
    return "温情电影感，光线柔和，情绪细腻";
  }

  if (/(广告|产品|brand|commercial)/i.test(idea)) {
    return "商业广告短片，镜头干净，主体突出";
  }

  if (/(科幻|未来|sci-fi|cyber)/i.test(idea)) {
    return "科幻电影感，空间层次清晰，光影冷峻";
  }

  return "电影感悬疑短片，节奏自然，情绪逐步递进";
};

const needsSecondaryCharacter = (idea: string) =>
  /(双人|两人|第二人物|第二个角色|对手|敌人|观察者|跟踪|对峙|相遇|two characters|second character|rival|enemy|observer)/i.test(idea);

const timeRange = (index: number, shotCount: number, duration: number) => {
  const start = Math.round((index * duration * 100) / shotCount) / 100;
  const end = Math.round(((index + 1) * duration * 100) / shotCount) / 100;
  const fmt = (value: number) => value.toFixed(value % 1 === 0 ? 0 : 2).padStart(2, "0");
  return `00:${fmt(start)}-00:${fmt(end)}`;
};

const buildReferenceSpecs = (idea: string, includeSecondary: boolean): FixedSceneReferenceSpec[] => {
  const references: FixedSceneReferenceSpec[] = [
    {
      key: "mainCharacter",
      token: "@1",
      title: "Main Character Turnaround",
      preset: "character-turnaround",
      prompt: [
        `故事目标：${idea}`,
        "生成主角人物四面设定图。所有视图必须是同一身份、同一张脸、同一发型、同一服装、同一配色和同一身体比例。",
        "使用正交转面参考图方式呈现正面、侧面、背面和头部视图，不能画成多个相似但不同的人。",
        "只做角色设定参考，不要加入故事场景、其他人物或文字标签。",
      ].join("\n"),
      negativePrompt: characterNegativePrompt,
    },
  ];

  if (includeSecondary) {
    references.push({
      key: "secondaryCharacter",
      token: `@${references.length + 1}`,
      title: "Second Character Turnaround",
      preset: "character-turnaround",
      prompt: [
        `故事目标：${idea}`,
        "生成第二人物四面设定图。所有视图必须是同一身份、同一张脸、同一发型、同一服装、同一配色和同一身体比例。",
        "与主角有清晰区分，但本角色内部必须保持完全一致，不能画成多个相似但不同的人。",
        "只做角色设定参考，不要加入故事场景、其他人物或文字标签。",
      ].join("\n"),
      negativePrompt: characterNegativePrompt,
    });
  }

  references.push(
    {
      key: "sceneGrid",
      token: `@${references.length + 1}`,
      title: "Empty Scene Nine Grid",
      preset: "scene-nine-grid",
      prompt: [
        `场景方向：${idea}`,
        "生成纯环境场景九宫图：同一固定地点的 3x3 视角探索。",
        "必须是无人环境，不出现人物、人脸、身体、群众或角色剪影。",
        "展示入口、通道、关键道具、光线、材质和空间氛围。",
      ].join("\n"),
      negativePrompt: environmentNegativePrompt,
    },
    {
      key: "topView",
      token: `@${references.length + 2}`,
      title: "Empty Scene Top View",
      preset: "scene-top-view",
      prompt: [
        `场景方向：${idea}`,
        "生成纯环境俯视空间布局图，只表现建筑结构、入口出口、可通行区域、遮挡物、关键道具和比例关系。",
        "不要画路线线条、箭头、轨迹、编号、文字标签或任何 UI 标注。",
        "不要出现人物、人脸、身体、群众或角色剪影。",
      ].join("\n"),
      negativePrompt: environmentNegativePrompt,
    },
  );

  return references;
};

const shotPrompt = (
  index: number,
  shotCount: number,
  duration: number,
  mainToken: string,
  secondaryToken: string | null,
  sceneToken: string,
  topToken: string,
) => {
  const time = timeRange(index, shotCount, duration);
  const secondaryAction = secondaryToken
    ? `${secondaryToken}在远处出现、观察或靠近，与${mainToken}形成关系。`
    : "空间中的关键道具、光线或声音制造阻力。";

  const templates = [
    `${time} 建立空间：参考${topToken}的入口和空间布局，${mainToken}进入${sceneToken}场景，镜头高位下压并轻推。`,
    `${time} 移动探索：${mainToken}穿过场景中央，侧向跟拍，动作与上一镜头连续。`,
    `${time} 情绪变化：近景观察${mainToken}放慢脚步、回头或停顿，手部和呼吸细节清晰。`,
    `${time} 阻力升级：门口、阴影、转角或道具形成压迫，${secondaryAction}`,
    `${time} 悬念收束：${mainToken}面对未知阻力，镜头半环绕后快速前推到近景，停在悬念瞬间。`,
  ];

  return templates[index] || `${time} 补充镜头：保持人物、空间和动线连续，推进动作和情绪。`;
};

const buildVideoPrompt = (
  idea: string,
  duration: number,
  shotCount: number,
  style: string,
  references: FixedSceneReferenceSpec[],
) => {
  const main = references.find((reference) => reference.key === "mainCharacter")?.token || "@1";
  const secondary = references.find((reference) => reference.key === "secondaryCharacter")?.token || null;
  const scene = references.find((reference) => reference.key === "sceneGrid")?.token || "@2";
  const top = references.find((reference) => reference.key === "topView")?.token || "@3";
  const materialLine = secondary
    ? `${main}=主角四面设定图，${secondary}=第二人物四面设定图，${scene}=无人场景九宫图，${top}=无人俯视空间布局图。`
    : `${main}=主角四面设定图，${scene}=无人场景九宫图，${top}=无人俯视空间布局图。`;

  const shots = Array.from({ length: shotCount }, (_, index) =>
    shotPrompt(index, shotCount, duration, main, secondary, scene, top),
  );

  return [
    `故事目标：${idea}`,
    `风格：${style}`,
    `生成${duration}秒、${shotCount}个镜头的连续电影短片。`,
    `素材：${materialLine}`,
    "要求：单一固定场景，动作连续，镜头自然衔接；不要把四面设定图、九宫图或俯视图作为画面布局直接显示；画面中不要出现路线、箭头或文字标注。",
    ...shots,
    "摄影：景别丰富，使用建立镜头、跟拍、近景、半环绕和前推；不要换脸、换装、跳场景、分屏、字幕或水印。",
  ].join("\n");
};

const titleFrom = (idea: string) => {
  const compact = idea.replace(/[。！？.!?].*$/, "").slice(0, 18).trim();
  return compact ? `${compact}短片` : "固定场景短片";
};

export const buildFixedSceneVideoSkill = (brief: string): FixedSceneVideoSkill => {
  const idea = normalizeBrief(brief);
  const duration = durationFrom(idea);
  const shotCount = shotCountFrom(idea, duration);
  const aspectRatio = aspectRatioFrom(idea);
  const style = styleFrom(idea);
  const references = buildReferenceSpecs(idea, needsSecondaryCharacter(idea)).map((reference) => ({
    ...reference,
    prompt: limitText(reference.prompt, MAX_SKILL_NODE_PROMPT_LENGTH),
  }));

  return {
    title: titleFrom(idea),
    idea,
    duration,
    shotCount,
    aspectRatio,
    style,
    references,
    videoPrompt: limitText(buildVideoPrompt(idea, duration, shotCount, style, references), MAX_SKILL_NODE_PROMPT_LENGTH),
    negativePrompt: videoNegativePrompt,
  };
};
