import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
export function topologicalSort(nodes: CanvasNode[], edges: WorkflowEdge[]) {
  const degree = new Map(nodes.map((node) => [node.id, 0])); edges.forEach((edge) => degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1));
  const queue = nodes.filter((node) => degree.get(node.id) === 0), sorted: CanvasNode[] = [];
  while (queue.length) { const node = queue.shift()!; sorted.push(node); edges.filter((edge) => edge.source === node.id).forEach((edge) => { const next = (degree.get(edge.target) ?? 1) - 1; degree.set(edge.target, next); if (next === 0) { const target = nodes.find((candidate) => candidate.id === edge.target); if (target) queue.push(target); } }); }
  if (sorted.length !== nodes.length) throw new Error("Workflow contains a cycle. Remove a connection and try again.");
  return sorted;
}
