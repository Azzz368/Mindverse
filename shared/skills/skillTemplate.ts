import type { CanvasPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, CanvasSnapshot, WorkflowEdge } from "@/shared/canvas";

const remapIds = (ids: string[] | undefined, nodeIds: Map<string, string>) =>
  ids?.map((id) => nodeIds.get(id)).filter((id): id is string => Boolean(id));

export function cloneSkillCanvasTemplate(snapshot: CanvasSnapshot): CanvasPatch {
  const nodeIds = new Map(snapshot.nodes.map((node) => [node.id, `${node.data.nodeType}-${crypto.randomUUID()}`]));
  const groupIds = new Map<string, string>();
  const workflowIds = new Map<string, string>();

  const nodes: CanvasNode[] = snapshot.nodes.map((node) => {
    const groupId = node.data.groupId;
    const workflowId = node.data.workflowId;
    if (groupId && !groupIds.has(groupId)) groupIds.set(groupId, `group-${crypto.randomUUID()}`);
    if (workflowId && !workflowIds.has(workflowId)) workflowIds.set(workflowId, `workflow-${crypto.randomUUID()}`);
    return {
      ...node,
      id: nodeIds.get(node.id) || `${node.data.nodeType}-${crypto.randomUUID()}`,
      selected: false,
      data: {
        ...node.data,
        status: "idle",
        output: undefined,
        error: undefined,
        taskId: undefined,
        resultUrl: undefined,
        rawStatus: undefined,
        lastPollAt: undefined,
        groupId: groupId ? groupIds.get(groupId) : undefined,
        workflowId: workflowId ? workflowIds.get(workflowId) : undefined,
        imageReferenceNodeIds: remapIds(node.data.imageReferenceNodeIds, nodeIds),
        videoReferenceNodeIds: remapIds(node.data.videoReferenceNodeIds, nodeIds),
        sourceStoryboardNodeId: node.data.sourceStoryboardNodeId ? nodeIds.get(node.data.sourceStoryboardNodeId) : undefined,
        revisionOf: node.data.revisionOf ? nodeIds.get(node.data.revisionOf) : undefined,
      },
    };
  });

  const edges: WorkflowEdge[] = snapshot.edges.flatMap((edge) => {
    const source = nodeIds.get(edge.source);
    const target = nodeIds.get(edge.target);
    if (!source || !target) return [];
    return [{ ...edge, id: `edge-${crypto.randomUUID()}`, source, target }];
  });

  return { nodes, edges };
}
