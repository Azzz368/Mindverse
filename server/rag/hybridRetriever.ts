import "server-only";

import type { CapabilityEvidence, CapabilityRetrievalRequest } from "@/shared/agent/capabilityTypes";
import { queryPostgres } from "@/server/db/postgres";
import { createEmbedding, embeddingModel, embeddingVersion, embeddingsConfigured, vectorLiteral } from "@/server/rag/embeddingClient";
import { rerankEvidence } from "@/server/rag/reranker";

type RagRow = {
  id: string;
  document_id: string;
  source_type: string;
  source_id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number | string;
};

const evidenceFrom = (row: RagRow, score: number): CapabilityEvidence => ({
  id: row.id,
  documentId: row.document_id,
  sourceType: row.source_type,
  sourceId: row.source_id,
  title: row.title,
  excerpt: row.content.slice(0, 1_400),
  score,
  metadata: row.metadata || undefined,
});

const scopeSql = `
  d.active = true
  AND d.domain = ANY($1::text[])
  AND (
    d.visibility = 'public'
    OR ($2::text IS NOT NULL AND d.tenant_id = $2)
    OR ($3::text IS NOT NULL AND d.project_id = $3)
  )`;

export async function hybridRetrieve(request: CapabilityRetrievalRequest, candidateLimit = 30): Promise<CapabilityEvidence[]> {
  const tenantId = request.filters.tenantId || null;
  const projectId = request.filters.projectId || null;
  const textResults = await queryPostgres<RagRow>(
    `SELECT c.id, c.document_id, d.source_type, d.source_id, d.title, c.content, d.metadata || c.metadata AS metadata,
            ts_rank_cd(c.text_search, websearch_to_tsquery('simple', $4)) AS score
       FROM rag_chunks c
       JOIN rag_documents d ON d.id = c.document_id
      WHERE ${scopeSql}
        AND c.text_search @@ websearch_to_tsquery('simple', $4)
      ORDER BY score DESC
      LIMIT $5`,
    [request.domains, tenantId, projectId, request.query, candidateLimit],
  );

  let vectorRows: RagRow[] = [];
  if (embeddingsConfigured()) {
    const embedding = await createEmbedding(request.query);
    const result = await queryPostgres<RagRow>(
      `SELECT c.id, c.document_id, d.source_type, d.source_id, d.title, c.content, d.metadata || c.metadata AS metadata,
              1 - (c.embedding <=> $4::vector) AS score
         FROM rag_chunks c
         JOIN rag_documents d ON d.id = c.document_id
        WHERE ${scopeSql}
          AND c.embedding IS NOT NULL
          AND c.embedding_model = $5
          AND c.embedding_version = $6
        ORDER BY c.embedding <=> $4::vector
        LIMIT $7`,
      [request.domains, tenantId, projectId, vectorLiteral(embedding), embeddingModel(), embeddingVersion(), candidateLimit],
    );
    vectorRows = result.rows;
  }

  const fused = new Map<string, { row: RagRow; score: number }>();
  const addRanked = (rows: RagRow[], weight: number) => rows.forEach((row, index) => {
    const current = fused.get(row.id) || { row, score: 0 };
    current.score += weight / (60 + index + 1);
    fused.set(row.id, current);
  });
  addRanked(vectorRows, 1);
  addRanked(textResults.rows, 1);
  const candidates = [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((item) => evidenceFrom(item.row, item.score));
  return rerankEvidence(request.query, candidates, request.requiredCapabilities, request.limit || 10);
}
