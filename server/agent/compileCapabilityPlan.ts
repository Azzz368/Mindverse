import "server-only";

import { compileWorkflowPlanToCanvas } from "@/server/agent/compileWorkflowPlan";
import type { AgentCanvasEditPlan, AgentWorkflowPlan, CanvasEditPatch } from "@/shared/agent/agentSchema";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";
import { targetHandleForNodeConnection } from "@/shared/workflow/connectionHandles";

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-");

export function compileCapabilityPlanToEditPatch(input: {
  plan: AgentWorkflowPlan;
  currentNodes: CanvasNode[];
  currentEdges: WorkflowEdge[];
  selectedNodeIds: string[];
}): CanvasEditPatch {
  const compiled = compileWorkflowPlanToCanvas(input.plan);
  const selectedNodes = input.currentNodes.filter((node) => input.selectedNodeIds.includes(node.id));
  const currentRight = Math.max(0, ...input.currentNodes.map((node) => node.position.x + (node.measured?.width || node.width || 260)));
  const selectedRight = Math.max(0, ...selectedNodes.map((node) => node.position.x + (node.measured?.width || node.width || 260)));
  const anchorX = Math.max(currentRight, selectedRight) + 120;
  const minCompiledX = Math.min(0, ...compiled.nodes.map((node) => node.position.x));
  const anchorY = selectedNodes[0]?.position.y || 80;
  const minCompiledY = Math.min(0, ...compiled.nodes.map((node) => node.position.y));
  const createNodes = compiled.nodes.map((node) => ({
    ...node,
    position: { x: node.position.x - minCompiledX + anchorX, y: node.position.y - minCompiledY + anchorY },
  }));
  const targetByStepId = new Map(input.plan.steps.map((step, index) => [step.id, createNodes[index]]));
  const currentById = new Map(input.currentNodes.map((node) => [node.id, node]));
  const externalEdges: WorkflowEdge[] = [];
  input.plan.steps.forEach((step) => {
    const target = targetByStepId.get(step.id);
    if (!target) return;
    (step.inputs || []).filter((planInput) => planInput.source === "canvas_node" && planInput.nodeId).forEach((planInput) => {
      const source = currentById.get(planInput.nodeId!);
      if (!source) return;
      const targetHandle = targetHandleForNodeConnection(source.data.nodeType, target.data);
      externalEdges.push({
        id: `edge-${safeId(source.id)}-${safeId(target.id)}-${safeId(planInput.role)}`,
        source: source.id,
        target: target.id,
        ...(targetHandle ? { targetHandle } : {}),
      });
    });
  });
  const edgeMap = new Map([...compiled.edges, ...externalEdges].map((edge) => [`${edge.source}:${edge.target}:${edge.targetHandle || ""}`, edge]));
  return {
    createNodes,
    updateNodes: [],
    deleteNodeIds: [],
    createEdges: [...edgeMap.values()],
    deleteEdgeIds: [],
    selectedNodeIds: createNodes.length ? [createNodes[0].id] : input.selectedNodeIds,
    warnings: [],
  };
}

export function capabilityPlanToEditPlan(plan: AgentWorkflowPlan, targetNodeIds: string[]): AgentCanvasEditPlan {
  return {
    title: plan.title,
    description: plan.description,
    userInstruction: plan.userPrompt,
    intent: "expand_workflow",
    targetNodeIds,
    operations: plan.steps.map((step) => ({
      id: step.id,
      type: "createNode",
      capability: step.capability,
      providerCapabilityId: step.providerCapabilityId,
      evidenceIds: step.evidenceIds,
      inputs: step.inputs,
      nodeType: step.kind,
      label: step.label,
      reason: step.purpose,
      dependsOn: step.dependsOn,
      params: step.params,
    })),
    warnings: plan.warnings,
    requiresConfirmation: true,
  };
}
