// Change a company's plan by CUIT (owner pool; bypasses RLS). Allowed on an expired trial (VQ001 allows it).
//   pnpm company:plan <cuit> paid
//   pnpm company:plan <cuit> trial [--days N]   (default 30)
import { parseArgs } from "node:util";
import pg from "pg";

const USAGE = `Usage:
  pnpm company:plan <cuit> paid
  pnpm company:plan <cuit> trial [--days N]`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

let positionals: string[];
let days = 30;
try {
  const parsed = parseArgs({
    options: { days: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  positionals = parsed.positionals;
  if (parsed.values.days !== undefined) {
    days = Number(parsed.values.days);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const [rawCuit, plan] = positionals;
if (!rawCuit || (plan !== "paid" && plan !== "trial") || positionals.length !== 2) {
  fail("Expected <cuit> and a plan (paid | trial).");
}
const cuitDigits = rawCuit.replace(/\D/g, "");
if (cuitDigits.length !== 11) fail(`Invalid CUIT: ${rawCuit}`);
if (!Number.isInteger(days) || days <= 0) fail("--days must be a positive integer.");
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result =
    plan === "paid"
      ? await client.query<{ name: string; plan: string; trial_ends_at: Date | null }>(
          `update companies set plan = 'paid', trial_ends_at = null
           where regexp_replace(cuit, '\\D', '', 'g') = $1
           returning name, plan, trial_ends_at`,
          [cuitDigits],
        )
      : await client.query<{ name: string; plan: string; trial_ends_at: Date | null }>(
          `update companies set plan = 'trial', trial_ends_at = now() + make_interval(days => $2::int)
           where regexp_replace(cuit, '\\D', '', 'g') = $1
           returning name, plan, trial_ends_at`,
          [cuitDigits, days],
        );
  const row = result.rows[0];
  if (!row) {
    console.error(`No company found with CUIT ${cuitDigits}.`);
    process.exitCode = 1;
  } else {
    console.log(`${row.name}: plan = ${row.plan}`);
    console.log(`  trial ends: ${row.trial_ends_at ? row.trial_ends_at.toISOString() : "n/a"}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
