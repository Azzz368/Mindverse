import type { AgentCanvasOrganizePlan, CanvasEditPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, NodeType, WorkflowEdge } from "@/shared/canvas";

const workflowColumnByType: Record<NodeType, number> = { prompt: 0, text: 1, script: 1, storyboard: 2, storyboardImage: 3, image: 4, reference: 4, video: 5, audio: 5, output: 6 };

const connectedNodeIdsFrom = (seedIds: string[], nodes: CanvasNode[], edges: WorkflowEdge[]) => {
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

const connectedComponentsFor = (nodes: CanvasNode[], edges: WorkflowEdge[]) => {
  const remaining = new Set(nodes.map((node) => node.id));
  const components: string[][] = [];
  while (remaining.size) {
    const start = remaining.values().next().value as string;
    const componentIds = connectedNodeIdsFrom([start], nodes, edges);
    componentIds.forEach((id) => remaining.delete(id));
    components.push(componentIds);
  }
  return components;
};

const compareWorkflowNode = (a: CanvasNode, b: CanvasNode) => {
  const columnDiff = (workflowColumnByType[a.data.nodeType] ?? 0) - (workflowColumnByType[b.data.nodeType] ?? 0);
  if (columnDiff) return columnDiff;
  const yDiff = a.position.y - b.position.y;
  if (Math.abs(yDiff) > 8) return yDiff;
  const xDiff = a.position.x - b.position.x;
  if (Math.abs(xDiff) > 8) return xDiff;
  return a.id.localeCompare(b.id);
};

const orderWorkflowNodes = (nodes: CanvasNode[], edges: WorkflowEdge[]) => {
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

export function compileCanvasOrganizePlanToPatch({
  organizePlan,
  currentNodes,
  currentEdges,
}: {
  organizePlan: AgentCanvasOrganizePlan;
  currentNodes: CanvasNode[];
  currentEdges: WorkflowEdge[];
}): CanvasEditPatch {
  const nodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const warnings = [...(organizePlan.warnings || [])];
  const claimed = new Set<string>();
  const plannedGroups = organizePlan.workflows
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((workflow) => {
      const nodeIds = workflow.nodeIds.filter((id) => {
        if (!nodeById.has(id)) {
          warnings.push(`Skipped missing node ${id} in ${workflow.title}.`);
          return false;
        }
        if (claimed.has(id)) {
          warnings.push(`Skipped duplicate node ${id} in ${workflow.title}.`);
          return false;
        }
        claimed.add(id);
        return true;
      });
      return { workflow, nodes: nodeIds.map((id) => nodeById.get(id)).filter((node): node is CanvasNode => Boolean(node)) };
    })
    .filter((group) => group.nodes.length);

  const remainingGroups = connectedComponentsFor(currentNodes.filter((node) => !claimed.has(node.id)), currentEdges)
    .map((ids) => ids.map((id) => nodeById.get(id)).filter((node): node is CanvasNode => Boolean(node)))
    .filter((nodes) => nodes.length);

  const updateNodes: CanvasEditPatch["updateNodes"] = [];
  let groupY = 120;
  [...plannedGroups, ...remainingGroups.map((nodes) => ({ workflow: undefined, nodes }))].forEach((group) => {
    const rowsByColumn = new Map<number, number>();
    orderWorkflowNodes(group.nodes, currentEdges).forEach((node) => {
      const column = workflowColumnByType[node.data.nodeType] ?? 0;
      const row = rowsByColumn.get(column) || 0;
      const dataPatch = group.workflow ? {
        workflowId: group.workflow.id,
        workflowOrder: group.workflow.order,
        workflowTitle: group.workflow.title,
        workflowLabel: group.workflow.label,
        groupColor: undefined,
      } : undefined;
      updateNodes.push({
        id: node.id,
        dataPatch,
        position: { x: 120 + column * 370, y: groupY + row * 320 },
      });
      rowsByColumn.set(column, row + 1);
    });
    const maxRows = Math.max(1, ...rowsByColumn.values());
    groupY += Math.max(460, maxRows * 320 + 220);
  });

  return { createNodes: [], updateNodes, deleteNodeIds: [], createEdges: [], deleteEdgeIds: [], warnings };
}
