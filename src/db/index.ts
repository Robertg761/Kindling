import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./types";

const globalForDb = globalThis as unknown as { kindlingPool?: Pool };

/**
 * Full certificate verification for remote databases. The sslmode query parameter is
 * dropped because the explicit ssl option already sets it, and pg warns when both are present.
 */
export function poolConfig(url: string) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("channel_binding");
  return { connectionString: parsed.toString(), max: 5, ssl: local ? undefined : { rejectUnauthorized: true } };
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const pool = globalForDb.kindlingPool ?? new Pool(poolConfig(url));
  globalForDb.kindlingPool = pool;
  return drizzle(pool, { schema });
}
