import "server-only";

import type { CapabilityRecord } from "@/shared/agent/capabilityTypes";
import { capabilityCatalogDocument } from "@/server/agent/capabilities/capabilityCatalog";
import { ingestRagDocument } from "@/server/rag/documentIngestion";

export const indexModelDocument = (record: CapabilityRecord) => ingestRagDocument({
  domain: "capability",
  sourceType: record.kind,
  sourceId: record.id,
  title: record.name,
  visibility: "public",
  content: capabilityCatalogDocument(record),
  metadata: {
    capabilityId: record.id,
    kind: record.kind,
    capabilities: record.capabilities,
    constraints: record.constraints || {},
    executorRef: record.executorRef,
  },
});
