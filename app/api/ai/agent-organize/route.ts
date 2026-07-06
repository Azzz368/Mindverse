import { NextResponse } from "next/server";
import { compileCanvasOrganizePlanToPatch } from "@/server/agent/compileCanvasOrganizePlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentOrganizeLLM } from "@/server/ai/302aiLLMProvider";
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

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      userInstruction?: unknown;
      canvasSnapshot?: unknown;
      selectedNodeIds?: unknown;
    };
    const userInstruction = text(body.userInstruction) || "自动识别当前画布内容和工作流，并整理画布。";
    const { nodes, edges } = snapshotFrom(body.canvasSnapshot);
    if (!nodes.length) return NextResponse.json({ ok: false, error: { message: "Canvas must include at least one node before organizing." } }, { status: 400 });
    const selectedNodeIds = stringArray(body.selectedNodeIds);
    const canvasSummary = summarizeCanvasForAgent({ nodes, edges, selectedNodeIds });
    const organizePlan = await runAgentOrganizeLLM({ userInstruction, canvasSummary });
    const patch = compileCanvasOrganizePlanToPatch({ organizePlan, currentNodes: nodes, currentEdges: edges });
    return NextResponse.json({
      ok: true,
      organizePlan,
      patch,
      summary: `${organizePlan.title}: ${organizePlan.workflows.length} workflows identified, ${patch.updateNodes.length} nodes to arrange.`,
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
