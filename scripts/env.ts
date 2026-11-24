import { existsSync } from "node:fs";

// Load .env.local / .env for local scripts (Node 22 has this built in).
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
