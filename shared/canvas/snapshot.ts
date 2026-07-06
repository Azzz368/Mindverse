import type { CanvasNode, WorkflowEdge } from "./nodeData";

export type CanvasSnapshot = { version: 1; projectName: string; nodes: CanvasNode[]; edges: WorkflowEdge[] };
