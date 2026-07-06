import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
export function detectCycle(nodes: CanvasNode[], edges: WorkflowEdge[]) {
  const visiting = new Set<string>(), visited = new Set<string>();
  const walk = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const edge of edges.filter((item) => item.source === id)) if (walk(edge.target)) return true; visiting.delete(id); visited.add(id); return false; };
  return nodes.some((node) => walk(node.id));
}
