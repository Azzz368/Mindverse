import type { SkillDraft, SkillSummary, StoredSkill } from "@/shared/skills/skillTypes";

export type ListSkillsResponse = { ok: true; output?: { skills?: SkillSummary[] } };
export type SkillRecordResponse = { ok: true; output?: StoredSkill };
export type DeleteSkillResponse = { ok: true };
export type SaveSkillRequest = { accessCode: string; skill: SkillDraft };
