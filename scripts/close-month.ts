import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/types";
import { closeVoting } from "../src/lib/core";
import { isMonth, monthOf, previousMonth } from "../src/lib/month";

// Usage: npm run close-month [-- YYYY-MM]   (defaults to last month)
const month = process.argv[2] ?? previousMonth(monthOf(new Date()));
const url = process.env.DATABASE_URL;
if (!url || !isMonth(month)) {
  console.error("Usage: DATABASE_URL=... npm run close-month [-- YYYY-MM]");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true } });
const outcome = await closeVoting(drizzle(pool, { schema }) as unknown as Db, month);
console.log(outcome.status === "picked" ? `${month}: ${outcome.project.owner}/${outcome.project.name} wins with ${outcome.pick.voteCount} votes` : `${month}: ${outcome.status}`);
await pool.end();
