import type { ImagePromptPresetId } from "@/shared/workflow/imagePromptPresets";

export type AgentWorkflowSkillId = "fixed-scene-action-video";

export type AgentWorkflowSkill = {
  id: AgentWorkflowSkillId;
  label: string;
  description: string;
  defaultDuration: number;
};

export type FixedSceneReferenceSpec = {
  key: "mainCharacter" | "secondaryCharacter" | "sceneGrid";
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
    description: "人物四象图 + 场景九宫图，生成固定场景连续叙事视频。",
    defaultDuration: 10,
  },
};

const DEFAULT_IDEA = "主角进入一个固定场景，在空间中发现异常并逐步走向悬念瞬间。";
const DEFAULT_CHARACTER_VISUAL = "一位电影短片主角，外观清晰、有辨识度，服装适合故事类型，轮廓和面部特征稳定。";
const DEFAULT_SECONDARY_CHARACTER_VISUAL = "一位与主角形成对照的第二人物，外观、服装和轮廓与主角明显区分。";
const DEFAULT_LOCATION_VISUAL = "一个单一固定的室内场景，空间可供角色行走，包含入口、主要活动区域、遮挡物、关键道具、墙面、地面和灯光氛围。";

const characterNegativePrompt =
  "额外人物, 多角色, 不同人物, 脸不一致, 发型不一致, 服装不一致, 比例不一致, 场景故事画面, 背景复杂, 漫画分格, 拼贴图, 水印, 文字, UI, extra people, multiple characters, different identities, inconsistent face, inconsistent outfit, inconsistent hairstyle, complex scene, collage, text, watermark";

const environmentNegativePrompt =
  "人物, 人脸, 身体, 角色, 群众, 动物, 肖像, 字幕, 文字, 标签, 编号, 箭头, 路线, 轨迹, 指示线, 水印, UI, human, person, people, face, body, character, crowd, portrait, text, label, number, arrow, route line, path line, trajectory, marker, watermark";

const videoNegativePrompt =
  "拼贴图, 分屏, 九宫格画面, 四象图画面, 设定图排版, 路线图, 箭头, 轨迹线, 文字标签, 分镜板, 多面板, 左右重复场景, 镜像场景, 克隆背景, 场景跳变, 空间不连续, 文字, 字幕, 水印, UI, collage, split screen, contact sheet, storyboard grid, character sheet layout, route line, arrow, path line, text label, duplicated room, mirrored background, cloned background, scene jump, discontinuous space, multiple panels, text overlay, watermark";

const MAX_SKILL_BRIEF_LENGTH = 1200;
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
  const trimmed = brief
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter(Boolean)
    .join("\n");
  return limitText(trimmed || DEFAULT_IDEA, MAX_SKILL_BRIEF_LENGTH);
};

const splitSentences = (value: string) =>
  value
    .split(/(?<=[。！？.!?])\s+|[\r\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const fieldFrom = (brief: string, labels: string[]) => {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:^|[\\n\\r])\\s*(?:${escaped})\\s*[:：]\\s*([\\s\\S]*?)(?=[\\n\\r]\\s*[\\w\\u4e00-\\u9fff_ -]{2,40}\\s*[:：]|$)`, "i");
  const match = brief.match(pattern);
  return match?.[1]?.trim() || "";
};

const extractRelevantSentences = (brief: string, include: RegExp[], exclude: RegExp[], fallback: string) => {
  const matches = splitSentences(brief).filter(
    (sentence) => include.some((pattern) => pattern.test(sentence)) && !exclude.some((pattern) => pattern.test(sentence)),
  );
  return limitText(matches.slice(0, 3).join(" ") || fallback, 360);
};

const materialBriefsFrom = (idea: string) => {
  const actionWords = [/镜头|分镜|秒|shot|camera|进入|穿过|对峙|走动|移动|情绪|冲突|结尾|悬念/i];
  const storyGoal = fieldFrom(idea, ["story_goal", "故事目标", "logline", "故事梗概", "核心故事"]) || idea;
  const videoActionPlan = fieldFrom(idea, ["video_action_plan", "视频动作计划", "story_beats", "故事节拍", "key_shots", "关键镜头"]) || storyGoal;
  const continuityRules = fieldFrom(idea, ["continuity_rules", "连续性规则", "constraints", "约束", "continuity"]) || "";
  const mainCharacter =
    fieldFrom(idea, ["main_character_visual", "主角外观", "主角视觉", "protagonist", "main character"]) ||
    extractRelevantSentences(idea, [/主角|人物|角色|protagonist|character|穿着|服装|发型|脸|外观/i], actionWords, DEFAULT_CHARACTER_VISUAL);
  const secondaryCharacter =
    fieldFrom(idea, ["secondary_character_visual", "第二人物外观", "第二角色外观", "second character", "secondary character"]) ||
    extractRelevantSentences(idea, [/第二人物|第二角色|对手|敌人|观察者|rival|enemy|observer|second character/i], actionWords, DEFAULT_SECONDARY_CHARACTER_VISUAL);
  const location =
    fieldFrom(idea, ["fixed_location_visual", "固定场景视觉", "场景视觉", "scene visual", "setting", "fixed location"]) ||
    extractRelevantSentences(idea, [/场景|地点|房间|室内|空间|location|setting|room|interior|环境/i], actionWords, DEFAULT_LOCATION_VISUAL);

  return {
    storyGoal: limitText(storyGoal, 520),
    videoActionPlan: limitText(videoActionPlan, 700),
    continuityRules: limitText(continuityRules, 360),
    mainCharacter,
    secondaryCharacter,
    location,
  };
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
  const materialBriefs = materialBriefsFrom(idea);
  const references: FixedSceneReferenceSpec[] = [
    {
      key: "mainCharacter",
      token: "@1",
      title: "Main Character Turnaround",
      preset: "character-turnaround",
      prompt: [
        `主角外观：${materialBriefs.mainCharacter}`,
        "生成主角人物四面设定图。所有视图必须是同一身份、同一张脸、同一发型、同一服装、同一配色和同一身体比例。",
        "使用正交转面参考图方式呈现正面、侧面、背面和头部视图，不能画成多个相似但不同的人。",
        "只做角色设定参考，不要表现剧情动作、故事场景、其他人物或文字标签。",
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
        `第二人物外观：${materialBriefs.secondaryCharacter}`,
        "生成第二人物四面设定图。所有视图必须是同一身份、同一张脸、同一发型、同一服装、同一配色和同一身体比例。",
        "与主角有清晰区分，但本角色内部必须保持完全一致，不能画成多个相似但不同的人。",
        "只做角色设定参考，不要表现剧情动作、故事场景、其他人物或文字标签。",
      ].join("\n"),
      negativePrompt: characterNegativePrompt,
    });
  }

  references.push({
    key: "sceneGrid",
    token: `@${references.length + 1}`,
    title: "Empty Scene Nine Grid",
    preset: "scene-nine-grid",
    prompt: [
      `场景外观：${materialBriefs.location}`,
      "生成纯环境场景九宫图：同一个固定室内地点的 3x3 视角探索。",
      "必须是无人环境，不出现人物、人脸、身体、群众或角色剪影。",
      "只展示室内空间本身：入口、通道、墙面、地面、关键道具、光线、材质和空间氛围；不要表现剧情动作。",
      "九宫格里的每一格必须属于同一个房间/同一固定场景，只变化机位、焦段、局部细节和光线角度，不要扩展成多个不同地点。",
    ].join("\n"),
    negativePrompt: environmentNegativePrompt,
  });

  return references;
};

const shotPrompt = (
  index: number,
  shotCount: number,
  duration: number,
  mainToken: string,
  secondaryToken: string | null,
  sceneToken: string,
) => {
  const time = timeRange(index, shotCount, duration);
  const secondaryAction = secondaryToken
    ? `${secondaryToken}在远处出现、观察或靠近，与${mainToken}形成关系。`
    : "空间中的关键道具、光线或声音制造阻力。";

  const templates = [
    `${time} 建立空间：参考${sceneToken}中最清晰的入口和主要活动区域，${mainToken}从入口进入同一室内场景，镜头缓慢下压并轻推，结束时人物停在入口内侧。`,
    `${time} 连续移动：从上一镜头结束位置接上，${mainToken}沿同一方向穿过房间中央，侧向跟拍，墙面、地面、道具和光线保持来自${sceneToken}的同一空间。`,
    `${time} 情绪变化：接上一镜头的步伐，近景观察${mainToken}放慢、回头或停顿，视线指向同一房间深处，手部和呼吸细节清晰。`,
    `${time} 阻力升级：仍在同一个${sceneToken}场景内，门口、阴影、转角或关键道具形成压迫，${secondaryAction}`,
    `${time} 悬念收束：沿上一镜头的视线方向推进，${mainToken}面对未知阻力，镜头半环绕后前推到近景，停在悬念瞬间。`,
  ];

  return templates[index] || `${time} 补充镜头：从上一镜头结束状态接续，保持人物位置、视线方向、背景结构和空间关系连续。`;
};

const buildVideoPrompt = (
  idea: string,
  duration: number,
  shotCount: number,
  style: string,
  references: FixedSceneReferenceSpec[],
) => {
  const materialBriefs = materialBriefsFrom(idea);
  const main = references.find((reference) => reference.key === "mainCharacter")?.token || "@1";
  const secondary = references.find((reference) => reference.key === "secondaryCharacter")?.token || null;
  const scene = references.find((reference) => reference.key === "sceneGrid")?.token || "@2";
  const materialLine = secondary
    ? `${main}=主角四面设定图，${secondary}=第二人物四面设定图，${scene}=无人场景九宫图。`
    : `${main}=主角四面设定图，${scene}=无人场景九宫图。`;

  const shots = Array.from({ length: shotCount }, (_, index) =>
    shotPrompt(index, shotCount, duration, main, secondary, scene),
  );

  return [
    `故事目标：${materialBriefs.storyGoal}`,
    `动作计划：${materialBriefs.videoActionPlan}`,
    `风格：${style}`,
    `生成${duration}秒、${shotCount}个镜头的连续电影短片。`,
    `素材：${materialLine}`,
    "空间规则：全片只能发生在同一个固定场景。只参考场景九宫图来统一墙面、地面、入口、道具、光线和空间尺度；不要引入九宫图之外的新房间、新建筑或新地点。",
    "连续性规则：每个镜头从上一镜头的结束位置、动作方向和视线方向接上；人物服装、脸、发型和场景布置保持一致。",
    "画面规则：不要把四面设定图或九宫图作为画面布局直接显示；不要出现路线、箭头或文字标注；不要左右分屏、镜像复制或在画面左右两侧生成重复场景。",
    materialBriefs.continuityRules ? `额外连续性：${materialBriefs.continuityRules}` : "",
    ...shots,
    "摄影：景别丰富但空间方向统一，使用建立镜头、跟拍、近景、半环绕和前推；不要换脸、换装、跳场景、分屏、字幕或水印。",
  ].filter(Boolean).join("\n");
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
