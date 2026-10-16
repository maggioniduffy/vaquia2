import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides DATABASE_URL directly.
}

// DB tests: RLS and append-only rules against a migrated Postgres (local, CI service, or Neon branch).
export default defineConfig({
  test: {
    environment: "node",
    include: ["db/tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
