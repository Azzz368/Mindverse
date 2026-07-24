import "server-only";

import type {
  CapabilityCandidate,
  CapabilityEvidence,
  CapabilityEvidenceBundle,
  CapabilityRecord,
  CapabilityRetrievalRequest,
} from "@/shared/agent/capabilityTypes";
import type { ActiveSkillContext } from "@/shared/skills/skillTypes";
import { listCapabilityCatalog } from "@/server/agent/capabilities/capabilityCatalog";
import { postgresConfigured } from "@/server/db/postgres";
import { hybridRetrieve } from "@/server/rag/hybridRetriever";
import { indexModelDocument } from "@/server/rag/sources/modelSource";
import { indexToolDocument } from "@/server/rag/sources/toolSource";
import { backfillSkillRagDocuments } from "@/server/storage/skillStorage";
import { DEFAULT_VIDEO_MODEL_PRESET_ID } from "@/shared/workflow/videoModelPresets";

let staticSync: Promise<void> | undefined;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9_\-\u3400-\u9fff]+/g, " ").trim();
const terms = (value: string) => new Set(normalize(value).split(/\s+/).filter(Boolean));
const planningCapabilityIds = ["runtime:prompt-authoring", "model:text:configured", "runtime:canvas-output"];
const textToVideoRequestPattern = /text[\s_-]*to[\s_-]*video|文生视频|文本生成视频/i;
const hyperframesRequestPattern = /codex[\s+&_-]*hyperframes|hyperframes|动态包装|动效包装/i;
const videoRequestPattern = /(?:^|[\s_-])video(?:$|[\s_-])|视频|短片|影片|影像|动画|分镜/i;

const supportsConstraints = (record: CapabilityRecord, request: CapabilityRetrievalRequest) => {
  if (record.availability !== "available") return false;
  const constraints = record.constraints || {};
  const { inputImages = 0, inputVideos = 0, inputAudios = 0, duration, aspectRatio, resolution } = request.filters;
  if (typeof constraints.maxImages === "number" && inputImages > constraints.maxImages) return false;
  if (typeof constraints.maxVideos === "number" && inputVideos > constraints.maxVideos) return false;
  if (typeof constraints.maxAudios === "number" && inputAudios > constraints.maxAudios) return false;
  if (typeof duration === "number") {
    if (typeof constraints.minDuration === "number" && duration < constraints.minDuration) return false;
    if (typeof constraints.maxDuration === "number" && duration > constraints.maxDuration) return false;
    if (constraints.allowedDurations?.length && !constraints.allowedDurations.includes(duration)) return false;
  }
  if (aspectRatio && constraints.aspectRatios?.length && !constraints.aspectRatios.includes(aspectRatio)) return false;
  if (resolution && constraints.resolutions?.length && !constraints.resolutions.includes(resolution)) return false;
  return true;
};

const catalogScore = (record: CapabilityRecord, request: CapabilityRetrievalRequest) => {
  const required = new Set(request.requiredCapabilities);
  const matchedCapabilities = record.capabilities.filter((capability) => required.has(capability)).length;
  const queryTerms = terms([request.query, ...request.requiredCapabilities].join(" "));
  const recordTerms = terms([record.name, record.description, ...record.capabilities, ...(record.aliases || [])].join(" "));
  const lexicalMatches = [...queryTerms].filter((term) => recordTerms.has(term)).length;
  const capabilityScore = required.size ? matchedCapabilities / required.size : 0;
  const lexicalScore = queryTerms.size ? lexicalMatches / queryTerms.size : 0;
  const compositionBonus = matchedCapabilities ? 0.2 : 0;
  return capabilityScore * 0.55 + lexicalScore * 0.25 + compositionBonus + (record.kind === "skill" ? 0.02 : 0);
};

async function syncStaticKnowledge(records: CapabilityRecord[]) {
  if (!postgresConfigured()) return;
  if (!staticSync) {
    staticSync = (async () => {
      let cursor = 0;
      const indexable = records.filter((record) => !(record.kind === "skill" && typeof record.metadata?.skillMd === "string"));
      await Promise.all(Array.from({ length: Math.min(4, indexable.length) }, async () => {
        while (cursor < indexable.length) {
          const record = indexable[cursor++];
          if (record.kind === "tool") await indexToolDocument(record);
          else await indexModelDocument(record);
        }
      }));
      try {
        await backfillSkillRagDocuments("666666");
      } catch (error) {
        console.warn("Stored Skill RAG backfill failed; continuing with the indexed capability catalog.", error instanceof Error ? error.message : error);
      }
    })().catch((error) => {
      staticSync = undefined;
      throw error;
    });
  }
  await staticSync;
}

const catalogEvidence = (record: CapabilityRecord, score: number): CapabilityEvidence => ({
  id: `catalog:${record.id}`,
  sourceType: record.kind,
  sourceId: record.id,
  title: record.name,
  excerpt: [
    record.description,
    `Capabilities: ${record.capabilities.join(", ")}`,
    `Constraints: ${JSON.stringify(record.constraints || {})}`,
    typeof record.metadata?.skillMd === "string" ? `Skill instructions:\n${record.metadata.skillMd}` : "",
  ].filter(Boolean).join("\n"),
  score,
  metadata: { capabilityId: record.id, capabilities: record.capabilities, constraints: record.constraints || {} },
});

const candidateFrom = (record: CapabilityRecord, score: number, evidenceIds: string[], required: string[]): CapabilityCandidate => {
  const matched = record.capabilities.filter((capability) => required.includes(capability));
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    score,
    reason: matched.length
      ? `Matches required capabilities: ${matched.join(", ")}.`
      : `Semantically relevant executable ${record.kind} capability.`,
    supports: record.capabilities,
    accepts: record.accepts,
    produces: record.produces,
    constraints: record.constraints,
    availability: record.availability,
    risk: record.risk,
    requiresApproval: record.requiresApproval,
    executorRef: record.executorRef,
    evidenceIds,
  };
};

const syntheticSkillCandidate = (evidence: CapabilityEvidence): CapabilityCandidate | undefined => {
  if (evidence.sourceType !== "skill") return undefined;
  const metadata = evidence.metadata || {};
  const capabilities = Array.isArray(metadata.capabilities) ? metadata.capabilities.filter((item): item is string => typeof item === "string") : ["create_workflow"];
  const id = typeof metadata.capabilityId === "string" ? metadata.capabilityId : `skill:${evidence.sourceId}`;
  return {
    id,
    kind: "skill",
    name: evidence.title,
    score: evidence.score,
    reason: "Retrieved from the indexed user Skill library.",
    supports: capabilities,
    accepts: ["story_brief", "reference_image"],
    produces: ["workflow_plan"],
    availability: "available",
    risk: "write",
    requiresApproval: false,
    executorRef: id,
    evidenceIds: [evidence.id],
  };
};

export async function retrieveCapabilities(
  request: CapabilityRetrievalRequest,
  options: { customSkill?: ActiveSkillContext } = {},
): Promise<CapabilityEvidenceBundle> {
  const catalog = listCapabilityCatalog(options.customSkill);
  let retrievedEvidence: CapabilityEvidence[] = [];
  let retrievalMode: CapabilityEvidenceBundle["retrievalMode"] = "catalog";
  if (postgresConfigured()) {
    try {
      await syncStaticKnowledge(catalog);
      retrievedEvidence = await hybridRetrieve(request, 30);
      retrievalMode = "postgres-hybrid";
    } catch (error) {
      console.warn("Postgres RAG retrieval failed; using the deterministic capability catalog.", error instanceof Error ? error.message : error);
    }
  }

  const evidenceBySource = new Map<string, CapabilityEvidence[]>();
  retrievedEvidence.forEach((evidence) => evidenceBySource.set(evidence.sourceId, [...(evidenceBySource.get(evidence.sourceId) || []), evidence]));
  const ranked = catalog
    .filter((record) => supportsConstraints(record, request))
    .map((record) => {
      const sourceEvidence = evidenceBySource.get(record.id) || [];
      const semanticScore = sourceEvidence[0]?.score || 0;
      const score = catalogScore(record, request) * 0.7 + semanticScore * 0.3;
      const fallbackEvidence = catalogEvidence(record, score);
      return {
        record,
        score,
        evidence: sourceEvidence.length ? sourceEvidence : [fallbackEvidence],
      };
    })
    .sort((a, b) => b.score - a.score);
  const scored = ranked.filter((item) => item.score > 0 || request.requiredCapabilities.some((capability) => item.record.capabilities.includes(capability)));

  const selectionLimit = Math.max(6, Math.min(12, request.limit || 10));
  const fallbackFamilies = ["prompt", "source_text", "image", "video", "audio", "canvas_output"];
  const fallback = fallbackFamilies
    .map((role) => ranked.find((item) => item.record.produces.includes(role as CapabilityRecord["produces"][number])))
    .filter((item): item is typeof ranked[number] => Boolean(item));
  ranked.filter((item) => item.record.kind === "runtime").forEach((item) => {
    if (fallback.length < selectionLimit && !fallback.includes(item)) fallback.push(item);
  });
  const selected = (scored.length ? scored : fallback).slice(0, selectionLimit);
  request.requiredCapabilities.forEach((capability) => {
    const match = ranked.find((item) => item.record.capabilities.includes(capability));
    if (match && !selected.includes(match)) selected.push(match);
  });
  const requiredPlanningCapabilityIds = videoRequestPattern.test(request.query)
    || request.requiredCapabilities.some((capability) => /video|motion/.test(capability))
    ? [
      ...planningCapabilityIds,
      `model:video:${DEFAULT_VIDEO_MODEL_PRESET_ID}`,
      ...(textToVideoRequestPattern.test(request.query) || request.requiredCapabilities.includes("text_to_video")
        ? ["model:video:seedance-2.0"]
        : []),
      ...(hyperframesRequestPattern.test(request.query) || request.requiredCapabilities.includes("motion_graphics")
        ? ["runtime:hyperframes-motion"]
        : []),
    ]
    : planningCapabilityIds;
  requiredPlanningCapabilityIds.forEach((id) => {
    const coreRuntime = ranked.find((item) => item.record.id === id);
    if (coreRuntime && !selected.includes(coreRuntime)) selected.push(coreRuntime);
  });
  const candidates = selected.map((item) => candidateFrom(item.record, item.score, item.evidence.map((evidence) => evidence.id), request.requiredCapabilities));

  retrievedEvidence.map(syntheticSkillCandidate).filter((item): item is CapabilityCandidate => Boolean(item)).forEach((candidate) => {
    if (!candidates.some((item) => item.id === candidate.id)) candidates.push(candidate);
  });

  const selectedEvidence = new Map<string, CapabilityEvidence>();
  selected.forEach((item) => item.evidence.forEach((evidence) => selectedEvidence.set(evidence.id, evidence)));
  retrievedEvidence.forEach((evidence) => {
    if (candidates.some((candidate) => candidate.evidenceIds.includes(evidence.id))) selectedEvidence.set(evidence.id, evidence);
  });
  retrievedEvidence
    .filter((evidence) => evidence.metadata?.domain !== "capability")
    .slice(0, 8)
    .forEach((evidence) => selectedEvidence.set(evidence.id, evidence));

  return {
    query: request,
    capabilities: candidates,
    skills: candidates.filter((candidate) => candidate.kind === "skill"),
    tools: candidates.filter((candidate) => candidate.kind === "tool"),
    models: candidates.filter((candidate) => candidate.kind === "model"),
    evidence: [...selectedEvidence.values()].slice(0, 20),
    retrievalMode,
    generatedAt: new Date().toISOString(),
  };
}
