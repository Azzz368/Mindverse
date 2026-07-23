import "server-only";

import { ingestRagDocument } from "@/server/rag/documentIngestion";

export const indexSuccessfulRepair = (input: {
  repairId: string;
  provider: string;
  errorCode?: string;
  errorSummary: string;
  repairSummary: string;
  capabilityId?: string;
  tenantId?: string;
}) => ingestRagDocument({
  domain: "repair",
  sourceType: "successful_repair",
  sourceId: input.repairId,
  tenantId: input.tenantId,
  title: `${input.provider} ${input.errorCode || "repair"}`,
  visibility: input.tenantId ? "tenant" : "private",
  content: [
    `# ${input.provider} repair`,
    `Error code: ${input.errorCode || "unknown"}`,
    `Error: ${input.errorSummary}`,
    `Successful repair: ${input.repairSummary}`,
    input.capabilityId ? `Capability: ${input.capabilityId}` : "",
  ].filter(Boolean).join("\n\n"),
  metadata: { provider: input.provider, errorCode: input.errorCode, capabilityId: input.capabilityId, successful: true },
});
