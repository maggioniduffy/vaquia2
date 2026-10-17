import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides DATABASE_URL directly.
}

// DB tests: RLS and append-only rules against a migrated Postgres (local, CI service, or Neon branch).
// The `@` alias and the `server-only` stub let DB tests import pure modules from src/lib (e.g. import-db).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./db/tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["db/tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
