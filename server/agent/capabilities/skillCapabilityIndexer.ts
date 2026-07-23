import "server-only";

import type { CapabilityRecord } from "@/shared/agent/capabilityTypes";
import type { ActiveSkillContext, StoredSkill } from "@/shared/skills/skillTypes";

type SkillLike = ActiveSkillContext | StoredSkill;

const includes = (value: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(value));

export const inferSkillCapabilities = (skill: SkillLike) => {
  const source = [skill.name, skill.tagline, skill.skillMd, skill.usageScenario, skill.howToUse, skill.expectedOutput].join("\n").toLowerCase();
  const capabilities = new Set<string>();
  if (includes(source, [/image|图片|图像|关键帧|九宫格|四面/])) capabilities.add("image_generation");
  if (includes(source, [/video|视频|短片|影片/])) capabilities.add("video_generation");
  if (includes(source, [/multi.{0,12}(reference|image)|多图|多素材|参考图/])) capabilities.add("multi_reference_video");
  if (includes(source, [/fixed.{0,8}scene|固定场景/])) capabilities.add("fixed_scene_video");
  if (includes(source, [/character.{0,12}(consistent|continuity)|人物一致|角色一致/])) capabilities.add("character_consistency");
  if (includes(source, [/storyboard|分镜/])) capabilities.add("storyboard_generation");
  if (includes(source, [/script|剧本/])) capabilities.add("script_generation");
  if (includes(source, [/audio|music|bgm|音频|音乐|配乐/])) capabilities.add("audio_generation");
  if (includes(source, [/motion|hyperframes|动效|动态标题/])) capabilities.add("motion_graphics");
  if (!capabilities.size) capabilities.add("create_workflow");
  return [...capabilities];
};

export function capabilityRecordFromSkill(skill: SkillLike): CapabilityRecord {
  return {
    id: `skill:${skill.id}`,
    kind: "skill",
    name: skill.name,
    description: [skill.tagline, skill.usageScenario, skill.expectedOutput].filter(Boolean).join(" "),
    capabilities: inferSkillCapabilities(skill),
    aliases: [skill.name, skill.tagline].filter(Boolean),
    accepts: ["story_brief", "reference_image"],
    produces: ["workflow_plan"],
    risk: "write",
    requiresApproval: false,
    availability: "available",
    executorRef: `skill:${skill.id}`,
    metadata: { skillId: skill.id, skillMd: skill.skillMd, howToUse: skill.howToUse, expectedOutput: skill.expectedOutput },
  };
}
