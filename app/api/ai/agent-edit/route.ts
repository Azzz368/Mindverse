import { NextResponse } from "next/server";
import { compileCanvasEditPlanToPatch } from "@/server/agent/compileCanvasEditPlan";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentEditLLM } from "@/server/ai/302aiLLMProvider";
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

const patchHasChanges = (patch: ReturnType<typeof compileCanvasEditPlanToPatch>) =>
  patch.createNodes.length > 0 ||
  patch.updateNodes.length > 0 ||
  patch.deleteNodeIds.length > 0 ||
  patch.createEdges.length > 0 ||
  patch.deleteEdgeIds.length > 0;

const patchNeedsRepair = (patch: ReturnType<typeof compileCanvasEditPlanToPatch>, selectedNodeIds: string[]) => {
  if (!patchHasChanges(patch) || (patch.warnings || []).length > 0) return true;
  const createdVideoEditIds = new Set(patch.createNodes.filter((node) => node.data.nodeType === "videoEdit").map((node) => node.id));
  if (!createdVideoEditIds.size || !selectedNodeIds.length) return false;
  return !patch.createEdges.some((edge) => createdVideoEditIds.has(edge.target));
};

const editSummary = (title: string, patch: ReturnType<typeof compileCanvasEditPlanToPatch>) =>
  `${title}: ${patch.createNodes.length} nodes to create, ${patch.updateNodes.length} nodes to update, ${patch.deleteNodeIds.length} nodes to delete, ${patch.createEdges.length} connections to create, ${patch.deleteEdgeIds.length} connections to delete.`;

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      userInstruction?: unknown;
      canvasSnapshot?: unknown;
      selectedNodeIds?: unknown;
    };
    const userInstruction = text(body.userInstruction);
    if (!userInstruction) return NextResponse.json({ ok: false, error: { message: "userInstruction is required." } }, { status: 400 });
    const { nodes, edges } = snapshotFrom(body.canvasSnapshot);
    if (!nodes.length) return NextResponse.json({ ok: false, error: { message: "Canvas must include at least one node before editing." } }, { status: 400 });
    const selectedNodeIds = stringArray(body.selectedNodeIds);
    const canvasSummary = summarizeCanvasForAgent({ nodes, edges, selectedNodeIds });
    let editPlan = await runAgentEditLLM({ userInstruction, canvasSummary });
    let patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: nodes, currentEdges: edges, selectedNodeIds });
    if (patchNeedsRepair(patch, selectedNodeIds)) {
      editPlan = await runAgentEditLLM({
        userInstruction,
        canvasSummary,
        repairFeedback: [
          "The previous edit plan compiled to an empty or incomplete canvas patch, so the user would see no usable graph change.",
          "Re-read the selected nodes and the user instruction.",
          "Return executable graph operations with exact node ids: create/update nodes and connect/disconnect edges as needed.",
          "If the user asks to edit selected media, make the graph runnable by creating or updating the appropriate node and connecting selected source nodes.",
          "If you create a videoEdit node from selected videos/audio, it must have incoming edges from those selected source nodes.",
          "Schema reminder: createNode requires nodeType. Later operations must reference new nodes by the createNode operation id, not placeholder node ids.",
          `Compiler warnings: ${JSON.stringify(patch.warnings || [])}`,
          `Previous operations: ${JSON.stringify(editPlan.operations)}`,
        ].join("\n"),
      });
      patch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: nodes, currentEdges: edges, selectedNodeIds });
    }
    return NextResponse.json({
      ok: true,
      editPlan,
      patch,
      summary: editSummary(editPlan.title, patch),
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
