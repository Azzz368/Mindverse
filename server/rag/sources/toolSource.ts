import "server-only";

import type { CapabilityRecord } from "@/shared/agent/capabilityTypes";
import { capabilityCatalogDocument } from "@/server/agent/capabilities/capabilityCatalog";
import { ingestRagDocument } from "@/server/rag/documentIngestion";

export const indexToolDocument = (record: CapabilityRecord) => ingestRagDocument({
  domain: "capability",
  sourceType: "tool",
  sourceId: record.id,
  title: record.name,
  visibility: "public",
  content: capabilityCatalogDocument(record),
  metadata: { capabilityId: record.id, kind: record.kind, capabilities: record.capabilities, constraints: record.constraints || {} },
});
