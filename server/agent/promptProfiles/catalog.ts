import "server-only";

import type { PromptProfile } from "@/shared/agent/promptProfiles";

/**
 * These are deliberately compact runtime versions of the supplied SKILL.md
 * documents.  The full, sectioned text remains in ragDocument for retrieval;
 * the composer receives only rules relevant to the current visual step.
 */
export const builtInPromptProfiles: PromptProfile[] = [
  {
    id: "cinematic-multishot-prompt-policy",
    name: "电影级多分镜提示词规范",
    description: "将创意拆成世界观、角色、场景、镜头、动作、声音与连续性约束，生成可执行的图片和视频提示词。",
    role: "base_policy",
    appliesTo: ["image", "video"],
    priority: 100,
    aliases: ["通用视频生成", "多分镜", "电影级", "cinematic multishot", "structured video prompt"],
    runtimeInstructions: `Use this as the neutral visual-prompt foundation. First establish world, then locked characters, then scene and camera. Write one coherent shot, never a storyboard grid. Make every subject visually concrete: appearance, wardrobe, prop, location, lighting, composition, camera movement, and physically continuous action. Preserve character, wardrobe, prop, weather, light direction, spatial direction and visual medium across shots. State cinematic image quality appropriate to the requested medium; do not force photorealism when a style profile specifies animation. Avoid vague adjective piles, impossible actions, unstable in-image text, watermarks, collage, split screens, game-CG/plastic look, anatomy errors, and AI-smear artifacts. Output natural English generation prompts and a concise model-safe negative prompt.`,
    ragDocument: `# 电影级多分镜提示词规范\n\n## Purpose\nTransform a story, characters, setting, action, mood and camera intent into structured image and video prompts.\n\n## Required order\n1. Define world and narrative premise.\n2. Lock visual character identity, body, wardrobe, prop and emotional state.\n3. Define setting, time, weather, light, palette and spatial relationships.\n4. For each shot specify duration, shot size, composition, camera motion, visible action, physical feedback, performance emphasis and sound intent.\n\n## Continuity\nKeep characters, costumes, props, scene architecture, direction of movement, weather, lighting and visual medium consistent across shots. Actions must have physical cause and effect.\n\n## Quality guardrails\nAvoid vague descriptions, collage/storyboard grids, watermarks, generated text, game CG, plastic materials, distorted anatomy, floating weightless motion, abrupt character changes, over-sharpening and AI-smear artifacts.\n\n## Output\nWrite concise English prompts for one image or video shot plus a negative prompt.`,
  },
  {
    id: "japanese-youth-anime-cinematic",
    name: "日系青春剧场版动画",
    description: "用于二维青春动画、校园与城市故事、通透天空和雨后光影的图片与视频提示词。",
    role: "style_profile",
    appliesTo: ["image", "video"],
    priority: 200,
    aliases: ["日系动画", "日系青春动画", "青春剧场版", "anime", "anime cinematic", "hand-drawn anime", "新海诚", "makoto shinkai"],
    conflictsWith: ["photorealistic-live-action", "cinematic-multishot-photoreal"],
    runtimeInstructions: `Apply an original Japanese youth theatrical-animation direction, not the work of any named living artist. Use 2D hand-drawn anime characters, clean linework, painterly layered backgrounds, luminous natural light, transparent sky and rich clouds, rain-wet reflections, campus and city details, gentle magical realism, and cinematic framing. Keep characters age-appropriate and school clothing non-sexualized. Express emotion through light, weather, distance, pauses, wind, curtains, hair, rain and reflections. Prefer short on-screen text only when indispensable. Do not request imitation of a specific film, character, frame, poster, logo or dialogue. Exclude photorealistic skin, 3D plastic rendering, game CG, adultized minors, sexualization, gore, self-harm glorification, extreme horror, copied characters and unstable faces/hands.`,
    ragDocument: `# 日系青春剧场版动画\n\n## Visual direction\nOriginal Japanese youth theatrical animation: transparent blue sky, layered clouds, warm rim light, rain-wet streets, school and city detail, 2D hand-drawn linework and painterly backgrounds. This is a general visual direction, not imitation of a named artist or work.\n\n## Story and audience\nMiddle-school-friendly stories about friendship, growth, promises, searching, dreams, campus life and gentle fantasy. Avoid sexualization, gore, severe horror, self-harm, adult relationships and hopeless endings.\n\n## Continuity\nLock hairstyle, eye color, school clothes, bag, accessory, age, prop, season, weather, light direction and character motion.\n\n## Animation detail\nUse wind in hair and curtains, moving clouds, rain ripples, reflections, train lights, leaves, dust and small emotional pauses.\n\n## Negative constraints\nNo photorealistic people, 3D plastic, game CG, copied famous characters or film frames, adultized students, watermark, logo, malformed hands, face drift, unreadable text or AI-smear artifacts.`,
  },
];

export const promptProfileById = (id: string) => builtInPromptProfiles.find((profile) => profile.id === id);
