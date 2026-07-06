import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const readSkill = (filename: string) => {
  const candidates = [
    join(process.cwd(), "server", "workflow", "skills", filename),
    join(process.cwd(), "V2-map", "Mindverse", "server", "workflow", "skills", filename),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`Workflow skill ${filename} was not found. Checked: ${candidates.join(", ")}`);
  return readFileSync(path, "utf8");
};
const render = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)), template);

export const scriptInstructionFromSkill = (brief: string, tone: string, sceneCount: number) =>
  render(readSkill("ScriptNodeSkill.skill.md"), { brief, tone, sceneCount });

export const professionalStoryboardInstructionFromSkill = (brief: string, sceneCount: number) =>
  render(readSkill("ProfessionalStoryboardSkill.skill.md"), { brief, sceneCount });
