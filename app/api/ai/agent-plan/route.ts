import { NextResponse } from "next/server";
import { validateAgentPlan } from "@/lib/agent/agentSchema";
import { compileWorkflowPlanToCanvas } from "@/lib/agent/compileWorkflowPlan";
import { normalizeAIError } from "@/lib/ai/errors";
import { runAgentPlannerLLM } from "@/lib/ai/302aiLLMProvider";

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
    const plan = validateAgentPlan(await runAgentPlannerLLM({ userPrompt, canvasSummary: summarizeCanvas(body.canvasSnapshot) }));
    const patch = compileWorkflowPlanToCanvas(plan);
    return NextResponse.json({
      ok: true,
      plan,
      patch,
      summary: `${plan.title}: ${plan.steps.length} editable steps prepared.`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
