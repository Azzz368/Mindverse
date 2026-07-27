import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getJsonFromBunny, uploadJsonToBunny } from "@/server/storage/bunnyClient";
import type { MotionCompositionInput } from "./motionCompositionRunner";

export type MotionJobPhase = "queued" | "preparing" | "codex" | "checking" | "rendering" | "uploading" | "completed" | "failed";
export type MotionJobStatus = "pending" | "running" | "completed" | "failed";

export type MotionJobRecord = {
  id: string;
  status: MotionJobStatus;
  phase: MotionJobPhase;
  message: string;
  progress: number;
  input: MotionCompositionInput;
  output?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  heartbeatAt: string;
};

const JOB_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/;
const locks = new Map<string, Promise<void>>();

const provider = () => process.env.MINDVERSE_MOTION_JOB_STORAGE_PROVIDER?.trim().toLowerCase() === "local"
  ? "local"
  : process.env.BUNNY_STORAGE_ZONE && process.env.BUNNY_ACCESS_KEY ? "bunny" : "local";
const localRoot = () => process.env.MINDVERSE_MOTION_JOB_STORAGE_ROOT?.trim() || path.join(
  process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || os.homedir(), "Mindverse", "motion-jobs",
);
const remotePath = (id: string) => `motion-jobs/${id}.json`;
const localPath = (id: string) => path.join(localRoot(), `${id}.json`);

const requireId = (id: string) => {
  if (!JOB_ID.test(id)) throw new Error("Invalid Motion job id.");
  return id;
};

async function withLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) || Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(id, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(id) === queued) locks.delete(id);
  }
}

async function readLocal(id: string): Promise<MotionJobRecord | null> {
  try {
    return JSON.parse(await readFile(localPath(id), "utf8")) as MotionJobRecord;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocal(id: string, value: MotionJobRecord) {
  const target = localPath(id);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, target);
}

const readRecord = (id: string) => provider() === "bunny" ? getJsonFromBunny<MotionJobRecord>(remotePath(id)) : readLocal(id);
const writeRecord = (record: MotionJobRecord) => provider() === "bunny"
  ? uploadJsonToBunny(remotePath(record.id), record).then(() => undefined)
  : writeLocal(record.id, record);

export async function createMotionJob(input: MotionCompositionInput): Promise<MotionJobRecord> {
  const now = new Date().toISOString();
  const record: MotionJobRecord = {
    id: `motion-${crypto.randomUUID()}`,
    status: "pending",
    phase: "queued",
    message: "Queued for Codex + HyperFrames processing.",
    progress: 0,
    input,
    createdAt: now,
    updatedAt: now,
    heartbeatAt: now,
  };
  await writeRecord(record);
  return record;
}

export async function getMotionJob(idValue: string) {
  return readRecord(requireId(idValue));
}

export async function updateMotionJob(idValue: string, patch: Partial<Omit<MotionJobRecord, "id" | "input" | "createdAt">>) {
  const id = requireId(idValue);
  return withLock(id, async () => {
    const existing = await readRecord(id);
    if (!existing) throw new Error("Motion job not found.");
    const now = new Date().toISOString();
    const next: MotionJobRecord = {
      ...existing,
      ...patch,
      updatedAt: now,
      heartbeatAt: now,
    };
    await writeRecord(next);
    return next;
  });
}
