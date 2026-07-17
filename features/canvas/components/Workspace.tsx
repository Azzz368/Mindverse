"use client";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { BottomRunBar } from "./BottomRunBar";
import { AgentWorkflowPanel } from "@/features/agent/components/AgentWorkflowPanel";
import { CreativeCanvas } from "./CreativeCanvas";
import { TemplateGallery } from "./TemplateGallery";
import { TopBar } from "./TopBar";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { ACCESS_KEY, getWorkflowSnapshot, saveWorkflowSnapshot } from "@/features/workspace/services/workflowClient";
import type { CanvasSnapshot } from "@/shared/canvas";
import type { StoredSkill } from "@/shared/skills/skillTypes";
import { cloneSkillCanvasTemplate } from "@/shared/skills/skillTemplate";
import { PENDING_SKILL_KEY } from "@/features/skills/services/skillClient";

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
  const lastSavedJsonRef = useRef("");

  useEffect(() => {
    if (!workflowId || typeof window === "undefined") return;
    const accessCode = window.localStorage.getItem(ACCESS_KEY) || "";
    if (!accessCode) {
      window.location.href = "/workspace";
      return;
    }
    loadedRemoteWorkflow.current = false;
    void (async () => {
      try {
        const payload = await getWorkflowSnapshot(workflowId, accessCode);
        if (!payload.output) throw new Error("Workflow not found.");
        setProjectName(payload.output.projectName || payload.output.name || "Untitled workflow");
        setCanvas(Array.isArray(payload.output.nodes) ? payload.output.nodes as never : [], Array.isArray(payload.output.edges) ? payload.output.edges as never : [], payload.output.agentMemory || null);
        loadedRemoteWorkflow.current = true;
      } catch {
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
      } finally {
        savingRef.current = false;
        if (pendingSaveRef.current) void flushSave();
      }
    };

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const snapshot: CanvasSnapshot = { version: 1, projectName, nodes, edges, agentMemory: agentMemory || undefined };
      const payload = { accessCode, name: projectName, snapshot };
      const payloadJson = JSON.stringify(payload);
      if (payloadJson === lastSavedJsonRef.current) return;
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

  return (
    <ReactFlowProvider>
      <PendingTaskRecovery />
      <PendingSkillPlacement />
      <main className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <TemplateGallery />
        <div className="flex min-h-0 flex-1 relative">
          <CreativeCanvas />
        </div>
        <BottomRunBar />
        <AgentWorkflowPanel />
      </main>
    </ReactFlowProvider>
  );
}
