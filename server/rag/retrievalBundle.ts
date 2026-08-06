import "server-only";

import type { CapabilityEvidenceBundle } from "@/shared/agent/capabilityTypes";

export const evidenceBundleForPlanner = (bundle: CapabilityEvidenceBundle) => ({
  query: {
    objective: bundle.query.query,
    requiredCapabilities: bundle.query.requiredCapabilities,
    filters: bundle.query.filters,
  },
  capabilities: bundle.capabilities.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    name: candidate.name,
    supports: candidate.supports,
    accepts: candidate.accepts,
    produces: candidate.produces,
    constraints: candidate.constraints || {},
    executorRef: candidate.executorRef,
    evidenceIds: candidate.evidenceIds,
    risk: candidate.risk,
    requiresApproval: candidate.requiresApproval,
    reason: candidate.reason,
  })),
  evidence: bundle.evidence.map((evidence) => ({
    id: evidence.id,
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    title: evidence.title,
    excerpt: evidence.excerpt.slice(0, 1_000),
  })),
});

export const evidenceBundlePrompt = (bundle: CapabilityEvidenceBundle) =>
  JSON.stringify(evidenceBundleForPlanner(bundle), null, 2);
