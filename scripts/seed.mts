// Demo data: three companies, one user per role mix. Password for every demo user: vaquia-demo
// Fixed ids so tests and e2e can reference them. Local/staging only — refuses to run in production.
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

const PASSWORD = "vaquia-demo";

const users = [
  { id: "a0000000-0000-7000-8000-000000000001", email: "hse@petrosur.test", name: "Laura Gómez" },
  {
    id: "a0000000-0000-7000-8000-000000000002",
    email: "supervisor@petrosur.test",
    name: "Juan Pérez",
  },
  {
    id: "b0000000-0000-7000-8000-000000000001",
    email: "hse@andesservicios.test",
    name: "Martín Díaz",
  },
  { id: "c0000000-0000-7000-8000-000000000001", email: "admin@vaquia.test", name: "Admin Vaquia" },
  // OTP e2e only (e2e/otp.spec.ts). Each one has its own server-side OTP state.
  { id: "a0000000-0000-7000-8000-000000000003", email: "otp@petrosur.test", name: "Ana Código" },
  {
    id: "a0000000-0000-7000-8000-000000000004",
    email: "otp-lock@petrosur.test",
    name: "Luis Bloqueo",
  },
];

const PETROSUR = "10000000-0000-7000-8000-000000000001";
const ANDES = "20000000-0000-7000-8000-000000000001";
// Demo company for guest sessions (GUEST_COMPANY_ID). Intentionally has no members.
const DEMO = "30000000-0000-7000-8000-000000000001";

const companies = [
  { id: PETROSUR, name: "Petrosur Servicios SRL", cuit: "30-71111111-1" },
  { id: ANDES, name: "Andes Servicios Petroleros SA", cuit: "30-72222222-2" },
  { id: DEMO, name: "Empresa Demo", cuit: "30-73333333-3" },
];

const memberships = [
  { companyId: PETROSUR, userId: users[0]!.id, role: "hse" },
  { companyId: PETROSUR, userId: users[1]!.id, role: "supervisor" },
  { companyId: ANDES, userId: users[2]!.id, role: "hse" },
  // Member of both companies: exercises the company switcher.
  { companyId: PETROSUR, userId: users[3]!.id, role: "admin" },
  { companyId: ANDES, userId: users[3]!.id, role: "admin" },
  { companyId: PETROSUR, userId: users[4]!.id, role: "supervisor" },
  { companyId: PETROSUR, userId: users[5]!.id, role: "supervisor" },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  const hash = await hashPassword(PASSWORD);
  for (const u of users) {
    await client.query(
      `insert into users (id, name, email, email_verified) values ($1, $2, $3, true)
       on conflict (id) do nothing`,
      [u.id, u.name, u.email],
    );
    await client.query(
      `insert into accounts (account_id, provider_id, user_id, password, updated_at)
       select $1::text, 'credential', $1::uuid, $2, now()
       where not exists (select 1 from accounts where user_id = $1::uuid and provider_id = 'credential')`,
      [u.id, hash],
    );
  }
  for (const c of companies) {
    await client.query(
      "insert into companies (id, name, cuit) values ($1, $2, $3) on conflict (id) do nothing",
      [c.id, c.name, c.cuit],
    );
  }
  for (const [i, m] of memberships.entries()) {
    // Staggered created_at so "oldest membership" (default active company) is deterministic.
    await client.query(
      `insert into memberships (company_id, user_id, role, created_at)
       values ($1, $2, $3, now() + make_interval(secs => $4))
       on conflict (company_id, user_id) do nothing`,
      [m.companyId, m.userId, m.role, i],
    );
  }
  await client.query("commit");
  console.log(`Seeded ${users.length} users, ${companies.length} companies.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
