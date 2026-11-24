import { existsSync } from "node:fs";

// Load .env.local / .env for local scripts (Node 22 has this built in).
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Same connection settings as the app: full certificate checks, sslmode dropped to avoid pg's warning. */
export function poolConfig(url: string) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("channel_binding");
  return { connectionString: parsed.toString(), ssl: local ? undefined : { rejectUnauthorized: true } };
}
