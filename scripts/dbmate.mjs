// Runs dbmate with our defaults, loading .env.local when present (CI and Neon pass DATABASE_URL directly).
import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const result = spawnSync(
  "dbmate",
  ["--migrations-dir", "db/migrations", "--no-dump-schema", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
