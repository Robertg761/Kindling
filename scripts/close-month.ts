import { poolConfig } from "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/types";
import { closeVoting } from "../src/lib/core";
import { isMonth, monthOf, previousMonth } from "../src/lib/month";
import { collectiveSlug, getFunding, getSubscribers } from "../src/lib/opencollective";
import { BASE_PRICE_CENTS } from "../src/lib/money";

// Usage: npm run close-month [-- YYYY-MM]   (defaults to last month)
const month = process.argv[2] ?? previousMonth(monthOf(new Date()));
const url = process.env.DATABASE_URL;
if (!url || !isMonth(month)) {
  console.error("Usage: DATABASE_URL=... npm run close-month [-- YYYY-MM]");
  process.exit(1);
}
const pool = new Pool(poolConfig(url));
const slug = collectiveSlug();
const funding = slug ? await getFunding(slug, month, { fresh: true }) : null;
const voterSlugs = slug ? [...(await getSubscribers(slug))].filter(([, c]) => c >= BASE_PRICE_CENTS).map(([s]) => s) : null;
const outcome = await closeVoting(drizzle(pool, { schema }) as unknown as Db, month, funding, voterSlugs);
console.log(
  outcome.status === "closed"
    ? `${month}: ${outcome.winners.map((w) => `${w.project.owner}/${w.project.name}`).join(", ") || "no winners"} (pot ${outcome.round.potCents} cents)`
    : `${month}: already closed`,
);
await pool.end();
