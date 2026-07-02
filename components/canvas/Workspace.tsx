"use client";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { BottomRunBar } from "./BottomRunBar";
import { AgentWorkflowPanel } from "./AgentWorkflowPanel";
import { CreativeCanvas } from "./CreativeCanvas";
import { TemplateGallery } from "./TemplateGallery";
import { TopBar } from "./TopBar";
import { useCanvasStore } from "@/store/canvasStore";

function PendingTaskRecovery() {
  const nodes = useCanvasStore((state) => state.nodes); const pollNode = useCanvasStore((state) => state.pollNode); const seen = useRef(new Set<string>());
  useEffect(() => { const active = new Set<string>(); nodes.forEach((node) => { const value = node.data.output?.value; const details = value && typeof value === "object" ? value as Record<string, unknown> : {}; const taskId = typeof details.taskId === "string" ? details.taskId : ""; if (taskId && (details.status === "pending" || details.status === "running")) { active.add(taskId); if (!seen.current.has(taskId)) { seen.current.add(taskId); void pollNode(node.id); } } }); seen.current.forEach((taskId) => { if (!active.has(taskId)) seen.current.delete(taskId); }); }, [nodes, pollNode]);
  return null;
}
export function Workspace({ workflowId }: { workflowId?: string }) {
  const projectName = useCanvasStore((state) => state.projectName);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const setProjectName = useCanvasStore((state) => state.setProjectName);
  const setCanvas = useCanvasStore((state) => state.setCanvas);
  const loadedRemoteWorkflow = useRef(!workflowId);

  useEffect(() => {
    if (!workflowId || typeof window === "undefined") return;
    const accessCode = window.localStorage.getItem("mindverse-access-code") || "";
    if (!accessCode) {
      window.location.href = "/workspace";
      return;
    }
    loadedRemoteWorkflow.current = false;
    void (async () => {
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}?accessCode=${encodeURIComponent(accessCode)}`, { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean; output?: { projectName?: string; name?: string; nodes?: unknown[]; edges?: unknown[] } };
      if (!response.ok || !payload.ok || !payload.output) {
        window.location.href = "/workspace";
        return;
      }
      setProjectName(payload.output.projectName || payload.output.name || "Untitled workflow");
      setCanvas(Array.isArray(payload.output.nodes) ? payload.output.nodes as never : [], Array.isArray(payload.output.edges) ? payload.output.edges as never : []);
      loadedRemoteWorkflow.current = true;
    })();
  }, [setCanvas, setProjectName, workflowId]);

  useEffect(() => {
    if (!workflowId || !loadedRemoteWorkflow.current || typeof window === "undefined") return;
    const accessCode = window.localStorage.getItem("mindverse-access-code") || "";
    if (!accessCode) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode, name: projectName, snapshot: { version: 1, projectName, nodes, edges } }),
      }).catch((error) => console.error("Remote workflow save failed", error));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [edges, nodes, projectName, workflowId]);

  return (
    <ReactFlowProvider>
      <PendingTaskRecovery />
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
