import "server-only";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export const postgresConfigured = () => Boolean(process.env.DATABASE_URL?.trim());

const sslConfig = () => {
  if (process.env.DATABASE_SSL === "false") return false;
  if (process.env.DATABASE_SSL === "true" || process.env.RENDER) {
    return { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" };
  }
  return undefined;
};

export function getPostgresPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for Postgres RAG storage.");
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: Math.max(1, Number(process.env.DATABASE_POOL_MAX || 8)),
      idleTimeoutMillis: Math.max(1_000, Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30_000)),
      connectionTimeoutMillis: Math.max(1_000, Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 10_000)),
      ssl: sslConfig(),
    });
  }
  return pool;
}

export const queryPostgres = <T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> =>
  getPostgresPool().query<T>(text, values);

export async function withPostgresTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgresPool() {
  if (!pool) return;
  const active = pool;
  pool = undefined;
  await active.end();
}
