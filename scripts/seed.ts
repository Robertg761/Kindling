import { poolConfig } from "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/types";
import { nominate, setProjectStatus } from "../src/lib/core";
import { verifyRepository } from "../src/lib/github";

// Usage: npm run seed -- owner/repo https://github.com/owner/other ...
const inputs = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url || inputs.length === 0) {
  console.error("Usage: DATABASE_URL=... npm run seed -- owner/repo [owner/repo ...]");
  process.exit(1);
}
const pool = new Pool(poolConfig(url));
const db = drizzle(pool, { schema }) as unknown as Db;

for (const input of inputs) {
  const verified = await verifyRepository(input);
  if (!verified.ok) {
    console.log(`✗ ${input}: ${verified.reason}`);
    continue;
  }
  const now = new Date();
  const result = await nominate(db, { userId: null, repo: verified.repo, now, status: "approved" });
  if (!result.ok) {
    console.log(`✗ ${input}: ${result.reason}`);
    continue;
  }
  if (result.value.project.status !== "approved") await setProjectStatus(db, result.value.project.id, "approved", now);
  console.log(`✓ ${verified.repo.owner}/${verified.repo.name} is on the ballot`);
}
await pool.end();
