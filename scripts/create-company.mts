// One-off provisioning: create a company and its first admin on any database (local or Neon).
// Sign-up is disabled (invite-only), so this is how real tenants get created. Allowed in
// production; it only inserts and never deletes anything.
import { parseArgs } from "node:util";
import pg from "pg";

const USAGE = `Usage:
  pnpm admin:create-company --name "Petrosur Servicios SRL" --admin-email ana@petrosur.com.ar \\
    --admin-name "Ana López" [--cuit 30-71111111-1]`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

let values: {
  name?: string;
  cuit?: string;
  "admin-email"?: string;
  "admin-name"?: string;
};
try {
  ({ values } = parseArgs({
    options: {
      name: { type: "string" },
      cuit: { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
    },
    strict: true,
  }));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const name = values.name?.trim();
const cuit = values.cuit?.trim() || null;
const adminEmail = values["admin-email"]?.trim().toLowerCase();
const adminName = values["admin-name"]?.trim();

if (!name || !adminEmail || !adminName) {
  fail("Missing required arguments: --name, --admin-email and --admin-name.");
}
if (!adminEmail.includes("@")) fail(`Invalid --admin-email: ${adminEmail}`);
if (adminEmail.endsWith("@guest.vaquia.invalid")) fail("Reserved guest email domain.");
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");

  if (cuit) {
    const existing = await client.query<{ id: string; name: string }>(
      "select id, name from companies where cuit = $1",
      [cuit],
    );
    if (existing.rows[0]) {
      throw new Error(
        `A company with CUIT ${cuit} already exists: "${existing.rows[0].name}" (${existing.rows[0].id}). Nothing was created.`,
      );
    }
  }

  const company = await client.query<{ id: string }>(
    "insert into companies (name, cuit) values ($1, $2) returning id",
    [name, cuit],
  );
  const companyId = company.rows[0]!.id;

  const found = await client.query<{ id: string }>("select id from users where lower(email) = $1", [
    adminEmail,
  ]);
  let userId = found.rows[0]?.id;
  const userIsNew = !userId;
  if (!userId) {
    // No password row: the admin signs in with the 6-digit code sent to their email.
    const created = await client.query<{ id: string }>(
      "insert into users (name, email, email_verified) values ($1, $2, true) returning id",
      [adminName, adminEmail],
    );
    userId = created.rows[0]!.id;
  }

  await client.query(
    `insert into memberships (company_id, user_id, role) values ($1, $2, 'admin')
     on conflict (company_id, user_id) do nothing`,
    [companyId, userId],
  );

  await client.query("commit");

  console.log(`Company created: ${name}`);
  console.log(`  company id: ${companyId}`);
  console.log(`  admin user id: ${userId}`);
  console.log(`  admin user: ${userIsNew ? "new" : "already existed (reused)"} <${adminEmail}>`);
  console.log("The admin signs in with the 6-digit code sent to their email (no password).");
} catch (error) {
  await client.query("rollback");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
