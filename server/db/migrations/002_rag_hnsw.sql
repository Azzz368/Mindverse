-- Optional phase-two index. Keep exact vector search for small corpora and run
-- `npm run rag:migrate -- --hnsw` only after measuring corpus size and recall.
CREATE INDEX IF NOT EXISTS rag_embedding_hnsw
ON rag_chunks USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL AND embedding_version = 1;

INSERT INTO rag_schema_migrations (version)
VALUES ('002_rag_hnsw')
ON CONFLICT (version) DO NOTHING;
