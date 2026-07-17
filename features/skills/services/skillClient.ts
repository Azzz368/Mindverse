import { deleteJson, getJson, postJson, putJson } from "@/shared/api/client";
import type {
  DeleteSkillResponse,
  ListSkillsResponse,
  SaveSkillRequest,
  SkillRecordResponse,
} from "@/shared/api/skillContracts";

export const SKILL_DRAFT_SNAPSHOT_KEY = "mindverse-skill-draft-snapshot";
export const PENDING_SKILL_KEY = "mindverse-pending-skill";
export const ACTIVE_SKILL_KEY = "mindverse-active-skill";

export const listSkillsRemote = (accessCode: string) =>
  getJson<ListSkillsResponse>(`/api/skills?accessCode=${encodeURIComponent(accessCode)}`, "Could not load skills.");

export const getSkillRemote = (skillId: string, accessCode: string) =>
  getJson<SkillRecordResponse>(`/api/skills/${encodeURIComponent(skillId)}?accessCode=${encodeURIComponent(accessCode)}`, "Could not load skill.");

export const createSkillRemote = (request: SaveSkillRequest) =>
  postJson<SkillRecordResponse>("/api/skills", request, "Could not create skill.");

export const updateSkillRemote = (skillId: string, request: SaveSkillRequest) =>
  putJson<SkillRecordResponse>(`/api/skills/${encodeURIComponent(skillId)}`, request, "Could not update skill.");

export const deleteSkillRemote = (skillId: string, accessCode: string) =>
  deleteJson<DeleteSkillResponse>(`/api/skills/${encodeURIComponent(skillId)}?accessCode=${encodeURIComponent(accessCode)}`, "Could not delete skill.");
