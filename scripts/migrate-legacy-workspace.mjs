import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { Pool } = pg;
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const provider = (process.env.WORKFLOW_STORAGE_PROVIDER || "bunny").trim().toLowerCase();
const legacyCode = (process.env.MINDVERSE_LEGACY_ACCESS_CODE || "666666").trim();
const ownerEmail = required("MINDVERSE_LEGACY_OWNER_EMAIL").toLowerCase();
const localRoot = process.env.MINDVERSE_LOCAL_STORAGE_ROOT || path.join(process.cwd(), ".mindverse-local");
const bunnyOrigin = () => {
  const region = process.env.BUNNY_STORAGE_REGION?.trim() || "sg";
  return `https://${region}.storage.bunnycdn.com/${required("BUNNY_STORAGE_ZONE")}`;
};

async function readJson(storageKey) {
  if (provider === "local") {
    try { return JSON.parse(await readFile(path.join(localRoot, ...storageKey.split("/")), "utf8")); }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  }
  const response = await fetch(`${bunnyOrigin()}/${storageKey}`, { headers: { AccessKey: required("BUNNY_ACCESS_KEY") } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Bunny read failed for ${storageKey}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function writeJson(storageKey, value) {
  const body = JSON.stringify(value, null, 2);
  if (provider === "local") {
    const target = path.join(localRoot, ...storageKey.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
    return;
  }
  const response = await fetch(`${bunnyOrigin()}/${storageKey}`, {
    method: "PUT",
    headers: { AccessKey: required("BUNNY_ACCESS_KEY"), "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  if (!response.ok) throw new Error(`Bunny write failed for ${storageKey}: ${response.status} ${await response.text()}`);
}

const pool = new Pool({
  connectionString: required("DATABASE_URL"),
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" },
});

async function main() {
  const owner = await pool.query(
    `SELECT u.id AS user_id, w.id AS workspace_id
       FROM mindverse_users u
       JOIN mindverse_workspaces w ON w.owner_user_id = u.id
      WHERE lower(u.email) = $1
      ORDER BY w.created_at
      LIMIT 1`,
    [ownerEmail],
  );
  if (!owner.rows[0]) throw new Error(`No registered workspace owner found for ${ownerEmail}. Register that account first.`);
  const { user_id: userId, workspace_id: workspaceId } = owner.rows[0];
  let workflowCount = 0;
  let skillCount = 0;
  const legacyVoiceIds = new Set();

  const workflowIndex = await readJson(`workflows/access-${legacyCode}/index.json`);
  for (const summary of Array.isArray(workflowIndex?.workflows) ? workflowIndex.workflows : []) {
    const workflow = await readJson(`workflows/access-${legacyCode}/${summary.id}.json`);
    if (!workflow) continue;
    for (const node of Array.isArray(workflow.nodes) ? workflow.nodes : []) {
      const data = node?.data && typeof node.data === "object" ? node.data : {};
      if (data.nodeType !== "voiceClone" && data.nodeType !== "voiceTTS") continue;
      const outputValue = data.output?.value && typeof data.output.value === "object" ? data.output.value : {};
      const voiceId = typeof data.voice === "string" && data.voice.trim() ? data.voice.trim() : typeof outputValue.voice === "string" ? outputValue.voice.trim() : "";
      if (voiceId) legacyVoiceIds.add(voiceId);
    }
    const exists = await pool.query(`SELECT 1 FROM mindverse_workflows WHERE id = $1`, [summary.id]);
    if (exists.rowCount) continue;
    const createdAt = summary.createdAt || workflow.createdAt || new Date().toISOString();
    const updatedAt = summary.updatedAt || workflow.updatedAt || createdAt;
    const targetKey = `workspaces/${workspaceId}/workflows/${summary.id}/snapshots/revision-1.json`;
    await writeJson(targetKey, { ...workflow, ...summary, revision: 1 });
    await pool.query(
      `INSERT INTO mindverse_workflows (id, workspace_id, created_by, name, snapshot_storage_key, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7)`,
      [summary.id, workspaceId, userId, summary.name || workflow.name || "Untitled workflow", targetKey, createdAt, updatedAt],
    );
    workflowCount += 1;
  }

  const skillIndex = await readJson(`skills/access-${legacyCode}/index.json`);
  const migratedSkillSummaries = [];
  for (const summary of Array.isArray(skillIndex?.skills) ? skillIndex.skills : []) {
    const skill = await readJson(`skills/access-${legacyCode}/${summary.id}.json`);
    if (!skill) continue;
    const exists = await pool.query(`SELECT 1 FROM mindverse_skills WHERE id = $1`, [summary.id]);
    if (exists.rowCount) {
      migratedSkillSummaries.push(summary);
      continue;
    }
    const targetKey = `workspaces/${workspaceId}/skills/${summary.id}.json`;
    await writeJson(targetKey, skill);
    await pool.query(
      `INSERT INTO mindverse_skills (id, workspace_id, created_by, name, storage_key, version, visibility, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [summary.id, workspaceId, userId, summary.name || skill.name, targetKey, Number(skill.version) || 1, skill.visibility || "private", summary.createdAt || skill.createdAt || new Date().toISOString(), summary.updatedAt || skill.updatedAt || new Date().toISOString()],
    );
    migratedSkillSummaries.push(summary);
    skillCount += 1;
  }
  if (migratedSkillSummaries.length) {
    const existingIndex = await readJson(`workspaces/${workspaceId}/skills/index.json`);
    const existingSkills = Array.isArray(existingIndex?.skills) ? existingIndex.skills : [];
    const ids = new Set(existingSkills.map((skill) => skill.id));
    await writeJson(`workspaces/${workspaceId}/skills/index.json`, { skills: [...existingSkills, ...migratedSkillSummaries.filter((skill) => !ids.has(skill.id))] });
  }
  for (const voiceId of legacyVoiceIds) {
    await pool.query(
      `INSERT INTO mindverse_voice_assets (workspace_id, provider, voice_id, display_name, metadata)
       VALUES ($1, 'qwen', $2, $2, $3::jsonb)
       ON CONFLICT (provider, voice_id) DO NOTHING`,
      [workspaceId, voiceId, JSON.stringify({ migratedFrom: `access-${legacyCode}` })],
    );
  }
  process.stdout.write(`Legacy migration complete: ${workflowCount} workflows, ${skillCount} skills, and ${legacyVoiceIds.size} cloned voice ids assigned to ${ownerEmail}.\n`);
}

try { await main(); }
finally { await pool.end(); }
