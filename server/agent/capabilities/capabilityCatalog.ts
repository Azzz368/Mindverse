import "server-only";

import type { CapabilityRecord } from "@/shared/agent/capabilityTypes";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import { agentToolDefinitions } from "@/shared/agent/agentTools";
import { agentWorkflowSkills } from "@/shared/agent/workflowSkills";
import { modelCapabilityRecords } from "@/server/agent/capabilities/modelCapabilityRegistry";
import { capabilityRecordFromSkill } from "@/server/agent/capabilities/skillCapabilityIndexer";
import { videoModelPresets } from "@/shared/workflow/videoModelPresets";

const runtimeRecords = (): CapabilityRecord[] => [
  {
    id: "runtime:prompt-authoring",
    kind: "runtime",
    name: "Canvas Prompt Authoring",
    description: "Materialize an editable prompt or creative brief as the deterministic start of a canvas workflow.",
    capabilities: ["prompt_authoring"],
    aliases: ["prompt", "brief", "提示词", "创意简报"],
    accepts: ["story_brief", "source_text"],
    produces: ["prompt"],
    risk: "write",
    requiresApproval: false,
    availability: "available",
    executorRef: "prompt:canvas",
    metadata: { nodeType: "prompt" },
  },
  {
    id: "runtime:reference-material",
    kind: "runtime",
    name: "Canvas Reference Material",
    description: "Preserve an existing user-selected image or search result as an editable canvas reference.",
    capabilities: ["reference_material"],
    aliases: ["reference", "素材", "参考图"],
    accepts: ["reference_image", "image_candidates"],
    produces: ["reference_image"],
    risk: "write",
    requiresApproval: false,
    availability: "available",
    executorRef: "reference:canvas",
    metadata: { nodeType: "reference" },
  },
  {
    id: "runtime:ffmpeg-video-edit",
    kind: "runtime",
    name: "FFmpeg Video Edit",
    description: "Trim, concatenate, reorder, transcode, mix background audio, preserve audio, add subtitles, and apply simple fades.",
    capabilities: ["video_edit", "video_concat", "background_music", "subtitle_burn_in", "transcode"],
    aliases: ["ffmpeg", "剪辑", "拼接", "背景音乐", "字幕"],
    accepts: ["source_video", "source_audio", "background_music"],
    produces: ["video"],
    constraints: { maxVideos: 20, maxAudios: 4, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["480p", "720p", "1080p"] },
    risk: "write",
    requiresApproval: false,
    availability: "available",
    executorRef: "videoEdit:ffmpeg",
    metadata: { nodeType: "videoEdit" },
  },
  {
    id: "runtime:hyperframes-motion",
    kind: "runtime",
    name: "HyperFrames Motion Graphics",
    description: "Create deterministic motion graphics, title overlays, captions, lower thirds, progress bars, and social-video packaging.",
    capabilities: ["motion_graphics", "title_overlay", "caption_overlay", "lower_third", "progress_overlay"],
    aliases: ["hyperframes", "motion", "动效", "标题包装", "字幕"],
    accepts: ["source_video", "source_image", "source_audio"],
    produces: ["video"],
    constraints: { maxVideos: 20, maxImages: 20, maxAudios: 4, aspectRatios: ["16:9", "9:16", "1:1"] },
    risk: "write",
    requiresApproval: false,
    availability: "available",
    executorRef: "motion:hyperframes",
    metadata: { nodeType: "motion" },
  },
  {
    id: "runtime:canvas-output",
    kind: "runtime",
    name: "Canvas Output",
    description: "Expose the final generated media as the workflow deliverable.",
    capabilities: ["deliver_output"],
    accepts: ["image", "video", "audio"],
    produces: ["canvas_output"],
    risk: "read",
    requiresApproval: false,
    availability: "available",
    executorRef: "output:canvas",
    metadata: { nodeType: "output" },
  },
];

const toolRecords = (): CapabilityRecord[] => Object.values(agentToolDefinitions).map((tool) => ({
  id: `tool:${tool.name}`,
  kind: "tool",
  name: tool.title,
  description: tool.description,
  capabilities: tool.name === "image_search" ? ["search_image", "find_person_reference", "reference_material"] : [tool.name],
  aliases: [tool.name, tool.title, "图片搜索", "搜索图片"],
  accepts: ["text_query"],
  produces: ["image_candidates"],
  risk: tool.risk,
  requiresApproval: tool.requiresApproval,
  availability: "available",
  executorRef: tool.name,
  metadata: { inputSchema: tool.inputSchema },
}));

const builtInSkillRecords = (): CapabilityRecord[] => Object.values(agentWorkflowSkills).map((skill) => ({
  id: `skill:${skill.id}`,
  kind: "skill",
  name: skill.label,
  description: skill.description,
  capabilities: ["fixed_scene_video", "character_consistency", "reference_preparation", "video_generation"],
  aliases: [skill.id, skill.label, "四面设定图", "场景九宫格"],
  accepts: ["story_brief", "reference_image"],
  produces: ["workflow_plan"],
  risk: "write",
  requiresApproval: false,
  availability: "available",
  executorRef: `skill:${skill.id}`,
  metadata: { defaultDuration: skill.defaultDuration },
}));

export function listCapabilityCatalog(customSkill?: ActiveSkillContext): CapabilityRecord[] {
  const records = [...runtimeRecords(), ...toolRecords(), ...builtInSkillRecords(), ...modelCapabilityRecords()];
  if (customSkill) records.push(capabilityRecordFromSkill(customSkill));
  return records;
}

export const getCapabilityRecord = (id: string, customSkill?: ActiveSkillContext) =>
  listCapabilityCatalog(customSkill).find((record) => record.id === id);

export function nodeParamsForCapability(id: string | undefined): Record<string, unknown> {
  if (!id) return {};
  const record = getCapabilityRecord(id);
  const patch = record?.metadata?.nodePatch;
  return patch && typeof patch === "object" && !Array.isArray(patch) ? { ...(patch as Record<string, unknown>) } : {};
}

export const capabilityCatalogDocument = (record: CapabilityRecord) => [
  `# ${record.name}`,
  `ID: ${record.id}`,
  `Kind: ${record.kind}`,
  `Description: ${record.description}`,
  `Capabilities: ${record.capabilities.join(", ")}`,
  `Accepts: ${record.accepts.join(", ") || "none"}`,
  `Produces: ${record.produces.join(", ") || "none"}`,
  `Constraints: ${JSON.stringify(record.constraints || {})}`,
  `Availability: ${record.availability}`,
  `Risk: ${record.risk}; approval=${record.requiresApproval}`,
  `Executor: ${record.executorRef}`,
  record.metadata?.nodePatch ? `Node patch: ${JSON.stringify(record.metadata.nodePatch)}` : "",
  typeof record.metadata?.skillMd === "string" ? `Skill instructions:\n${record.metadata.skillMd}` : "",
  typeof record.metadata?.howToUse === "string" ? `How to use:\n${record.metadata.howToUse}` : "",
  typeof record.metadata?.expectedOutput === "string" ? `Expected output:\n${record.metadata.expectedOutput}` : "",
].filter(Boolean).join("\n\n");

export const videoPresetIds = () => Object.keys(videoModelPresets);
