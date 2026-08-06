import "server-only";

import { ingestRagDocument } from "@/server/rag/documentIngestion";

export const indexProjectMemory = (input: {
  projectId: string;
  tenantId?: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  version?: number;
}) => ingestRagDocument({
  domain: "project",
  sourceType: "project_memory",
  sourceId: input.projectId,
  projectId: input.projectId,
  tenantId: input.tenantId,
  title: input.title,
  visibility: input.tenantId ? "tenant" : "project",
  content: input.content,
  metadata: input.metadata,
  version: input.version,
});
