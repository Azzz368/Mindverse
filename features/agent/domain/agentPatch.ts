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

const edgeIdFor = (source: string, target: string) => `edge-${source}-${target}`;

export const applyEditPatchToState = (state: { nodes: CanvasNode[]; edges: WorkflowEdge[]; selectedNodeId: string | null }, patch: CanvasEditPatch) => {
  const deletedNodes = new Set(patch.deleteNodeIds);
  const deletedEdges = new Set(patch.deleteEdgeIds);
  const updates = new Map(patch.updateNodes.map((item) => [item.id, item]));
  const selectedIds = new Set(
    patch.selectedNodeIds?.length
      ? patch.selectedNodeIds
      : state.nodes.filter((node) => node.selected || node.id === state.selectedNodeId).map((node) => node.id),
  );
  const selectedSourceNodes = state.nodes.filter((node) =>
    selectedIds.has(node.id) &&
    (node.data.nodeType === "video" || node.data.nodeType === "videoEdit" || node.data.nodeType === "motion" || node.data.nodeType === "audio" || node.data.nodeType === "voiceTTS") &&
    !deletedNodes.has(node.id),
  );
  const baseNodes = state.nodes
    .filter((node) => !deletedNodes.has(node.id))
    .map((node) => {
      const update = updates.get(node.id);
      if (!update) return { ...node, selected: false };
      const resetsExecution = Boolean(update.dataPatch && Object.keys(update.dataPatch).length);
      return {
        ...node,
        selected: false,
        position: update.position || node.position,
        type: update.type || node.type,
        data: update.dataPatch ? {
          ...node.data,
          ...update.dataPatch,
          ...(resetsExecution ? {
            status: "idle" as const,
            output: undefined,
            error: undefined,
            taskId: undefined,
            resultUrl: undefined,
            rawStatus: undefined,
            lastPollAt: undefined,
          } : {}),
        } : node.data,
      };
    });
  const baseEdges = state.edges.filter((edge) => !deletedEdges.has(edge.id) && !deletedNodes.has(edge.source) && !deletedNodes.has(edge.target));
  const nodeIds = new Set(baseNodes.map((node) => node.id));
  const edgeIds = new Set(baseEdges.map((edge) => edge.id));
  const remap = new Map<string, string>();
  const createNodes = patch.createNodes.map((node) => {
    const nextId = nodeIds.has(node.id) ? `${node.id}-${crypto.randomUUID()}` : node.id;
    nodeIds.add(nextId);
    remap.set(node.id, nextId);
    return cleanAgentNode({ ...node, id: nextId });
  });
  const createEdges = patch.createEdges
    .map((edge) => {
      const source = remap.get(edge.source) || edge.source;
      const target = remap.get(edge.target) || edge.target;
      let id = `edge-${source}-${target}`;
      if (edgeIds.has(id)) id = `${id}-${crypto.randomUUID()}`;
      edgeIds.add(id);
      return { ...edge, id, source, target, animated: edge.animated ?? true };
    })
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const createdVideoEditNodes = createNodes.filter((node) => node.data.nodeType === "videoEdit");
  createdVideoEditNodes.forEach((videoEditNode) => {
    selectedSourceNodes.forEach((sourceNode) => {
      const source = sourceNode.id;
      const target = videoEditNode.id;
      const alreadyExists = [...baseEdges, ...createEdges].some((edge) => edge.source === source && edge.target === target);
      if (alreadyExists) return;
      let id = edgeIdFor(source, target);
      if (edgeIds.has(id)) id = `${id}-${crypto.randomUUID()}`;
      edgeIds.add(id);
      createEdges.push({
        id,
        source,
        target,
        targetHandle: sourceNode.data.nodeType === "audio" || sourceNode.data.nodeType === "voiceTTS" ? "audio" : "video",
        animated: true,
      });
    });
  });
  const selectedNodeId = createNodes[0]?.id || null;
  return {
    nodes: [
      ...baseNodes,
      ...createNodes.map((node, index) => ({ ...node, selected: index === 0 })),
    ],
    edges: [...baseEdges, ...createEdges],
    selectedNodeId,
    agentStatus: "completed" as const,
    agentMessage: patch.warnings?.length ? `已应用修改，但有 ${patch.warnings.length} 条提示。节点仍需手动运行。` : "已应用修改，节点仍需手动运行。",
    lastError: null,
  };
};
