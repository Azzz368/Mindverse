import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readSkill = (filename: string) => readFileSync(join(process.cwd(), "lib", "workflow", "skills", filename), "utf8");
const render = (template: string, values: Record<string, string | number>) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)), template);

export const scriptInstructionFromSkill = (brief: string, tone: string, sceneCount: number) => render(readSkill("ScriptNodeSkill.skill.md"), { brief, tone, sceneCount });
export const professionalStoryboardInstructionFromSkill = (brief: string, sceneCount: number) => render(readSkill("ProfessionalStoryboardSkill.skill.md"), { brief, sceneCount });
