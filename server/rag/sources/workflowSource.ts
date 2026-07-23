import "server-only";

import type { CanvasSnapshot } from "@/shared/canvas";
import { ingestRagDocument } from "@/server/rag/documentIngestion";

const workflowContent = (snapshot: CanvasSnapshot, instruction?: string) => {
  const nodes = snapshot.nodes.map((node) => ({
    id: node.id,
    type: node.data.nodeType,
    title: node.data.title,
    status: node.data.status,
    model: node.data.model,
    provider: node.data.videoProvider || node.data.voiceProvider,
    aspectRatio: node.data.aspectRatio,
    duration: node.data.duration,
  }));
  return [
    `# ${snapshot.projectName || "Successful Mindverse workflow"}`,
    instruction ? `User instruction: ${instruction}` : "",
    "## Nodes",
    JSON.stringify(nodes, null, 2),
    "## Edges",
    JSON.stringify(snapshot.edges.map((edge) => ({ source: edge.source, target: edge.target, targetHandle: edge.targetHandle })), null, 2),
  ].filter(Boolean).join("\n\n");
};

export const indexSuccessfulWorkflow = (input: {
  workflowId: string;
  snapshot: CanvasSnapshot;
  instruction?: string;
  tenantId?: string;
  projectId?: string;
}) => ingestRagDocument({
  domain: "workflow",
  sourceType: "successful_workflow",
  sourceId: input.workflowId,
  tenantId: input.tenantId,
  projectId: input.projectId || input.workflowId,
  title: input.snapshot.projectName || "Successful workflow",
  visibility: input.tenantId ? "tenant" : "private",
  content: workflowContent(input.snapshot, input.instruction),
  metadata: { nodeCount: input.snapshot.nodes.length, edgeCount: input.snapshot.edges.length, successful: true },
});
