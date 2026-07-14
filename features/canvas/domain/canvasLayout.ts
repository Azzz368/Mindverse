import type { CanvasNode, NodeType, WorkflowEdge } from "@/shared/canvas";

export const workflowColumnByType: Record<NodeType, number> = { prompt: 0, text: 1, script: 1, storyboard: 2, storyboardImage: 3, image: 4, reference: 4, video: 5, audio: 5, videoEdit: 6, motion: 7, output: 8 };
export const selectedNodeIdsFrom = (state: { nodes: CanvasNode[]; selectedNodeId: string | null }) => [...new Set([...state.nodes.filter((node) => node.selected).map((node) => node.id), ...(state.selectedNodeId ? [state.selectedNodeId] : [])])];
export const connectedNodeIdsFrom = (seedIds: string[], nodes: CanvasNode[], edges: WorkflowEdge[]) => {
  const ids = new Set(nodes.map((node) => node.id));
  const visited = new Set(seedIds.filter((id) => ids.has(id)));
  const queue = [...visited];
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    edges.forEach((edge) => {
      const next = edge.source === id ? edge.target : edge.target === id ? edge.source : "";
      if (!next || visited.has(next) || !ids.has(next)) return;
      visited.add(next);
      queue.push(next);
    });
  }
  return [...visited];
};
export const connectedComponentsFor = (nodes: CanvasNode[], edges: WorkflowEdge[]) => {
  const remaining = new Set(nodes.map((node) => node.id));
  const components = new Map<string, number>();
  let index = 0;
  while (remaining.size) {
    const start = remaining.values().next().value as string;
    const componentIds = connectedNodeIdsFrom([start], nodes, edges);
    componentIds.forEach((id) => {
      remaining.delete(id);
      components.set(id, index);
    });
    index += 1;
  }
  return components;
};
export const compareWorkflowNode = (a: CanvasNode, b: CanvasNode) => {
  const columnDiff = (workflowColumnByType[a.data.nodeType] ?? 0) - (workflowColumnByType[b.data.nodeType] ?? 0);
  if (columnDiff) return columnDiff;
  const yDiff = a.position.y - b.position.y;
  if (Math.abs(yDiff) > 8) return yDiff;
  const xDiff = a.position.x - b.position.x;
  if (Math.abs(xDiff) > 8) return xDiff;
  return a.id.localeCompare(b.id);
};
export const orderWorkflowNodes = (nodes: CanvasNode[], edges: WorkflowEdge[]) => {
  const ids = new Set(nodes.map((node) => node.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return;
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  });
  const ordered: CanvasNode[] = [];
  const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).sort(compareWorkflowNode);
  while (queue.length) {
    const node = queue.shift();
    if (!node) break;
    ordered.push(node);
    (outgoing.get(node.id) || []).forEach((targetId) => {
      incoming.set(targetId, (incoming.get(targetId) || 0) - 1);
      if ((incoming.get(targetId) || 0) === 0) {
        const target = byId.get(targetId);
        if (target) queue.push(target);
      }
    });
    queue.sort(compareWorkflowNode);
  }
  const seen = new Set(ordered.map((node) => node.id));
  return [...ordered, ...nodes.filter((node) => !seen.has(node.id)).sort(compareWorkflowNode)];
};
export const arrangeWorkflowNodes = (nodes: CanvasNode[], edges: WorkflowEdge[]) => {
  const groups = new Map<string, CanvasNode[]>();
  const componentByNode = connectedComponentsFor(nodes, edges);
  const workflowByComponent = new Map<number, string>();
  nodes.forEach((node) => {
    const component = componentByNode.get(node.id);
    if (component === undefined || !node.data.workflowId) return;
    const existingId = workflowByComponent.get(component);
    if (!existingId || (node.data.workflowOrder ?? 999) < (nodes.find((item) => item.data.workflowId === existingId)?.data.workflowOrder ?? 999)) workflowByComponent.set(component, node.data.workflowId);
  });
  nodes.forEach((node) => {
    const component = componentByNode.get(node.id) ?? 999;
    const key = node.data.workflowId || workflowByComponent.get(component) || `workflow-unassigned-${component}`;
    groups.set(key, [...(groups.get(key) || []), node]);
  });
  const meta = (items: CanvasNode[]) => ({
    order: Math.min(...items.map((node) => node.data.workflowOrder ?? 999)),
    title: items.find((node) => node.data.workflowTitle)?.data.workflowTitle || "",
  });
  const entries = [...groups.entries()].sort(([, a], [, b]) => {
    const left = meta(a), right = meta(b);
    if (left.order !== right.order) return left.order - right.order;
    return left.title.localeCompare(right.title);
  });
  const positions = new Map<string, { x: number; y: number }>();
  let groupY = 120;
  entries.forEach(([, groupNodes]) => {
    const rowsByColumn = new Map<number, number>();
    orderWorkflowNodes(groupNodes, edges).forEach((node) => {
      const column = workflowColumnByType[node.data.nodeType] ?? 0;
      const row = rowsByColumn.get(column) || 0;
      positions.set(node.id, { x: 120 + column * 370, y: groupY + row * 320 });
      rowsByColumn.set(column, row + 1);
    });
    const maxRows = Math.max(1, ...rowsByColumn.values());
    groupY += Math.max(460, maxRows * 320 + 220);
  });
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) || node.position }));
};
