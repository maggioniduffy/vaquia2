// Development only touches a local Postgres. Remote databases (Neon = production) are migrated and
// tested only from GitHub Actions (migrate.yml after merge to main, ci.yml's service container).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "db", "postgres"]);

export function isLocalDatabaseUrl(url) {
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Exits unless DATABASE_URL is local or we run in GitHub Actions. */
export function assertLocalOrCi(action) {
  const url = process.env.DATABASE_URL;
  if (isLocalDatabaseUrl(url) || process.env.GITHUB_ACTIONS === "true") return;
  console.error(
    `Refusing to ${action}: DATABASE_URL is not a local database. Remote (Neon) is migrated only by ` +
      "the Migrate Neon workflow after merging to main. Point DATABASE_URL at local Postgres " +
      "(docker compose up -d) and use `pnpm db:verify`.",
  );
  process.exit(1);
}
