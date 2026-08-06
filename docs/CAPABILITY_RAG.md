# Mindverse Capability RAG

## Runtime contract

The Agent path is now:

```text
User request
-> Semantic Router (objective, targets, capabilities, constraints)
-> Capability Retriever (Skill / Tool / model / runtime)
-> Evidence Bundle
-> Capability Planner
-> Deterministic Capability Validator
-> Canvas compiler
-> Node executor
```

The Router never chooses a concrete canvas topology. The Planner can only cite capability IDs returned by retrieval. The validator owns input counts, media roles, duration, aspect ratio, resolution, availability, evidence references, and approval metadata. The compiler still owns node IDs, edge IDs, Handle compatibility, layout, and graph materialization.

The normalized plan keeps `kind` for UI compatibility, but the LLM is instructed to return `capability`; `validateAgentPlan` maps that capability to a node kind deterministically.

## Knowledge domains

- `capability`: Skills, Tools, models, runtimes, and structured constraints.
- `project`: character, location, style, asset, and project continuity memory.
- `repair`: provider failures and repairs that have completed successfully.
- `workflow`: successful instructions, graph structure, and non-sensitive output metadata.

Hard constraints remain in the TypeScript capability registry and JSON metadata. Vector retrieval is never their only source.

## Configure Render Postgres

1. Create a Render Postgres database and expose `DATABASE_URL` to the web service.
2. Set the RAG variables from `.env.example`.
3. Run:

```powershell
npm run rag:migrate
```

The base migration enables `pgcrypto` and `vector`, creates `rag_documents` and `rag_chunks`, and adds scope and full-text indexes. It intentionally uses exact vector search for the initial corpus.

After corpus size and recall justify approximate search, add HNSW explicitly:

```powershell
npm run rag:migrate -- --hnsw
```

The current migration uses `vector(1536)`. When changing to another 1536-dimensional model, increment `RAG_EMBEDDING_VERSION`; the ingestion pipeline will re-embed unchanged chunks against that version. A dimension change requires a new vector column/table and index migration. Do not mix incompatible dimensions in one HNSW index.

## Ingestion

`documentIngestion.ts` performs:

```text
source normalization
-> Markdown heading-aware chunks
-> SHA-256 document/chunk hashes
-> reuse unchanged chunk embeddings by SHA-256 hash
-> Embedding batches when configured
-> transactional document/chunk upsert
-> stale chunk deletion
```

Built-in Tool/model/runtime documents synchronize lazily before the first Postgres retrieval in a process. That first sync also backfills existing stored Skills with bounded concurrency. User Skill create/update operations request indexing after the Skill itself is safely stored; an indexing failure is logged without rolling back the saved Skill. Skill deletion marks its RAG document inactive.

Workflow saves index project memory, fully successful workflows index their graph summary, and successful autonomous repairs index the repair summary. These hooks are best-effort: the business write/result succeeds even if RAG is temporarily unavailable.

## Retrieval

Retrieval first removes unavailable or structurally incompatible catalog records. Postgres then retrieves up to 30 vector candidates and 30 full-text candidates. Reciprocal Rank Fusion combines both lists, deterministic lexical relevance reranks the top 20, and an optional LLM reranker can be enabled with `RAG_RERANK_ENABLED=true`.

Only 6–12 executable candidates and at most 20 compact evidence excerpts enter the Planner prompt. When Postgres, pgvector, migrations, or Embeddings are unavailable, the request falls back to the deterministic capability catalog.

Every Agent checkpoint stores a compact retrieval trace containing the query, retrieval mode, candidate capability IDs, selected capability IDs, and evidence IDs. It does not store API keys, base64 media, or complete provider responses.

## Main files

- `shared/agent/capabilityTypes.ts`: semantic route, capability, evidence, and typed input protocols.
- `server/agent/capabilities/capabilityCatalog.ts`: executable catalog.
- `server/agent/capabilities/capabilityRetriever.ts`: structural retrieval and Evidence Bundle assembly.
- `server/agent/capabilities/capabilityValidator.ts`: deterministic plan validation.
- `server/rag/*`: chunking, Embeddings, ingestion, hybrid retrieval, reranking, and source adapters.
- `server/db/migrations/*`: pgvector schema and optional HNSW index.
