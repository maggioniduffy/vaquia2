// Runs dbmate with our defaults, loading .env.local when present (CI and Neon pass DATABASE_URL directly).
import { spawnSync } from "node:child_process";
import { assertLocalOrCi } from "./db-target.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

// Neon connection strings include channel_binding=require, which dbmate's driver rejects
// ("unrecognized configuration parameter"). Drop it; sslmode=require keeps TLS on.
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /\?channel_binding=[^&]*&/,
    "?",
  ).replace(/[&?]channel_binding=[^&]*/, "");
}

// Commands that change a database run only against local Postgres (or in GitHub Actions).
const MUTATING = new Set(["up", "migrate", "rollback", "down", "drop", "create", "load"]);
const command = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
if (MUTATING.has(command)) assertLocalOrCi(`run dbmate ${command}`);

const result = spawnSync(
  "dbmate",
  ["--migrations-dir", "db/migrations", "--no-dump-schema", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error) console.error(`Could not run dbmate: ${result.error.message}`);
process.exit(result.status ?? 1);
