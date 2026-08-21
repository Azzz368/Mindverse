"use client";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { BottomRunBar } from "./BottomRunBar";
import { AgentWorkflowPanel } from "@/features/agent/components/AgentWorkflowPanel";
import { CreativeCanvas } from "./CreativeCanvas";
import { TopBar } from "./TopBar";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { canvasStorage } from "@/features/canvas/services/canvasStorage";
import { getWorkflowSnapshot, saveWorkflowSnapshot } from "@/features/workspace/services/workflowClient";
import type { CanvasSnapshot } from "@/shared/canvas";
import type { StoredSkill } from "@/shared/skills/skillTypes";
import { cloneSkillCanvasTemplate } from "@/shared/skills/skillTemplate";
import { PENDING_SKILL_KEY } from "@/features/skills/services/skillClient";
import { hasInlineMedia, snapshotForWorkflowPersistence, snapshotJsonSize } from "@/shared/canvas/snapshotTransport";
import { ApiRequestError } from "@/shared/api/client";
import { storyboardScenesFromValue } from "@/shared/workflow/storyPipeline";

const MAX_REMOTE_WORKFLOW_BYTES = 3 * 1024 * 1024;
const MAX_LOCAL_DRAFT_BYTES = 3 * 1024 * 1024;
const REMOTE_SAVE_ERROR_PREFIX = "Remote workflow save";
const workflowDraftKey = (workspaceId: string, workflowId: string) => `mindverse-workflow-draft:${workspaceId}:${workflowId}`;

type WorkflowDraft = { savedAt: number; snapshot: CanvasSnapshot };

const isCanvasSnapshot = (value: unknown): value is CanvasSnapshot => Boolean(
  value
  && typeof value === "object"
  && Array.isArray((value as CanvasSnapshot).nodes)
  && Array.isArray((value as CanvasSnapshot).edges),
);

const loadWorkflowDraft = (workspaceId: string, workflowId: string): WorkflowDraft | null => {
  try {
    const raw = window.localStorage.getItem(workflowDraftKey(workspaceId, workflowId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<WorkflowDraft>;
    return typeof value.savedAt === "number" && isCanvasSnapshot(value.snapshot) ? { savedAt: value.savedAt, snapshot: value.snapshot } : null;
  } catch {
    return null;
  }
};

const saveWorkflowDraft = (workspaceId: string, workflowId: string, snapshot: CanvasSnapshot) => {
  try {
    if (hasInlineMedia(snapshot) || snapshotJsonSize(snapshot) > MAX_LOCAL_DRAFT_BYTES) return false;
    window.localStorage.setItem(workflowDraftKey(workspaceId, workflowId), JSON.stringify({ savedAt: Date.now(), snapshot } satisfies WorkflowDraft));
    return true;
  } catch (error) {
    console.warn("Local workflow draft save failed", error);
    return false;
  }
};

const remoteSaveErrorMessage = (error: unknown) => {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return `${REMOTE_SAVE_ERROR_PREFIX} failed: your session has expired. Current changes remain in this browser draft. Sign in again, then reopen the project.`;
    if (error.status === 404) return `${REMOTE_SAVE_ERROR_PREFIX} failed: the project does not exist or this account cannot access it. Current changes remain in this browser draft.`;
    if (error.status === 409) return `${REMOTE_SAVE_ERROR_PREFIX} conflict: the project was updated in another page. Current changes remain in this browser draft. Refresh to review the latest version.`;
    if (error.status === 413) return `${REMOTE_SAVE_ERROR_PREFIX} failed: the canvas exceeds the server size limit. Split the workflow or remove oversized node content.`;
    return `${REMOTE_SAVE_ERROR_PREFIX} failed (${error.status}): ${error.message} Current changes remain in this browser draft.`;
  }
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return offline
    ? `${REMOTE_SAVE_ERROR_PREFIX} failed: this device is offline. Changes are saved in this browser draft; reconnect and continue editing to retry.`
    : `${REMOTE_SAVE_ERROR_PREFIX} failed: the server could not be reached. Current changes are saved in this browser draft; continue editing later to retry.`;
};

function PendingTaskRecovery() {
  const nodes = useCanvasStore((state) => state.nodes); const pollNode = useCanvasStore((state) => state.pollNode); const seen = useRef(new Set<string>());
  useEffect(() => { const active = new Set<string>(); nodes.forEach((node) => { const value = node.data.output?.value; const details = value && typeof value === "object" ? value as Record<string, unknown> : {}; const taskId = typeof details.taskId === "string" ? details.taskId : ""; if (taskId && (details.status === "pending" || details.status === "running")) { active.add(taskId); if (!seen.current.has(taskId)) { seen.current.add(taskId); void pollNode(node.id); } } }); seen.current.forEach((taskId) => { if (!active.has(taskId)) seen.current.delete(taskId); }); }, [nodes, pollNode]);
  return null;
}

function PendingSkillPlacement() {
  const setPendingAgentPatch = useCanvasStore((state) => state.setPendingAgentPatch);
  useEffect(() => {
    const raw = window.sessionStorage.getItem(PENDING_SKILL_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(PENDING_SKILL_KEY);
    try {
      const skill = JSON.parse(raw) as StoredSkill;
      if (skill.canvasTemplate?.nodes.length) setPendingAgentPatch(cloneSkillCanvasTemplate(skill.canvasTemplate));
    } catch (error) {
      console.warn("Could not prepare the selected skill template.", error);
    }
  }, [setPendingAgentPatch]);
  return null;
}

/** The blank/local canvas has no workflow ID, so it needs its own durable browser save. */
function LocalCanvasPersistence() {
  const projectName = useCanvasStore((state) => state.projectName);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const agentMemory = useCanvasStore((state) => state.agentMemory);
  const setProjectName = useCanvasStore((state) => state.setProjectName);
  const setCanvas = useCanvasStore((state) => state.setCanvas);
  const [hydrated, setHydrated] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const latestSnapshotRef = useRef<CanvasSnapshot | null>(null);

  const saveLocal = () => {
    const snapshot = latestSnapshotRef.current;
    if (!snapshot) return;
    try {
      if (hasInlineMedia(snapshot) || snapshotJsonSize(snapshot) > MAX_LOCAL_DRAFT_BYTES) {
        useCanvasStore.setState({ lastError: "The local canvas contains unarchived media or exceeds 3 MB and cannot be auto-saved. Upload the media again or split the canvas." });
        return;
      }
      canvasStorage.save(snapshot);
    } catch (error) {
      console.error("Local canvas save failed", error);
      useCanvasStore.setState({ lastError: "Local canvas save failed. Check available browser storage." });
    }
  };

  useEffect(() => {
    try {
      const snapshot = canvasStorage.load();
      if (snapshot && isCanvasSnapshot(snapshot)) {
        setProjectName(snapshot.projectName || "Untitled local canvas");
        setCanvas(snapshot.nodes, snapshot.edges, snapshot.agentMemory || null);
      } else {
        setProjectName("Untitled local canvas");
        setCanvas([], [], null);
      }
    } catch (error) {
      console.error("Local canvas load failed", error);
      useCanvasStore.setState({ lastError: "The local canvas could not be loaded. A blank canvas was created." });
      setCanvas([], [], null);
    } finally {
      setHydrated(true);
    }
  }, [setCanvas, setProjectName]);

  useEffect(() => {
    if (!hydrated) return;
    const rawSnapshot: CanvasSnapshot = { version: 1, projectName, nodes, edges, agentMemory: agentMemory || undefined };
    const hadInlineMedia = hasInlineMedia(rawSnapshot);
    const snapshot = snapshotForWorkflowPersistence(rawSnapshot);
    latestSnapshotRef.current = snapshot;
    if (hadInlineMedia) {
      useCanvasStore.setState({ lastError: "The canvas structure was saved, but unarchived embedded media cannot be stored permanently. Upload that media again." });
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(saveLocal, 300);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [agentMemory, edges, hydrated, nodes, projectName]);

  useEffect(() => {
    window.addEventListener("pagehide", saveLocal);
    return () => {
      window.removeEventListener("pagehide", saveLocal);
      saveLocal();
    };
  }, []);

  return null;
}

export function Workspace({ workflowId, workspaceId = "local" }: { workflowId?: string; workspaceId?: string }) {
  const projectName = useCanvasStore((state) => state.projectName);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const agentMemory = useCanvasStore((state) => state.agentMemory);
  const setProjectName = useCanvasStore((state) => state.setProjectName);
  const setCanvas = useCanvasStore((state) => state.setCanvas);
  const normalizeVideoConnections = useCanvasStore((state) => state.normalizeVideoConnections);
  const materializeStoryboardBranch = useCanvasStore((state) => state.materializeStoryboardBranch);
  const loadedRemoteWorkflow = useRef(!workflowId);
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const revisionRef = useRef<number | undefined>(undefined);
  const pendingSaveRef = useRef<{ name: string; snapshot: CanvasSnapshot; expectedRevision?: number } | null>(null);
  const latestSaveRef = useRef<{ name: string; snapshot: CanvasSnapshot; expectedRevision?: number } | null>(null);
  const flushSaveRef = useRef<() => Promise<void>>(async () => undefined);
  const lastSavedJsonRef = useRef("");

  useEffect(() => {
    if (!workflowId || typeof window === "undefined") return;
    loadedRemoteWorkflow.current = false;
    latestSaveRef.current = null;
    pendingSaveRef.current = null;
    lastSavedJsonRef.current = "";
    void (async () => {
      try {
        const payload = await getWorkflowSnapshot(workflowId);
        if (!payload.output) throw new Error("Workflow not found.");
        const remoteSnapshot: CanvasSnapshot = {
          version: 1,
          projectName: payload.output.projectName || payload.output.name || "Untitled workflow",
          nodes: Array.isArray(payload.output.nodes) ? payload.output.nodes as never : [],
          edges: Array.isArray(payload.output.edges) ? payload.output.edges as never : [],
          agentMemory: payload.output.agentMemory,
        };
        revisionRef.current = payload.output.revision ?? 1;
        const draft = loadWorkflowDraft(workspaceId, workflowId);
        const remoteUpdatedAt = Date.parse((payload.output as { updatedAt?: string }).updatedAt || "") || 0;
        const shouldRecoverDraft = Boolean(draft && draft.savedAt > remoteUpdatedAt);
        const initialSnapshot = shouldRecoverDraft ? draft!.snapshot : remoteSnapshot;
        setProjectName(initialSnapshot.projectName || "Untitled workflow");
        setCanvas(initialSnapshot.nodes, initialSnapshot.edges, initialSnapshot.agentMemory || null);
        const loaded = useCanvasStore.getState();
        const snapshot = snapshotForWorkflowPersistence({
          version: 1,
          projectName: loaded.projectName,
          nodes: loaded.nodes,
          edges: loaded.edges,
          agentMemory: loaded.agentMemory || undefined,
        });
        // Do not immediately write a just-loaded workflow back to Render. A
        // legacy snapshot can contain inline media and used to cause a large
        // read → serialize → PUT loop as soon as the canvas finished loading.
        lastSavedJsonRef.current = shouldRecoverDraft ? "" : JSON.stringify({ name: loaded.projectName, snapshot, expectedRevision: revisionRef.current });
        loadedRemoteWorkflow.current = true;
      } catch (error) {
        const draft = loadWorkflowDraft(workspaceId, workflowId);
        if (draft) {
          setProjectName(draft.snapshot.projectName || "Untitled workflow");
          setCanvas(draft.snapshot.nodes, draft.snapshot.edges, draft.snapshot.agentMemory || null);
          lastSavedJsonRef.current = "";
          loadedRemoteWorkflow.current = true;
          useCanvasStore.setState({ lastError: "The remote workflow is temporarily unavailable. The local browser draft was restored and saving will retry after reconnection." });
          return;
        }
        console.error("Remote workflow load failed", error);
        window.location.href = "/workspace";
      }
    })();
  }, [setCanvas, setProjectName, workflowId, workspaceId]);

  useEffect(() => {
    normalizeVideoConnections();
  }, [edges, nodes, normalizeVideoConnections]);

  useEffect(() => {
    nodes.filter((node) => node.data.nodeType === "storyboard" && storyboardScenesFromValue(node.data.output?.value).length > 0).forEach((node) => materializeStoryboardBranch(node.id));
  }, [nodes, materializeStoryboardBranch]);

  useEffect(() => {
    if (!workflowId || !loadedRemoteWorkflow.current || typeof window === "undefined") return;
    const flushSave = async () => {
      if (!workflowId || savingRef.current) return;
      const queued = pendingSaveRef.current;
      if (!queued) return;
      pendingSaveRef.current = null;
      savingRef.current = true;
      let savedSuccessfully = false;
      // A payload can wait while an earlier save advances the remote revision.
      // Always attach the latest acknowledged revision at send time.
      const next = { ...queued, expectedRevision: revisionRef.current };
      try {
        const saved = await saveWorkflowSnapshot(workflowId, next);
        if (saved.output?.revision) revisionRef.current = saved.output.revision;
        const completed = { ...next, expectedRevision: revisionRef.current };
        lastSavedJsonRef.current = JSON.stringify(completed);
        latestSaveRef.current = latestSaveRef.current ? { ...latestSaveRef.current, expectedRevision: revisionRef.current } : completed;
        savedSuccessfully = true;
        useCanvasStore.setState((state) => state.lastError?.startsWith(REMOTE_SAVE_ERROR_PREFIX) ? { lastError: null } : {});
      } catch (error) {
        pendingSaveRef.current = pendingSaveRef.current || next;
        console.error("Remote workflow save failed", error);
        useCanvasStore.setState({ lastError: remoteSaveErrorMessage(error) });
      } finally {
        savingRef.current = false;
        // Do not retry a failed request in a tight loop. The next edit, page
        // hide, or explicit navigation will retry the queued latest snapshot.
        if (!savedSuccessfully || !pendingSaveRef.current) return;
        pendingSaveRef.current = { ...pendingSaveRef.current, expectedRevision: revisionRef.current };
        void flushSave();
      }
    };
    flushSaveRef.current = flushSave;

    const rawSnapshot: CanvasSnapshot = { version: 1, projectName, nodes, edges, agentMemory: agentMemory || undefined };
    const hadInlineMedia = hasInlineMedia(rawSnapshot);
    const snapshot = snapshotForWorkflowPersistence(rawSnapshot);
    if (hadInlineMedia) {
      useCanvasStore.setState({ lastError: "The canvas structure was saved, but unarchived embedded media cannot be stored permanently. Upload that media again." });
    }
    if (snapshotJsonSize(snapshot) > MAX_REMOTE_WORKFLOW_BYTES) {
      latestSaveRef.current = null;
      useCanvasStore.setState({ lastError: `The canvas snapshot exceeds ${MAX_REMOTE_WORKFLOW_BYTES / 1024 / 1024} MB and cannot be saved. Split the workflow or remove oversized node content.` });
      return;
    }
    const payload = { name: projectName, snapshot, expectedRevision: revisionRef.current };
    const payloadJson = JSON.stringify(payload);
    latestSaveRef.current = payload;
    if (payloadJson === lastSavedJsonRef.current) return;
    if (!saveWorkflowDraft(workspaceId, workflowId, snapshot)) {
      useCanvasStore.setState({ lastError: "Local draft save failed. Avoid embedded base64 media and check available browser storage." });
    }

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      pendingSaveRef.current = payload;
      void flushSave();
    }, 1200);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [agentMemory, edges, nodes, projectName, workflowId, workspaceId]);

  useEffect(() => {
    if (!workflowId || typeof window === "undefined") return;
    const flushLatestSave = () => {
      const latest = latestSaveRef.current;
      if (!latest) return;
      pendingSaveRef.current = latest;
      if (!savingRef.current) void flushSaveRef.current();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushLatestSave();
    };
    window.addEventListener("pagehide", flushLatestSave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushLatestSave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushLatestSave();
    };
  }, [workflowId]);

  return (
    <ReactFlowProvider>
      {!workflowId && <LocalCanvasPersistence />}
      <PendingTaskRecovery />
      <PendingSkillPlacement />
      <main className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <div className="flex min-h-0 flex-1 relative">
          <CreativeCanvas />
        </div>
        <BottomRunBar />
        <AgentWorkflowPanel workflowId={workflowId} />
      </main>
    </ReactFlowProvider>
  );
}
