import type { CanvasNode, WorkflowEdge } from "./nodeData";
import type { AgentProjectMemory } from "@/shared/agent/projectMemory";

export type CanvasSnapshot = { version: 1; projectName: string; nodes: CanvasNode[]; edges: WorkflowEdge[]; agentMemory?: AgentProjectMemory };
