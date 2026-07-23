import { NextResponse } from "next/server";
import { validateAgentPlan } from "@/shared/agent/agentSchema";
import { compileWorkflowPlanToCanvas } from "@/server/agent/compileWorkflowPlan";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentPlannerLLM, runAgentRouterLLM } from "@/server/ai/302aiLLMProvider";
import { retrieveCapabilities } from "@/server/agent/capabilities/capabilityRetriever";
import { approvalRequiredStepIds, bindPlanCapabilities, capabilityPlanGraphIssues, capabilityPlanIssues } from "@/server/agent/capabilities/capabilityValidator";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function summarizeCanvas(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as { nodes?: unknown; edges?: unknown };
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];
  return `Current canvas has ${nodes.length} nodes and ${edges.length} edges.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { userPrompt?: unknown; canvasSnapshot?: unknown; mode?: unknown };
    const userPrompt = text(body.userPrompt);
    if (!userPrompt) return NextResponse.json({ ok: false, error: { message: "userPrompt is required." } }, { status: 400 });
    const canvasSummary = summarizeCanvas(body.canvasSnapshot);
    const routed = await runAgentRouterLLM({ userMessage: userPrompt, canvasSummary: canvasSummary || "Canvas: empty", conversation: [], selectedNodeIds: [] });
    const semanticRoute = { ...routed, route: "plan" as const, operation: "create_workflow" as const, targetNodeIds: [] };
    const evidenceBundle = await retrieveCapabilities({
      query: semanticRoute.objective,
      domains: ["capability", "workflow", "repair"],
      requiredCapabilities: semanticRoute.requiredCapabilities,
      filters: {
        duration: Number.isFinite(Number(semanticRoute.constraints.duration)) ? Number(semanticRoute.constraints.duration) : undefined,
        aspectRatio: typeof semanticRoute.constraints.aspectRatio === "string" ? semanticRoute.constraints.aspectRatio : undefined,
        tenantId: "shared",
        availability: ["available"],
      },
      limit: 10,
    });
    let plan = bindPlanCapabilities(validateAgentPlan(await runAgentPlannerLLM({ userPrompt, canvasSummary, semanticRoute, evidenceBundle })), evidenceBundle);
    let qualityIssues = [...capabilityPlanGraphIssues(plan, evidenceBundle), ...capabilityPlanIssues(plan, evidenceBundle)];
    if (qualityIssues.length) {
      plan = bindPlanCapabilities(validateAgentPlan(await runAgentPlannerLLM({
        userPrompt,
        canvasSummary,
        semanticRoute,
        evidenceBundle,
        previousPlan: plan,
        repairFeedback: qualityIssues.join("\n"),
      })), evidenceBundle);
      qualityIssues = [...capabilityPlanGraphIssues(plan, evidenceBundle), ...capabilityPlanIssues(plan, evidenceBundle)];
    }
    if (qualityIssues.length) throw new Error(`Agent planner returned an incomplete workflow template: ${qualityIssues.join(" ")}`);
    const patch = compileWorkflowPlanToCanvas(plan);
    return NextResponse.json({
      ok: true,
      plan,
      patch,
      semanticRoute,
      evidenceBundle,
      approvalRequiredStepIds: approvalRequiredStepIds(plan, evidenceBundle),
      summary: `${plan.title}: ${plan.steps.length} editable steps prepared.`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
