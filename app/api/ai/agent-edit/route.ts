import { NextResponse } from "next/server";
import { capabilityPlanToEditPlan, compileCapabilityPlanToEditPatch } from "@/server/agent/compileCapabilityPlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentPlannerLLM, runAgentRouterLLM } from "@/server/ai/302aiLLMProvider";
import { retrieveCapabilities } from "@/server/agent/capabilities/capabilityRetriever";
import { approvalRequiredStepIds, bindPlanCapabilities, bindRoutedCanvasInputs, capabilityPlanGraphIssues, capabilityPlanIssues } from "@/server/agent/capabilities/capabilityValidator";
import type { CapabilityRetrievalRequest } from "@/shared/agent/capabilityTypes";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];

const snapshotFrom = (value: unknown): { nodes: CanvasNode[]; edges: WorkflowEdge[] } => {
  if (!value || typeof value !== "object") return { nodes: [], edges: [] };
  const raw = value as { nodes?: unknown; edges?: unknown };
  return {
    nodes: Array.isArray(raw.nodes) ? raw.nodes as CanvasNode[] : [],
    edges: Array.isArray(raw.edges) ? raw.edges as WorkflowEdge[] : [],
  };
};

const numberConstraint = (constraints: Record<string, unknown>, key: string) => {
  const value = Number(constraints[key]);
  return Number.isFinite(value) ? value : undefined;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userInstruction?: unknown; canvasSnapshot?: unknown; selectedNodeIds?: unknown };
    const userInstruction = text(body.userInstruction);
    if (!userInstruction) return NextResponse.json({ ok: false, error: { message: "userInstruction is required." } }, { status: 400 });
    const { nodes, edges } = snapshotFrom(body.canvasSnapshot);
    if (!nodes.length) return NextResponse.json({ ok: false, error: { message: "Canvas must include at least one node before editing." } }, { status: 400 });

    const canvasIds = new Set(nodes.map((node) => node.id));
    const selectedNodeIds = stringArray(body.selectedNodeIds).filter((id) => canvasIds.has(id));
    const canvasSummary = summarizeCanvasForAgent({ nodes, edges, selectedNodeIds });
    const routed = await runAgentRouterLLM({ userMessage: userInstruction, canvasSummary, conversation: [], selectedNodeIds });
    const routedTargets = routed.targetNodeIds.filter((id) => canvasIds.has(id));
    const targetNodeIds = routedTargets.length ? routedTargets : selectedNodeIds;
    if (!targetNodeIds.length) throw new Error("The edit request must select or identify at least one existing canvas node.");
    const semanticRoute = { ...routed, route: "plan" as const, operation: "transform_media" as const, objective: userInstruction, targetNodeIds };
    const targets = nodes.filter((node) => targetNodeIds.includes(node.id));
    const filters: CapabilityRetrievalRequest["filters"] = {
      inputImages: numberConstraint(semanticRoute.constraints, "inputImages") ?? targets.filter((node) => ["image", "reference"].includes(node.data.nodeType)).length,
      inputVideos: numberConstraint(semanticRoute.constraints, "inputVideos") ?? targets.filter((node) => ["video", "videoEdit", "motion"].includes(node.data.nodeType)).length,
      inputAudios: numberConstraint(semanticRoute.constraints, "inputAudios") ?? targets.filter((node) => ["audio", "voiceTTS"].includes(node.data.nodeType)).length,
      duration: numberConstraint(semanticRoute.constraints, "duration"),
      aspectRatio: typeof semanticRoute.constraints.aspectRatio === "string" ? semanticRoute.constraints.aspectRatio : undefined,
      resolution: typeof semanticRoute.constraints.resolution === "string" ? semanticRoute.constraints.resolution : undefined,
      tenantId: "shared",
      availability: ["available"],
    };
    const evidenceBundle = await retrieveCapabilities({
      query: semanticRoute.objective,
      domains: ["capability", "workflow", "repair"],
      requiredCapabilities: semanticRoute.requiredCapabilities,
      filters,
      limit: 10,
    });
    if (!evidenceBundle.capabilities.length) throw new Error("No configured capability satisfies the edit requirements and constraints.");

    const planInputIssues = (plan: Awaited<ReturnType<typeof runAgentPlannerLLM>>) => {
      const referenced = plan.steps.flatMap((step) => (step.inputs || [])
        .filter((input) => input.source === "canvas_node" && input.nodeId)
        .map((input) => input.nodeId!));
      const invalid = referenced.filter((id) => !canvasIds.has(id));
      const missingTargets = targetNodeIds.filter((id) => !referenced.includes(id));
      return [
        ...invalid.map((id) => `The capability plan references unknown canvas node ${id}.`),
        ...(missingTargets.length ? [`The capability plan does not consume routed target nodes: ${missingTargets.join(", ")}.`] : []),
      ];
    };

    const normalizeCapabilityPlan = (candidatePlan: Awaited<ReturnType<typeof runAgentPlannerLLM>>) => {
      const providerBound = bindPlanCapabilities(candidatePlan, evidenceBundle);
      const inputBound = bindRoutedCanvasInputs(providerBound, evidenceBundle, nodes, targetNodeIds, semanticRoute.requiredCapabilities);
      return bindPlanCapabilities(inputBound, evidenceBundle);
    };
    let plan = normalizeCapabilityPlan(await runAgentPlannerLLM({ userPrompt: userInstruction, canvasSummary, semanticRoute, evidenceBundle }));
    let issues = [...capabilityPlanGraphIssues(plan, evidenceBundle), ...capabilityPlanIssues(plan, evidenceBundle), ...planInputIssues(plan)];
    if (issues.length) {
      plan = normalizeCapabilityPlan(await runAgentPlannerLLM({
        userPrompt: userInstruction,
        canvasSummary,
        semanticRoute,
        evidenceBundle,
        previousPlan: plan,
        repairFeedback: issues.join("\n"),
      }));
      issues = [...capabilityPlanGraphIssues(plan, evidenceBundle), ...capabilityPlanIssues(plan, evidenceBundle), ...planInputIssues(plan)];
    }
    if (issues.length) throw new Error(`Agent planner returned an invalid capability edit plan: ${issues.join(" ")}`);

    const patch = compileCapabilityPlanToEditPatch({ plan, currentNodes: nodes, currentEdges: edges, selectedNodeIds: targetNodeIds });
    const editPlan = capabilityPlanToEditPlan(plan, targetNodeIds);
    return NextResponse.json({
      ok: true,
      semanticRoute,
      evidenceBundle,
      approvalRequiredStepIds: approvalRequiredStepIds(plan, evidenceBundle),
      editPlan,
      patch,
      summary: `${plan.title}: ${patch.createNodes.length} evidence-backed nodes and ${patch.createEdges.length} typed connections prepared.`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
