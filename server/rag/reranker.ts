import "server-only";

import type { CapabilityEvidence } from "@/shared/agent/capabilityTypes";
import { agentModel, agentProvider, requestChatCompletion } from "@/server/ai/textLLMClient";

const terms = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9_-]+|[\u3400-\u9fff]{2,}/g) || []);

const lexicalBonus = (query: string, evidence: CapabilityEvidence, requiredCapabilities: string[]) => {
  const queryTerms = terms([query, ...requiredCapabilities].join(" "));
  const candidateTerms = terms(`${evidence.title} ${evidence.excerpt} ${JSON.stringify(evidence.metadata || {})}`);
  const matches = [...queryTerms].filter((term) => candidateTerms.has(term)).length;
  return queryTerms.size ? matches / queryTerms.size : 0;
};

const deterministicRerank = (query: string, evidence: CapabilityEvidence[], requiredCapabilities: string[]) =>
  evidence.map((item) => ({ ...item, score: item.score * 0.65 + lexicalBonus(query, item, requiredCapabilities) * 0.35 }))
    .sort((a, b) => b.score - a.score);

export async function rerankEvidence(query: string, evidence: CapabilityEvidence[], requiredCapabilities: string[], limit: number) {
  const ranked = deterministicRerank(query, evidence, requiredCapabilities);
  if (process.env.RAG_RERANK_ENABLED !== "true" || ranked.length < 2) return ranked.slice(0, limit);
  try {
    type Response = { choices?: Array<{ message?: { content?: string } }> };
    const response = await requestChatCompletion<Response>({
      provider: agentProvider(),
      body: {
        model: process.env.RAG_RERANK_MODEL || agentModel(process.env.AGENT_LLM_MODEL || "gpt-4o"),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Rank retrieval evidence for an executable creative workflow plan. Return JSON only: {\"ids\":[\"best-id\",\"...\"]}. Never invent ids." },
          { role: "user", content: JSON.stringify({ query, requiredCapabilities, candidates: ranked.map((item) => ({ id: item.id, title: item.title, excerpt: item.excerpt.slice(0, 700) })) }) },
        ],
      },
    });
    const content = response.choices?.[0]?.message?.content?.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const ids = content ? (JSON.parse(content) as { ids?: unknown }).ids : undefined;
    if (!Array.isArray(ids)) return ranked.slice(0, limit);
    const byId = new Map(ranked.map((item) => [item.id, item]));
    const reordered = ids.map((id) => typeof id === "string" ? byId.get(id) : undefined).filter((item): item is CapabilityEvidence => Boolean(item));
    const seen = new Set(reordered.map((item) => item.id));
    return [...reordered, ...ranked.filter((item) => !seen.has(item.id))].slice(0, limit);
  } catch (error) {
    console.warn("RAG reranker failed; using deterministic ranking.", error instanceof Error ? error.message : error);
    return ranked.slice(0, limit);
  }
}
