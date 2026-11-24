import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL) {
    // First deploy before a database is connected: build anyway, the site shows a setup notice.
    console.warn("DATABASE_URL is not set; skipping migrations.");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true } });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("Database is up to date.");
