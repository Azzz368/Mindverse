import "server-only";

import type { PoolClient } from "pg";
import { postgresConfigured, queryPostgres, withPostgresTransaction } from "@/server/db/postgres";
import { chunkMarkdownBySections, ragContentHash } from "@/server/rag/chunking";
import { createEmbeddings, embeddingModel, embeddingVersion, embeddingsConfigured, vectorLiteral } from "@/server/rag/embeddingClient";

export type RagKnowledgeDomain = "capability" | "project" | "repair" | "workflow";
export type RagVisibility = "private" | "project" | "tenant" | "public";

export type RagDocumentInput = {
  domain: RagKnowledgeDomain;
  sourceType: string;
  sourceId: string;
  tenantId?: string;
  projectId?: string;
  title: string;
  visibility: RagVisibility;
  content: string;
  metadata?: Record<string, unknown>;
  version?: number;
  active?: boolean;
};

export type RagIngestionResult = {
  status: "created" | "updated" | "unchanged" | "skipped";
  documentId?: string;
  chunkCount: number;
  embeddedChunkCount: number;
};

type ExistingDocument = { id: string; content_hash: string };
type ExistingChunk = {
  chunk_index: number;
  content_hash: string;
  embedding_model: string | null;
  embedding_version: number;
  has_embedding: boolean;
};

const json = (value: unknown) => JSON.stringify(value || {});

const existingDocument = async (input: RagDocumentInput) => {
  const result = await queryPostgres<ExistingDocument>(
    `SELECT id, content_hash
       FROM rag_documents
      WHERE source_type = $1 AND source_id = $2
        AND COALESCE(tenant_id, '') = COALESCE($3, '')
        AND COALESCE(project_id, '') = COALESCE($4, '')
      LIMIT 1`,
    [input.sourceType, input.sourceId, input.tenantId || null, input.projectId || null],
  );
  return result.rows[0];
};

const existingChunks = async (documentId: string) => {
  const result = await queryPostgres<ExistingChunk>(
    `SELECT chunk_index, content_hash, embedding_model, embedding_version,
            embedding IS NOT NULL AS has_embedding
       FROM rag_chunks
      WHERE document_id = $1`,
    [documentId],
  );
  return new Map(result.rows.map((chunk) => [chunk.chunk_index, chunk]));
};

const upsertDocument = async (client: PoolClient, input: RagDocumentInput, contentHash: string, existing?: ExistingDocument) => {
  if (existing) {
    await client.query(
      `UPDATE rag_documents
          SET domain = $2, title = $3, visibility = $4, content_hash = $5,
              metadata = $6::jsonb, version = $7, active = $8, updated_at = now()
        WHERE id = $1`,
      [existing.id, input.domain, input.title, input.visibility, contentHash, json(input.metadata), input.version || 1, input.active !== false],
    );
    return existing.id;
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO rag_documents
      (domain, source_type, source_id, tenant_id, project_id, title, visibility, content_hash, metadata, version, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
     RETURNING id`,
    [input.domain, input.sourceType, input.sourceId, input.tenantId || null, input.projectId || null, input.title, input.visibility, contentHash, json(input.metadata), input.version || 1, input.active !== false],
  );
  return inserted.rows[0].id;
};

export async function ingestRagDocument(input: RagDocumentInput): Promise<RagIngestionResult> {
  if (!postgresConfigured()) return { status: "skipped", chunkCount: 0, embeddedChunkCount: 0 };
  const content = input.content.trim();
  if (!content) throw new Error(`RAG document ${input.sourceType}:${input.sourceId} has no content.`);
  const contentHash = ragContentHash(content);
  const existing = await existingDocument(input);
  const chunks = chunkMarkdownBySections(content, { metadata: { sourceType: input.sourceType, sourceId: input.sourceId, domain: input.domain } });
  const storedChunks = existing ? await existingChunks(existing.id) : new Map<number, ExistingChunk>();
  const canEmbed = embeddingsConfigured();
  const targetEmbeddingModel = embeddingModel();
  const targetEmbeddingVersion = embeddingVersion();
  const changedChunks = chunks.filter((chunk) => {
    const stored = storedChunks.get(chunk.chunkIndex);
    if (!stored || stored.content_hash !== chunk.contentHash) return true;
    return canEmbed && (!stored.has_embedding || stored.embedding_model !== targetEmbeddingModel || stored.embedding_version !== targetEmbeddingVersion);
  });
  const embeddingByChunk = new Map<number, number[]>();
  if (canEmbed && changedChunks.length) {
    const batchSize = Math.max(1, Math.min(64, Number(process.env.RAG_EMBEDDING_BATCH_SIZE || 24)));
    for (let offset = 0; offset < changedChunks.length; offset += batchSize) {
      const batch = changedChunks.slice(offset, offset + batchSize);
      const embeddings = await createEmbeddings(batch.map((chunk) => chunk.content));
      batch.forEach((chunk, index) => embeddingByChunk.set(chunk.chunkIndex, embeddings[index]));
    }
  }

  const documentId = await withPostgresTransaction(async (client) => {
    const id = await upsertDocument(client, input, contentHash, existing);
    for (const chunk of changedChunks) {
      const embedding = embeddingByChunk.get(chunk.chunkIndex);
      await client.query(
        `INSERT INTO rag_chunks
          (document_id, chunk_index, heading, content, content_hash, token_count, embedding, embedding_model, embedding_version, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10::jsonb)
         ON CONFLICT (document_id, chunk_index) DO UPDATE SET
           heading = EXCLUDED.heading,
           content = EXCLUDED.content,
           content_hash = EXCLUDED.content_hash,
           token_count = EXCLUDED.token_count,
           embedding = EXCLUDED.embedding,
           embedding_model = EXCLUDED.embedding_model,
           embedding_version = EXCLUDED.embedding_version,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
        [id, chunk.chunkIndex, chunk.heading || null, chunk.content, chunk.contentHash, chunk.tokenCount, embedding ? vectorLiteral(embedding) : null, embedding ? targetEmbeddingModel : null, targetEmbeddingVersion, json(chunk.metadata)],
      );
    }
    await client.query("DELETE FROM rag_chunks WHERE document_id = $1 AND chunk_index >= $2", [id, chunks.length]);
    return id;
  });

  return {
    status: existing ? (changedChunks.length || existing.content_hash !== contentHash ? "updated" : "unchanged") : "created",
    documentId,
    chunkCount: chunks.length,
    embeddedChunkCount: embeddingByChunk.size,
  };
}

export async function deactivateRagDocument(sourceType: string, sourceId: string, tenantId?: string, projectId?: string) {
  if (!postgresConfigured()) return false;
  const result = await queryPostgres(
    `UPDATE rag_documents
        SET active = false, updated_at = now()
      WHERE source_type = $1 AND source_id = $2
        AND COALESCE(tenant_id, '') = COALESCE($3, '')
        AND COALESCE(project_id, '') = COALESCE($4, '')`,
    [sourceType, sourceId, tenantId || null, projectId || null],
  );
  return Boolean(result.rowCount);
}
