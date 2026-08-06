import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const migrations = ["001_rag_pgvector.sql"];
if (process.argv.includes("--hnsw")) migrations.push("002_rag_hnsw.sql");

const ssl = process.env.DATABASE_SSL !== "false" && (process.env.DATABASE_SSL === "true" || process.env.RENDER)
  ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" }
  : undefined;
const pool = new pg.Pool({ connectionString, ssl });

try {
  for (const filename of migrations) {
    const sql = await readFile(path.join(process.cwd(), "server", "db", "migrations", filename), "utf8");
    await pool.query(sql);
    process.stdout.write(`Applied ${filename}\n`);
  }
} finally {
  await pool.end();
}
