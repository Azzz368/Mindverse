import "server-only";

type EmbeddingResponse = {
  data?: Array<{ index?: number; embedding?: number[] }>;
};

const dimensions = () => Math.max(1, Number(process.env.RAG_EMBEDDING_DIMENSIONS || 1536));

export const embeddingModel = () => process.env.RAG_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
export const embeddingVersion = () => Math.max(1, Math.floor(Number(process.env.RAG_EMBEDDING_VERSION || 1)) || 1);

const embeddingBaseUrl = () =>
  process.env.RAG_EMBEDDING_BASE_URL?.trim()
  || process.env.AI_302_OPENAI_BASE_URL?.trim()
  || process.env.AI_302_BASE_URL?.trim()
  || "https://api.302.ai/v1";

const embeddingApiKey = () => process.env.RAG_EMBEDDING_API_KEY?.trim() || process.env.AI_302_API_KEY?.trim();

export const embeddingsConfigured = () => Boolean(embeddingApiKey() && embeddingBaseUrl());

const embeddingsUrl = () => `${embeddingBaseUrl().replace(/\/+$/g, "")}/embeddings`;

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  const apiKey = embeddingApiKey();
  if (!apiKey) throw new Error("RAG_EMBEDDING_API_KEY or AI_302_API_KEY is required for embeddings.");
  const expectedDimensions = dimensions();
  if (expectedDimensions !== 1536) {
    throw new Error(`RAG_EMBEDDING_DIMENSIONS=${expectedDimensions} does not match the current rag_chunks vector(1536) migration. Create a new embedding index version before changing dimensions.`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5_000, Number(process.env.RAG_EMBEDDING_TIMEOUT_MS || 30_000)));
  try {
    const response = await fetch(embeddingsUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: embeddingModel(), input: inputs, dimensions: expectedDimensions }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(`Embedding request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`);
    }
    const payload = await response.json() as EmbeddingResponse;
    const ordered = [...(payload.data || [])].sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
    if (ordered.length !== inputs.length) throw new Error(`Embedding response returned ${ordered.length} vectors for ${inputs.length} inputs.`);
    return ordered.map((item, index) => {
      const vector = item.embedding;
      if (!Array.isArray(vector) || vector.length !== expectedDimensions || vector.some((value) => !Number.isFinite(value))) {
        throw new Error(`Embedding ${index} does not match vector(${expectedDimensions}).`);
      }
      return vector;
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function createEmbedding(input: string): Promise<number[]> {
  const [embedding] = await createEmbeddings([input]);
  return embedding;
}

export const vectorLiteral = (embedding: number[]) => `[${embedding.join(",")}]`;
