import { makeNode } from "@/shared/templates/templates";
import type { AgentCanvasEditPlan, AgentEditOperation, CanvasEditPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, CanvasNodeData, NodeType, WorkflowEdge } from "@/shared/canvas";
import { videoTargetHandleForNodeType } from "@/shared/workflow/videoModelPresets";

const forbiddenPatchKeys = new Set([
  "b64_json",
  "base64",
  "taskId",
  "output",
  "outputs",
  "imageUrl",
  "videoUrl",
  "audioUrl",
  "resultUrl",
  "dataUrl",
  "rawStatus",
  "lastPollAt",
  "error",
]);

const safeNodeTypes: NodeType[] = ["prompt", "text", "script", "storyboard", "image", "video", "videoEdit", "audio", "reference", "output"];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const normalizeTokenstarMode = (value: string) => value === "kling-reference" || value === "kling-image-to-video" ? "kling-image" : value === "kling-text-to-video" ? "kling-text" : value;

const isNodeType = (value: unknown): value is NodeType => safeNodeTypes.includes(value as NodeType);
const edgeIdFor = (source: string, target: string) => `edge-${source}-${target}`;
const mediaUrlFrom = (node: CanvasNode, keys: string[]) => {
  const output = object(node.data.output?.value);
  return keys.map((key) => text(output[key]) || text(node.data[key as keyof CanvasNodeData])).find(Boolean) || "";
};

const sanitizeDataPatch = (value: unknown): Partial<CanvasNodeData> => {
  const raw = object(value);
  const clean: Record<string, unknown> = {};
  Object.entries(raw).forEach(([key, patchValue]) => {
    if (forbiddenPatchKeys.has(key)) return;
    if (key === "nodeType" || key === "status") return;
    if (key === "editPlan" && patchValue && typeof patchValue === "object") {
      clean[key] = JSON.stringify(patchValue, null, 2);
      return;
    }
    if (key === "tokenstarMode" && typeof patchValue === "string") {
      clean[key] = normalizeTokenstarMode(patchValue.trim());
      return;
    }
    if (typeof patchValue === "string" || typeof patchValue === "number" || typeof patchValue === "boolean" || patchValue === undefined) {
      clean[key] = patchValue;
    }
  });
  return clean as Partial<CanvasNodeData>;
};

const patchFromParams = (operation: AgentEditOperation): Partial<CanvasNodeData> => {
  const params = object(operation.params);
  const dataPatch: Record<string, unknown> = {};
  if (operation.label) dataPatch.title = operation.label;
  ["prompt", "editPlan", "negativePrompt", "style", "aspectRatio", "instruction", "inputText", "model", "size", "scriptTone", "format", "resolution", "fps", "voiceStyle", "voice", "emotion", "videoProvider", "tokenstarMode", "klingMode", "videoInputMode", "transition"].forEach((key) => {
    const value = params[key];
    if (typeof value === "string" && value.trim()) dataPatch[key] = value.trim();
    if (key === "editPlan" && value && typeof value === "object") dataPatch[key] = JSON.stringify(value, null, 2);
  });
  ["duration", "temperature", "numberOfScenes", "targetShotCount", "volume", "shotNumber", "originalVolume", "backgroundVolume", "fadeIn", "fadeOut"].forEach((key) => {
    const value = number(params[key]);
    if (value !== undefined) dataPatch[key] = value;
  });
  if (typeof params.generateAudio === "boolean") dataPatch.generateAudio = params.generateAudio;
  if (typeof params.preserveAudio === "boolean") dataPatch.preserveAudio = params.preserveAudio;
  return sanitizeDataPatch({ ...dataPatch, ...operation.dataPatch });
};

const centerY = (nodes: CanvasNode[]) => {
  if (!nodes.length) return 100;
  return Math.round(nodes.reduce((sum, node) => sum + node.position.y, 0) / nodes.length);
};

const placementBase = (operation: AgentEditOperation, nodes: CanvasNode[], nodeById: Map<string, CanvasNode>, createdByOperation: Map<string, CanvasNode[]>) => {
  const hintNodeId = operation.positionHint?.afterNodeId || operation.sourceNodeId || operation.targetNodeId || operation.dependsOn?.[0];
  const hinted = hintNodeId ? nodeById.get(hintNodeId) || createdByOperation.get(hintNodeId)?.[0] : undefined;
  if (hinted) return { x: hinted.position.x + 320, y: hinted.position.y };
  const maxX = nodes.reduce((max, node) => Math.max(max, node.position.x), 80);
  return { x: maxX + 320, y: centerY(nodes) };
};

const resolveNodeId = (id: string | undefined, nodeById: Map<string, CanvasNode>, createdByOperation: Map<string, CanvasNode[]>) => {
  if (!id) return undefined;
  if (nodeById.has(id)) return id;
  return createdByOperation.get(id)?.[0]?.id;
};

const resolveNodeIds = (ids: string[] | undefined, nodeById: Map<string, CanvasNode>, createdByOperation: Map<string, CanvasNode[]>) => {
  return (ids || []).map((id) => resolveNodeId(id, nodeById, createdByOperation)).filter((id): id is string => Boolean(id));
};

const makeEditableNode = (type: NodeType, position: { x: number; y: number }, dataPatch: Partial<CanvasNodeData>): CanvasNode => {
  const node = makeNode(type, position);
  const safePatch = Object.fromEntries(Object.entries(dataPatch).filter(([, value]) => value !== undefined)) as Partial<CanvasNodeData>;
  return {
    ...node,
    data: {
      ...node.data,
      ...safePatch,
      nodeType: type,
      status: "idle",
      output: undefined,
      taskId: undefined,
      resultUrl: undefined,
      rawStatus: undefined,
      lastPollAt: undefined,
      error: undefined,
    },
  };
};

const makeRevisionNode = (target: CanvasNode, dataPatch: Partial<CanvasNodeData>, operation: AgentEditOperation): CanvasNode => {
  const title = dataPatch.title || operation.label || `${target.data.title} revision`;
  const imageUrl = target.data.nodeType === "image" ? mediaUrlFrom(target, ["imageUrl", "revisedImageUrl"]) : "";
  return makeEditableNode(target.data.nodeType, { x: target.position.x + 340, y: target.position.y + 40 }, sanitizeDataPatch({
    ...target.data,
    ...dataPatch,
    title,
    referenceImageUrl: imageUrl || dataPatch.referenceImageUrl || target.data.referenceImageUrl,
  }));
};

const addEdgeIfNew = (edges: WorkflowEdge[], source: string, target: string, existingEdgeIds: Set<string>, warnings: string[], nodeById?: Map<string, CanvasNode>) => {
  if (source === target) {
    warnings.push(`Skipped self connection on ${source}.`);
    return;
  }
  const id = edgeIdFor(source, target);
  if (existingEdgeIds.has(id)) return;
  existingEdgeIds.add(id);
  const sourceNode = nodeById?.get(source);
  const targetNode = nodeById?.get(target);
  const targetHandle = sourceNode && targetNode?.data.nodeType === "video"
    ? videoTargetHandleForNodeType(sourceNode.data.nodeType, targetNode.data)
    : sourceNode && targetNode?.data.nodeType === "videoEdit" && (sourceNode.data.nodeType === "video" || sourceNode.data.nodeType === "videoEdit" || sourceNode.data.nodeType === "audio")
      ? sourceNode.data.nodeType === "audio" ? "audio" : "video"
      : undefined;
  edges.push({ id, source, target, ...(targetHandle ? { targetHandle } : {}) });
};

export function compileCanvasEditPlanToPatch({
  editPlan,
  currentNodes,
  currentEdges,
  selectedNodeIds,
}: {
  editPlan: AgentCanvasEditPlan;
  currentNodes: CanvasNode[];
  currentEdges: WorkflowEdge[];
  selectedNodeIds?: string[];
}): CanvasEditPatch {
  const nodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const edgeById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  const createdByOperation = new Map<string, CanvasNode[]>();
  const createNodes: CanvasNode[] = [];
  const updateNodes: CanvasEditPatch["updateNodes"] = [];
  const deleteNodeIds = new Set<string>();
  const createEdges: WorkflowEdge[] = [];
  const deleteEdgeIds = new Set<string>();
  const warnings = [...(editPlan.warnings || [])];
  const edgeIds = new Set(currentEdges.map((edge) => edge.id));
  const selected = new Set(selectedNodeIds || []);
  const operationPriority = (operation: AgentEditOperation) => {
    if (operation.type === "createNode" || operation.type === "createBranch" || operation.type === "duplicateNode") return 0;
    if (operation.type === "updateNodeData" || operation.type === "moveNode") return 1;
    return 2;
  };

  const registerCreated = (operationId: string, nodes: CanvasNode[]) => {
    createdByOperation.set(operationId, nodes);
    nodes.forEach((node) => {
      createNodes.push(node);
      nodeById.set(node.id, node);
    });
  };

  [...editPlan.operations].sort((a, b) => operationPriority(a) - operationPriority(b)).forEach((operation) => {
    if (operation.type === "noop") {
      if (operation.reason) warnings.push(operation.reason);
      return;
    }

    if (operation.type === "updateNodeData") {
      const target = resolveNodeId(operation.targetNodeId, nodeById, createdByOperation);
      if (!target || !nodeById.has(target)) {
        warnings.push(`Skipped updateNodeData: target node ${operation.targetNodeId || "(missing)"} was not found.`);
        return;
      }
      const dataPatch = patchFromParams(operation);
      const targetNode = nodeById.get(target);
      if (targetNode && selected.has(target)) {
        const revision = makeRevisionNode(targetNode, dataPatch, operation);
        registerCreated(operation.id, [revision]);
        addEdgeIfNew(createEdges, target, revision.id, edgeIds, warnings, nodeById);
        warnings.push(`Preserved selected node ${target}; created ${revision.id} as an editable revision instead.`);
        return;
      }
      updateNodes.push({ id: target, dataPatch });
      return;
    }

    if (operation.type === "moveNode") {
      const target = resolveNodeId(operation.targetNodeId, nodeById, createdByOperation);
      const x = number(operation.params?.x);
      const y = number(operation.params?.y);
      if (!target || x === undefined || y === undefined) {
        warnings.push(`Skipped moveNode: target or position is missing.`);
        return;
      }
      updateNodes.push({ id: target, position: { x, y } });
      return;
    }

    if (operation.type === "deleteNode") {
      const target = resolveNodeId(operation.targetNodeId, nodeById, createdByOperation);
      if (!target || !nodeById.has(target)) {
        warnings.push(`Skipped deleteNode: target node ${operation.targetNodeId || "(missing)"} was not found.`);
        return;
      }
      deleteNodeIds.add(target);
      currentEdges.forEach((edge) => {
        if (edge.source === target || edge.target === target) deleteEdgeIds.add(edge.id);
      });
      return;
    }

    if (operation.type === "disconnectNodes") {
      if (operation.targetEdgeId && edgeById.has(operation.targetEdgeId)) {
        deleteEdgeIds.add(operation.targetEdgeId);
        return;
      }
      const source = resolveNodeId(operation.sourceNodeId, nodeById, createdByOperation);
      const target = resolveNodeId(operation.targetNodeIdForConnection || operation.targetNodeId, nodeById, createdByOperation);
      currentEdges.forEach((edge) => {
        if ((!source || edge.source === source) && (!target || edge.target === target)) deleteEdgeIds.add(edge.id);
      });
      return;
    }

    if (operation.type === "connectNodes") {
      const source = resolveNodeId(operation.sourceNodeId, nodeById, createdByOperation);
      const targetRef = operation.targetNodeIdForConnection || operation.targetNodeId;
      const target = resolveNodeId(targetRef, nodeById, createdByOperation);
      if (!source || !target) {
        warnings.push(`Skipped connectNodes ${operation.id}: source ${operation.sourceNodeId || "(missing)"} ${source ? "resolved" : "not found"}, target ${targetRef || "(missing)"} ${target ? "resolved" : "not found"}. Use an existing node id or a prior createNode operation id.`);
        return;
      }
      addEdgeIfNew(createEdges, source, target, edgeIds, warnings, nodeById);
      return;
    }

    if (operation.type === "createNode") {
      if (!isNodeType(operation.nodeType)) {
        warnings.push(`Skipped createNode ${operation.id}: missing or unsupported nodeType ${text(operation.nodeType) || "(missing)"}. createNode requires nodeType such as videoEdit, video, audio, image, or output.`);
        return;
      }
      const base = placementBase(operation, [...currentNodes, ...createNodes], nodeById, createdByOperation);
      const position = {
        x: base.x + (operation.positionHint?.column || 0) * 320,
        y: base.y + (operation.positionHint?.row || 0) * 180,
      };
      const node = makeEditableNode(operation.nodeType, position, patchFromParams(operation));
      registerCreated(operation.id, [node]);
      resolveNodeIds(operation.dependsOn || (operation.sourceNodeId ? [operation.sourceNodeId] : undefined), nodeById, createdByOperation)
        .forEach((source) => addEdgeIfNew(createEdges, source, node.id, edgeIds, warnings, nodeById));
      return;
    }

    if (operation.type === "duplicateNode") {
      const targetId = resolveNodeId(operation.targetNodeId, nodeById, createdByOperation);
      const target = targetId ? nodeById.get(targetId) : undefined;
      if (!target) {
        warnings.push(`Skipped duplicateNode: target node ${operation.targetNodeId || "(missing)"} was not found.`);
        return;
      }
      const node = makeEditableNode(target.data.nodeType, { x: target.position.x + 40, y: target.position.y + 40 }, sanitizeDataPatch({ ...target.data, ...operation.dataPatch, title: operation.label || `${target.data.title} copy` }));
      registerCreated(operation.id, [node]);
      return;
    }

    if (operation.type === "createBranch") {
      if (!isNodeType(operation.nodeType)) {
        warnings.push(`Skipped createBranch: unsupported node type ${text(operation.nodeType)}.`);
        return;
      }
      const count = Math.max(1, Math.min(12, number(operation.params?.count) || 1));
      const base = placementBase(operation, [...currentNodes, ...createNodes], nodeById, createdByOperation);
      const nodes = Array.from({ length: count }, (_, index) => makeEditableNode(operation.nodeType as NodeType, {
        x: base.x,
        y: base.y + index * 180,
      }, {
        ...patchFromParams(operation),
        title: operation.label ? `${operation.label} ${index + 1}` : undefined,
        shotNumber: operation.nodeType === "image" ? index + 1 : undefined,
      }));
      registerCreated(operation.id, nodes);
      const sources = resolveNodeIds(operation.dependsOn || (operation.sourceNodeId ? [operation.sourceNodeId] : undefined), nodeById, createdByOperation);
      sources.forEach((source) => nodes.forEach((node) => addEdgeIfNew(createEdges, source, node.id, edgeIds, warnings, nodeById)));
      return;
    }

    if (operation.type === "replaceNodeType") {
      warnings.push("replaceNodeType was skipped to avoid destroying existing editable node data. Use createNode + reconnect + deleteNode if replacement is explicit.");
      return;
    }

    if (operation.type === "updateEdge") {
      warnings.push("updateEdge is not supported yet; existing edge behavior was preserved.");
    }
  });

  return {
    createNodes,
    updateNodes: updateNodes.filter((item) => Object.keys(item.dataPatch || {}).length || item.position),
    deleteNodeIds: [...deleteNodeIds],
    createEdges: createEdges.filter((edge) => !deleteNodeIds.has(edge.source) && !deleteNodeIds.has(edge.target)),
    deleteEdgeIds: [...deleteEdgeIds],
    selectedNodeIds: [...selected],
    warnings,
  };
}
