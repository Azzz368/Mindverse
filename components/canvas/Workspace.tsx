"use client";
import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { BottomRunBar } from "./BottomRunBar";
import { CreativeCanvas } from "./CreativeCanvas";
import { NodeToolbar } from "./NodeToolbar";
import { TemplateGallery } from "./TemplateGallery";
import { TopBar } from "./TopBar";
import { useCanvasStore } from "@/store/canvasStore";

function PendingTaskRecovery() {
  const nodes = useCanvasStore((state) => state.nodes); const pollNode = useCanvasStore((state) => state.pollNode); const seen = useRef(new Set<string>());
  useEffect(() => { const active = new Set<string>(); nodes.forEach((node) => { const value = node.data.output?.value; const details = value && typeof value === "object" ? value as Record<string, unknown> : {}; const taskId = typeof details.taskId === "string" ? details.taskId : ""; if (taskId && (details.status === "pending" || details.status === "running")) { active.add(taskId); if (!seen.current.has(taskId)) { seen.current.add(taskId); void pollNode(node.id); } } }); seen.current.forEach((taskId) => { if (!active.has(taskId)) seen.current.delete(taskId); }); }, [nodes, pollNode]);
  return null;
}
export function Workspace() { return <ReactFlowProvider><PendingTaskRecovery/><main className="flex h-screen flex-col overflow-hidden"><TopBar/><TemplateGallery/><div className="flex min-h-0 flex-1"><NodeToolbar/><CreativeCanvas/></div><BottomRunBar/></main></ReactFlowProvider>; }
