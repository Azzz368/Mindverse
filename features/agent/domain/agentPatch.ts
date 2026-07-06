import type { CanvasEditPatch, CanvasPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";

export const cleanAgentNode = (node: CanvasNode): CanvasNode => ({ ...node, selected: false, data: { ...node.data, status: "idle", output: undefined, error: undefined, taskId: undefined, resultUrl: undefined, rawStatus: undefined, lastPollAt: undefined } });
export const dedupePatch = (patch: CanvasPatch, existingNodes: CanvasNode[], existingEdges: WorkflowEdge[]): CanvasPatch => {
  const ids = new Set(existingNodes.map((node) => node.id)), edgeIds = new Set(existingEdges.map((edge) => edge.id)), remap = new Map<string, string>();
  const nodes = patch.nodes.map((node) => {
    const nextId = ids.has(node.id) ? `${node.id}-${crypto.randomUUID()}` : node.id;
    ids.add(nextId); remap.set(node.id, nextId);
    return cleanAgentNode({ ...node, id: nextId });
  });
  const edges = patch.edges.map((edge) => {
    const source = remap.get(edge.source) || edge.source, target = remap.get(edge.target) || edge.target;
    let id = `edge-${source}-${target}`;
    if (edgeIds.has(id)) id = `${id}-${crypto.randomUUID()}`;
    edgeIds.add(id);
    return { ...edge, id, source, target, animated: edge.animated ?? true };
  }).filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  return { nodes, edges };
};
export const offsetPatchTo = (patch: CanvasPatch, position: { x: number; y: number }): CanvasPatch => {
  const anchor = patch.nodes[0]?.position || { x: 0, y: 0 };
  const dx = position.x - anchor.x, dy = position.y - anchor.y;
  return {
    nodes: patch.nodes.map((node) => ({ ...node, position: { x: node.position.x + dx, y: node.position.y + dy } })),
    edges: patch.edges,
  };
};
export const applyEditPatchToState = (state: { nodes: CanvasNode[]; edges: WorkflowEdge[]; selectedNodeId: string | null }, patch: CanvasEditPatch) => {
  const deletedNodes = new Set(patch.deleteNodeIds);
  const deletedEdges = new Set(patch.deleteEdgeIds);
  const updates = new Map(patch.updateNodes.map((item) => [item.id, item]));
  const baseNodes = state.nodes
    .filter((node) => !deletedNodes.has(node.id))
    .map((node) => {
      const update = updates.get(node.id);
      if (!update) return node;
      return {
        ...node,
        position: update.position || node.position,
        type: update.type || node.type,
        data: update.dataPatch ? { ...node.data, ...update.dataPatch } : node.data,
      };
    });
  const baseEdges = state.edges.filter((edge) => !deletedEdges.has(edge.id) && !deletedNodes.has(edge.source) && !deletedNodes.has(edge.target));
  const clean = dedupePatch({ nodes: patch.createNodes, edges: patch.createEdges }, baseNodes, baseEdges);
  return {
    nodes: [...baseNodes, ...clean.nodes],
    edges: [...baseEdges, ...clean.edges],
    selectedNodeId: clean.nodes[0]?.id || (state.selectedNodeId && !deletedNodes.has(state.selectedNodeId) ? state.selectedNodeId : null),
    agentStatus: "completed" as const,
    agentMessage: patch.warnings?.length ? `已应用修改，但有 ${patch.warnings.length} 条提示。节点仍需手动运行。` : "已应用修改，节点仍需手动运行。",
    lastError: null,
  };
};
