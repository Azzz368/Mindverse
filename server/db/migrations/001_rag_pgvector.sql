CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('capability', 'project', 'repair', 'workflow')),
  source_type text NOT NULL,
  source_id text NOT NULL,
  tenant_id text,
  project_id text,
  title text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private', 'project', 'tenant', 'public')),
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rag_document_source_unique
ON rag_documents (
  source_type,
  source_id,
  COALESCE(tenant_id, ''),
  COALESCE(project_id, '')
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  heading text,
  content text NOT NULL,
  content_hash text NOT NULL,
  token_count integer NOT NULL,
  embedding vector(1536),
  embedding_model text,
  embedding_version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  text_search tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS rag_text_search
ON rag_chunks USING gin (text_search);

CREATE INDEX IF NOT EXISTS rag_document_scope
ON rag_documents (tenant_id, project_id, domain, source_type, active);

CREATE INDEX IF NOT EXISTS rag_chunk_document
ON rag_chunks (document_id, chunk_index);

INSERT INTO rag_schema_migrations (version)
VALUES ('001_rag_pgvector')
ON CONFLICT (version) DO NOTHING;
