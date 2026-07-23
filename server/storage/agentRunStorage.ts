import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getJsonFromBunny, uploadJsonToBunny } from "./bunnyClient";
import type {
  AgentRunCheckpoint,
  AgentRunExecutionMode,
  AgentRunRecord,
  AgentRunStatus,
  AgentRunTrace,
  AgentRunUpdate,
} from "@/shared/agent/agentAutonomy";

type AgentRunIndexEntry = {
  id: string;
  status: AgentRunStatus;
  executionMode: AgentRunExecutionMode;
  updatedAt: string;
};

type AgentRunIndex = { runs: AgentRunIndexEntry[] };

type PersistTraceOptions = {
  executionMode?: AgentRunExecutionMode;
  request?: AgentRunRecord["request"];
  checkpoint?: AgentRunCheckpoint;
};

const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/;
const INDEX_PATH = "agent-runs/index.json";
const MAX_INDEX_ENTRIES = 500;
const MAX_STORED_STRING = 200_000;
const MAX_RECORD_BYTES = 5 * 1024 * 1024;
const locks = new Map<string, Promise<void>>();

const storageProvider = () => {
  const configured = process.env.AGENT_RUN_STORAGE_PROVIDER?.trim().toLowerCase();
  if (configured === "local" || configured === "bunny") return configured;
  return process.env.BUNNY_STORAGE_ZONE && process.env.BUNNY_ACCESS_KEY ? "bunny" : "local";
};

const localRoot = () => process.env.MINDVERSE_AGENT_RUN_STORAGE_ROOT?.trim() || path.join(
  process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || os.homedir(),
  "Mindverse",
  "agent-runs",
);

const runPath = (runId: string) => `agent-runs/${runId}.json`;
const localPath = (remotePath: string) => path.join(localRoot(), ...remotePath.split("/"));

const requireRunId = (runId: string) => {
  if (!RUN_ID.test(runId)) throw new Error("Invalid Agent run id.");
  return runId;
};

async function withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

async function readLocalJson<T>(remotePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(localPath(remotePath), "utf8")) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocalJson(remotePath: string, value: unknown) {
  const target = localPath(remotePath);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, target);
}

const readJson = <T>(remotePath: string) => storageProvider() === "bunny"
  ? getJsonFromBunny<T>(remotePath)
  : readLocalJson<T>(remotePath);

const writeJson = (remotePath: string, value: unknown) => storageProvider() === "bunny"
  ? uploadJsonToBunny(remotePath, value).then(() => undefined)
  : writeLocalJson(remotePath, value);

const sanitizeValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === "string") {
    if (/^data:[^;,]+(?:;[^,]+)*;base64,/i.test(value)) return `[inline media omitted: ${value.length} chars]`;
    return value.length > MAX_STORED_STRING ? `${value.slice(0, MAX_STORED_STRING)}\n[truncated]` : value;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular value omitted]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, seen)]));
};

const boundedRecord = (record: AgentRunRecord): AgentRunRecord => {
  const sanitized = sanitizeValue(record) as AgentRunRecord;
  if (Buffer.byteLength(JSON.stringify(sanitized), "utf8") <= MAX_RECORD_BYTES) return sanitized;
  return {
    ...sanitized,
    checkpoint: sanitized.checkpoint ? { ...sanitized.checkpoint, canvasSnapshot: undefined } : undefined,
    summary: sanitized.summary
      ? `${sanitized.summary}\n[Canvas checkpoint omitted because the run record exceeded 5 MB.]`
      : "Canvas checkpoint omitted because the run record exceeded 5 MB.",
  };
};

const mergeEvents = (current: AgentRunRecord["events"], incoming: AgentRunRecord["events"]) => {
  const byId = new Map(current.map((event) => [event.id, event]));
  incoming.forEach((event) => byId.set(event.id, { ...event, runId: event.runId || undefined }));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-500);
};

async function updateIndex(record: AgentRunRecord) {
  await withLock("index", async () => {
    const current = await readJson<AgentRunIndex>(INDEX_PATH);
    const next: AgentRunIndexEntry = {
      id: record.id,
      status: record.status,
      executionMode: record.executionMode,
      updatedAt: record.updatedAt,
    };
    const runs = [next, ...(current?.runs || []).filter((item) => item.id !== record.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_INDEX_ENTRIES);
    await writeJson(INDEX_PATH, { runs });
  });
}

async function saveRecord(record: AgentRunRecord) {
  const bounded = boundedRecord(record);
  await writeJson(runPath(record.id), bounded);
  await updateIndex(bounded);
  return bounded;
}

export async function getAgentRun(runIdValue: string): Promise<AgentRunRecord | null> {
  const runId = requireRunId(runIdValue);
  return readJson<AgentRunRecord>(runPath(runId));
}

export async function listAgentRuns(limitValue = 20): Promise<AgentRunIndexEntry[]> {
  const limit = Math.max(1, Math.min(100, Math.round(limitValue)));
  const index = await readJson<AgentRunIndex>(INDEX_PATH);
  return (index?.runs || []).slice(0, limit);
}

export async function persistAgentRunTrace(trace: AgentRunTrace, options: PersistTraceOptions = {}) {
  requireRunId(trace.id);
  return withLock(trace.id, async () => {
    const existing = await getAgentRun(trace.id);
    const record: AgentRunRecord = {
      schemaVersion: 1,
      revision: (existing?.revision || 0) + 1,
      executionMode: options.executionMode || existing?.executionMode || "browser",
      ...trace,
      startedAt: existing?.startedAt || trace.startedAt,
      events: mergeEvents(existing?.events || [], trace.events),
      request: options.request || existing?.request,
      checkpoint: options.checkpoint ? {
        ...existing?.checkpoint,
        ...options.checkpoint,
        planResponse: options.checkpoint.planResponse || existing?.checkpoint?.planResponse,
        retrieval: options.checkpoint.retrieval || existing?.checkpoint?.retrieval,
      } : existing?.checkpoint,
      lease: existing?.lease,
      cancelRequestedAt: existing?.cancelRequestedAt,
      resumeRequestedAt: existing?.resumeRequestedAt,
    };
    return saveRecord(record);
  });
}

export async function updateAgentRun(runIdValue: string, update: AgentRunUpdate) {
  const runId = requireRunId(runIdValue);
  return withLock(runId, async () => {
    const existing = await getAgentRun(runId);
    if (!existing) throw new Error("Agent run not found.");
    const updatedAt = new Date().toISOString();
    const record: AgentRunRecord = {
      ...existing,
      revision: existing.revision + 1,
      status: update.status || existing.status,
      currentPhase: update.currentPhase || existing.currentPhase,
      summary: update.summary ?? existing.summary,
      updatedAt,
      events: mergeEvents(existing.events, update.events || []),
      checkpoint: update.checkpoint ? {
        ...existing.checkpoint,
        ...update.checkpoint,
        planResponse: update.checkpoint.planResponse || existing.checkpoint?.planResponse,
        retrieval: update.checkpoint.retrieval || existing.checkpoint?.retrieval,
      } : existing.checkpoint,
    };
    return saveRecord(record);
  });
}

export async function requestAgentRunCancellation(runIdValue: string) {
  const runId = requireRunId(runIdValue);
  return withLock(runId, async () => {
    const existing = await getAgentRun(runId);
    if (!existing) throw new Error("Agent run not found.");
    const now = new Date().toISOString();
    return saveRecord({
      ...existing,
      revision: existing.revision + 1,
      status: "cancelled",
      currentPhase: "cancelled",
      updatedAt: now,
      cancelRequestedAt: now,
      lease: undefined,
    });
  });
}

export async function requestAgentRunResume(runIdValue: string) {
  const runId = requireRunId(runIdValue);
  return withLock(runId, async () => {
    const existing = await getAgentRun(runId);
    if (!existing) throw new Error("Agent run not found.");
    if (!existing.checkpoint?.planResponse) throw new Error("This Agent run has no resumable plan checkpoint.");
    const now = new Date().toISOString();
    return saveRecord({
      ...existing,
      revision: existing.revision + 1,
      status: existing.executionMode === "worker" ? "ready" : "running",
      currentPhase: "applying",
      updatedAt: now,
      resumeRequestedAt: now,
      cancelRequestedAt: undefined,
      lease: undefined,
    });
  });
}

export async function claimNextWorkerRun(workerId: string, leaseMs = 60_000) {
  return withLock("worker-claim", async () => {
    const entries = await listAgentRuns(100);
    const now = Date.now();
    for (const entry of entries.reverse()) {
      if (entry.executionMode !== "worker" || !["ready", "running"].includes(entry.status)) continue;
      const run = await getAgentRun(entry.id);
      if (!run || run.cancelRequestedAt) continue;
      if (run.lease && Date.parse(run.lease.expiresAt) > now) continue;
      const acquiredAt = new Date(now).toISOString();
      const claimed = await withLock(run.id, async () => saveRecord({
        ...run,
        revision: run.revision + 1,
        status: "running",
        currentPhase: "applying",
        updatedAt: acquiredAt,
        lease: {
          workerId,
          acquiredAt,
          heartbeatAt: acquiredAt,
          expiresAt: new Date(now + Math.max(15_000, leaseMs)).toISOString(),
        },
      }));
      return claimed;
    }
    return null;
  });
}

export async function heartbeatAgentRunLease(runIdValue: string, workerId: string, leaseMs = 60_000) {
  const runId = requireRunId(runIdValue);
  return withLock(runId, async () => {
    const existing = await getAgentRun(runId);
    if (!existing?.lease || existing.lease.workerId !== workerId) throw new Error("Agent run lease is not owned by this worker.");
    const now = Date.now();
    return saveRecord({
      ...existing,
      revision: existing.revision + 1,
      updatedAt: new Date(now).toISOString(),
      lease: {
        ...existing.lease,
        heartbeatAt: new Date(now).toISOString(),
        expiresAt: new Date(now + Math.max(15_000, leaseMs)).toISOString(),
      },
    });
  });
}
