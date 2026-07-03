import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AgentSkillName = "workflow-planner" | "canvas-edit" | "canvas-organize" | "ideation-dialogue";

const cache = new Map<AgentSkillName, string>();

export function readAgentSkill(name: AgentSkillName) {
  const cached = cache.get(name);
  if (cached) return cached;
  const candidates = [
    join(process.cwd(), "lib", "agent", "skills", name, "SKILL.md"),
    join(process.cwd(), "V2-map", "Mindverse", "lib", "agent", "skills", name, "SKILL.md"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`Agent skill ${name} was not found. Checked: ${candidates.join(", ")}`);
  const skill = readFileSync(path, "utf8");
  cache.set(name, skill);
  return skill;
}
