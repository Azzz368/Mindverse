"use client";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { BottomRunBar } from "./BottomRunBar";
import { AgentWorkflowPanel } from "@/features/agent/components/AgentWorkflowPanel";
import { CreativeCanvas } from "./CreativeCanvas";
import { TopBar } from "./TopBar";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { canvasStorage } from "@/features/canvas/services/canvasStorage";
import { ACCESS_KEY, getWorkflowSnapshot, saveWorkflowSnapshot } from "@/features/workspace/services/workflowClient";
import type { CanvasSnapshot } from "@/shared/canvas";
import type { StoredSkill } from "@/shared/skills/skillTypes";
import { cloneSkillCanvasTemplate } from "@/shared/skills/skillTemplate";
import { PENDING_SKILL_KEY } from "@/features/skills/services/skillClient";
import { hasInlineMedia, snapshotForWorkflowPersistence, snapshotJsonSize } from "@/shared/canvas/snapshotTransport";

const MAX_REMOTE_WORKFLOW_BYTES = 3 * 1024 * 1024;
const MAX_LOCAL_DRAFT_BYTES = 3 * 1024 * 1024;
const workflowDraftKey = (workflowId: string) => `mindverse-workflow-draft:${workflowId}`;

type WorkflowDraft = { savedAt: number; snapshot: CanvasSnapshot };

const isCanvasSnapshot = (value: unknown): value is CanvasSnapshot => Boolean(
  value
  && typeof value === "object"
  && Array.isArray((value as CanvasSnapshot).nodes)
  && Array.isArray((value as CanvasSnapshot).edges),
);

const loadWorkflowDraft = (workflowId: string): WorkflowDraft | null => {
  try {
    const raw = window.localStorage.getItem(workflowDraftKey(workflowId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<WorkflowDraft>;
    return typeof value.savedAt === "number" && isCanvasSnapshot(value.snapshot) ? { savedAt: value.savedAt, snapshot: value.snapshot } : null;
  } catch {
    return null;
  }
};

const saveWorkflowDraft = (workflowId: string, snapshot: CanvasSnapshot) => {
  try {
    if (hasInlineMedia(snapshot) || snapshotJsonSize(snapshot) > MAX_LOCAL_DRAFT_BYTES) return false;
    window.localStorage.setItem(workflowDraftKey(workflowId), JSON.stringify({ savedAt: Date.now(), snapshot } satisfies WorkflowDraft));
    return true;
  } catch (error) {
    console.warn("Local workflow draft save failed", error);
    return false;
  }
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
        useCanvasStore.setState({ lastError: "本地画布包含未归档媒体或超过 3MB，无法自动保存。请重新上传该媒体或拆分画布。" });
        return;
      }
      canvasStorage.save(snapshot);
    } catch (error) {
      console.error("Local canvas save failed", error);
      useCanvasStore.setState({ lastError: "本地画布保存失败；请检查浏览器存储空间。" });
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
      useCanvasStore.setState({ lastError: "本地画布无法加载，已创建空白画布。" });
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
      useCanvasStore.setState({ lastError: "已保存画布结构；其中未归档的内嵌媒体无法长期保存，请重新上传该素材。" });
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

export function Workspace({ workflowId }: { workflowId?: string }) {
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
  const pendingSaveRef = useRef<{ accessCode: string; name: string; snapshot: CanvasSnapshot } | null>(null);
  const latestSaveRef = useRef<{ accessCode: string; name: string; snapshot: CanvasSnapshot } | null>(null);
  const flushSaveRef = useRef<() => Promise<void>>(async () => undefined);
  const lastSavedJsonRef = useRef("");

  useEffect(() => {
    if (!workflowId || typeof window === "undefined") return;
    const accessCode = window.localStorage.getItem(ACCESS_KEY) || "";
    if (!accessCode) {
      window.location.href = "/workspace";
      return;
    }
    loadedRemoteWorkflow.current = false;
    latestSaveRef.current = null;
    pendingSaveRef.current = null;
    lastSavedJsonRef.current = "";
    void (async () => {
      try {
        const payload = await getWorkflowSnapshot(workflowId, accessCode);
        if (!payload.output) throw new Error("Workflow not found.");
        const remoteSnapshot: CanvasSnapshot = {
          version: 1,
          projectName: payload.output.projectName || payload.output.name || "Untitled workflow",
          nodes: Array.isArray(payload.output.nodes) ? payload.output.nodes as never : [],
          edges: Array.isArray(payload.output.edges) ? payload.output.edges as never : [],
          agentMemory: payload.output.agentMemory,
        };
        const draft = loadWorkflowDraft(workflowId);
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
        lastSavedJsonRef.current = shouldRecoverDraft ? "" : JSON.stringify({ accessCode, name: loaded.projectName, snapshot });
        loadedRemoteWorkflow.current = true;
      } catch (error) {
        const draft = loadWorkflowDraft(workflowId);
        if (draft) {
          setProjectName(draft.snapshot.projectName || "Untitled workflow");
          setCanvas(draft.snapshot.nodes, draft.snapshot.edges, draft.snapshot.agentMemory || null);
          lastSavedJsonRef.current = "";
          loadedRemoteWorkflow.current = true;
          useCanvasStore.setState({ lastError: "远程工作流暂时无法加载，已恢复此浏览器中的本地草稿；联网后会自动重试保存。" });
          return;
        }
        console.error("Remote workflow load failed", error);
        window.location.href = "/workspace";
      }
    })();
  }, [setCanvas, setProjectName, workflowId]);

  useEffect(() => {
    normalizeVideoConnections();
  }, [edges, nodes, normalizeVideoConnections]);

  useEffect(() => {
    nodes.filter((node) => node.data.nodeType === "storyboard" && Array.isArray(node.data.output?.value)).forEach((node) => materializeStoryboardBranch(node.id));
  }, [nodes, materializeStoryboardBranch]);

  useEffect(() => {
    if (!workflowId || !loadedRemoteWorkflow.current || typeof window === "undefined") return;
    const accessCode = window.localStorage.getItem(ACCESS_KEY) || "";
    if (!accessCode) return;

    const flushSave = async () => {
      if (!workflowId || savingRef.current) return;
      const next = pendingSaveRef.current;
      if (!next) return;
      pendingSaveRef.current = null;
      savingRef.current = true;
      try {
        await saveWorkflowSnapshot(workflowId, next);
        lastSavedJsonRef.current = JSON.stringify(next);
      } catch (error) {
        pendingSaveRef.current = pendingSaveRef.current || next;
        console.error("Remote workflow save failed", error);
        useCanvasStore.setState({ lastError: "远程工作流保存失败；当前修改已保存在此浏览器草稿中，请检查网络和 Bunny Storage 配置。" });
      } finally {
        savingRef.current = false;
        // Do not retry a failed request in a tight loop. The next edit, page
        // hide, or explicit navigation will retry the queued latest snapshot.
        if (!pendingSaveRef.current) return;
        if (lastSavedJsonRef.current === JSON.stringify(next)) void flushSave();
      }
    };
    flushSaveRef.current = flushSave;

    const rawSnapshot: CanvasSnapshot = { version: 1, projectName, nodes, edges, agentMemory: agentMemory || undefined };
    const hadInlineMedia = hasInlineMedia(rawSnapshot);
    const snapshot = snapshotForWorkflowPersistence(rawSnapshot);
    if (hadInlineMedia) {
      useCanvasStore.setState({ lastError: "已保存画布结构；其中未归档的内嵌媒体无法长期保存，请重新上传该素材。" });
    }
    if (snapshotJsonSize(snapshot) > MAX_REMOTE_WORKFLOW_BYTES) {
      latestSaveRef.current = null;
      useCanvasStore.setState({ lastError: `画布快照超过 ${MAX_REMOTE_WORKFLOW_BYTES / 1024 / 1024}MB，无法保存。请拆分工作流或移除过大的节点内容。` });
      return;
    }
    const payload = { accessCode, name: projectName, snapshot };
    const payloadJson = JSON.stringify(payload);
    latestSaveRef.current = payload;
    if (payloadJson === lastSavedJsonRef.current) return;
    if (!saveWorkflowDraft(workflowId, snapshot)) {
      useCanvasStore.setState({ lastError: "本地草稿保存失败；请避免使用内嵌 base64 媒体并检查浏览器存储空间。" });
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
  }, [agentMemory, edges, nodes, projectName, workflowId]);

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
