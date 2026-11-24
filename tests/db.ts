import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";
import type { VerifiedRepo } from "@/lib/github";

export async function testDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
  return db as unknown as Db;
}

let repoCounter = 1000;
export function fakeRepo(name: string, overrides: Partial<VerifiedRepo> = {}): VerifiedRepo {
  return {
    githubRepoId: String(repoCounter++),
    owner: "octo",
    name,
    description: `${name} does things`,
    stars: 10,
    language: "TypeScript",
    lastPushAt: new Date("2026-11-01T00:00:00Z"),
    fundingLinks: [{ platform: "github", label: "GitHub Sponsors", url: "https://github.com/sponsors/octo" }],
    ...overrides,
  };
}
