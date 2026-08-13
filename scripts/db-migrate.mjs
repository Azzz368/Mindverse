import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const ssl = process.env.DATABASE_SSL !== "false" && (process.env.DATABASE_SSL === "true" || process.env.RENDER)
  ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" }
  : undefined;
const pool = new pg.Pool({ connectionString, ssl, max: 1 });
const migrationDir = path.join(process.cwd(), "server", "db", "migrations");

try {
  const files = (await readdir(migrationDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationDir, file), "utf8");
    await pool.query(sql);
    process.stdout.write(`Applied ${file}\n`);
  }
} finally {
  await pool.end();
}
