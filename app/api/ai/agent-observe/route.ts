import { NextResponse } from "next/server";
import { compileCanvasEditPlanToPatch } from "@/server/agent/compileCanvasEditPlan";
import { observeAgentRun } from "@/server/agent/observeAgentRun";
import { probeAgentMediaOutputs } from "@/server/agent/probeAgentMedia";
import { summarizeCanvasForAgent } from "@/server/agent/summarizeCanvas";
import { normalizeAIError } from "@/server/ai/errors";
import { runAgentEditLLM, runAgentVerifierLLM } from "@/server/ai/302aiLLMProvider";
import { indexSuccessfulRepair } from "@/server/rag/sources/repairSource";
import { retrieveCapabilities } from "@/server/agent/capabilities/capabilityRetriever";
import type { AgentObserveRequest } from "@/shared/api/aiContracts";
import type { CanvasNode, WorkflowEdge } from "@/shared/canvas";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const stringArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
  : [];
const positiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};
const patchHasChanges = (patch: ReturnType<typeof compileCanvasEditPlanToPatch>) =>
  patch.createNodes.length > 0 || patch.updateNodes.length > 0 || patch.deleteNodeIds.length > 0 || patch.createEdges.length > 0 || patch.deleteEdgeIds.length > 0;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<AgentObserveRequest>;
    const userMessage = text(body.userMessage);
    if (!userMessage) return NextResponse.json({ ok: false, error: { message: "userMessage is required." } }, { status: 400 });

    const snapshot = body.canvasSnapshot;
    const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes as CanvasNode[] : [];
    const edges = Array.isArray(snapshot?.edges) ? snapshot.edges as WorkflowEdge[] : [];
    const executedNodeIds = stringArray(body.executedNodeIds);
    const attempt = positiveInteger(body.attempt, 0);
    const maxRepairAttempts = Math.max(0, Math.min(3, positiveInteger(body.maxRepairAttempts, 2)));
    const mediaProbes = await probeAgentMediaOutputs(nodes, executedNodeIds);
    const observation = observeAgentRun({ userMessage, nodes, edges, executedNodeIds, mediaProbes });

    if (attempt >= maxRepairAttempts && !observation.allSuccessful) {
      return NextResponse.json({
        ok: true,
        status: "blocked",
        summary: `Automatic repair stopped after ${attempt} attempt${attempt === 1 ? "" : "s"}. ${observation.issues[0] || observation.warnings[0] || "The result still needs review."}`,
        observation,
      });
    }

    const decision = observation.allSuccessful && !observation.warnings.length
      ? { status: "completed" as const, summary: "All executed nodes completed and passed structured verification." }
      : await runAgentVerifierLLM({ userMessage, observation, attempt, maxRepairAttempts });

    if (decision.status !== "repair") {
      if (decision.status === "completed" && attempt > 0) {
        try {
          await indexSuccessfulRepair({
            repairId: `agent-repair-${crypto.randomUUID()}`,
            provider: "mindverse-agent",
            tenantId: "shared",
            errorSummary: [...observation.issues, ...observation.warnings].join("; ") || `An earlier verification failed before repair attempt ${attempt}.`,
            repairSummary: decision.summary,
          });
        } catch (error) {
          console.warn("Agent repair completed, but RAG indexing failed.", error instanceof Error ? error.message : error);
        }
      }
      return NextResponse.json({ ok: true, status: decision.status, summary: decision.summary, observation });
    }

    const repairInstruction = decision.repairInstruction || [
      "Repair the failed autonomous run using the smallest safe canvas change.",
      ...observation.issues,
      ...observation.warnings,
    ].join("\n");
    const repairEvidenceBundle = await retrieveCapabilities({
      query: [repairInstruction, ...observation.issues, ...observation.warnings].join("\n"),
      domains: ["repair", "capability"],
      requiredCapabilities: [],
      filters: { tenantId: "shared", availability: ["available"] },
      limit: 6,
    });
    const repairEvidence = repairEvidenceBundle.evidence
      .filter((evidence) => evidence.metadata?.domain === "repair")
      .slice(0, 6)
      .map((evidence) => `[${evidence.id}] ${evidence.title}: ${evidence.excerpt}`)
      .join("\n\n");
    const canvasSummary = summarizeCanvasForAgent({ nodes, edges, selectedNodeIds: [] });
    const editPlan = await runAgentEditLLM({
      userInstruction: [
        `Original request: ${userMessage}`,
        `Automatic repair instruction: ${repairInstruction}`,
        "Update failed generated nodes in place when possible. Preserve source media. Do not create duplicate source assets.",
      ].join("\n\n"),
      canvasSummary,
      repairFeedback: [
        `Observed run issues:\n${[...observation.issues, ...observation.warnings].join("\n")}`,
        repairEvidence ? `Retrieved successful repair evidence:\n${repairEvidence}` : "",
      ].filter(Boolean).join("\n\n"),
    });
    const compiledRepairPatch = compileCanvasEditPlanToPatch({ editPlan, currentNodes: nodes, currentEdges: edges, selectedNodeIds: [] });
    const repairableIds = new Set(executedNodeIds);
    const repairPatch = {
      ...compiledRepairPatch,
      updateNodes: compiledRepairPatch.updateNodes.filter((node) => repairableIds.has(node.id)),
      deleteNodeIds: [],
    };

    return NextResponse.json({
      ok: true,
      status: "repair",
      summary: decision.summary,
      observation,
      repairInstruction,
      ...(patchHasChanges(repairPatch) ? { repairPatch } : {}),
    });
  } catch (error) {
    const normalized = normalizeAIError(error);
    return NextResponse.json({ ok: false, error: { message: normalized.message } }, { status: normalized.status >= 400 && normalized.status < 600 ? normalized.status : 500 });
  }
}
