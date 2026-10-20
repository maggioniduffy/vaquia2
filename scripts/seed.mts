// Demo data: two companies, one user per role mix. Users sign in with the emailed 6-digit code
// (locally it is printed to the server log). The guest demo company comes from a migration.
// Fixed ids so tests and e2e can reference them. Local/staging only — refuses to run in production.
import pg from "pg";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"]; // CI's Postgres service is localhost too
const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://x@localhost/x").hostname;
if (!LOCAL_HOSTS.includes(dbHost) && !process.argv.includes("--allow-remote")) {
  throw new Error(`Refusing to seed non-local database host "${dbHost}" without --allow-remote`);
}

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

const companies = [
  { id: PETROSUR, name: "Petrosur Servicios SRL", cuit: "30711111111" },
  { id: ANDES, name: "Andes Servicios Petroleros SA", cuit: "30722222225" },
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
  // Natural-key idempotency: reuse existing rows (by lower(email) / cuit) and their ids.
  const userIds = new Map<string, string>();
  for (const u of users) {
    const found = await client.query<{ id: string }>(
      "select id from users where lower(email) = lower($1)",
      [u.email],
    );
    if (found.rows[0]) {
      userIds.set(u.id, found.rows[0].id);
      continue;
    }
    await client.query(
      "insert into users (id, name, email, email_verified) values ($1, $2, $3, true) on conflict (id) do nothing",
      [u.id, u.name, u.email],
    );
    userIds.set(u.id, u.id);
  }
  const companyIds = new Map<string, string>();
  for (const c of companies) {
    const found = await client.query<{ id: string }>(
      "select id from companies where id = $1 or cuit = $2 order by (id = $1) desc limit 1",
      [c.id, c.cuit],
    );
    if (found.rows[0]) {
      companyIds.set(c.id, found.rows[0].id);
      continue;
    }
    await client.query("insert into companies (id, name, cuit, plan) values ($1, $2, $3, 'paid')", [
      c.id,
      c.name,
      c.cuit,
    ]);
    companyIds.set(c.id, c.id);
  }
  for (const [i, m] of memberships.entries()) {
    // Staggered created_at so "oldest membership" (default active company) is deterministic.
    await client.query(
      `insert into memberships (company_id, user_id, role, created_at)
       values ($1, $2, $3, now() + make_interval(secs => $4))
       on conflict (company_id, user_id) do nothing`,
      [companyIds.get(m.companyId), userIds.get(m.userId), m.role, i],
    );
  }

  // Demo records for Petrosur (office records list). Fixed UUIDv7 ids + natural keys keep it
  // idempotent. Inserted as the table owner; app.user_id feeds the author-forcing trigger.
  const pid = companyIds.get(PETROSUR)!;
  const seedRow = async (sql: string, args: unknown[]) => (await client.query(sql, args)).rows[0];
  const location = await seedRow(
    `insert into locations (company_id, name, field) values ($1, 'Loma Campana', 'Vaca Muerta')
     on conflict (company_id, name) do update set name = excluded.name returning id`,
    [pid],
  );
  const crewIds: string[] = [];
  for (const name of ["Cuadrilla Norte", "Cuadrilla Sur"]) {
    const crew = await seedRow(
      `insert into crews (company_id, name, location_id) values ($1, $2, $3)
       on conflict (company_id, name) do update set name = excluded.name returning id`,
      [pid, name, location.id],
    );
    crewIds.push(crew.id);
  }
  const personaIds: string[] = [];
  for (const [i, name] of ["Carlos Ruiz", "Diego Soto", "Marcos Vera", "Pablo Luna"].entries()) {
    const persona = await seedRow(
      `insert into personas (company_id, full_name, dni, crew_id) values ($1, $2, $3, $4)
       on conflict (company_id, dni) do update set dni = excluded.dni returning id`,
      [pid, name, `3000000${i}`, crewIds[i % 2]],
    );
    personaIds.push(persona.id);
  }
  const demoRecords = [
    { n: 1, type: "501", daysAgo: 1, crew: 0, author: users[1]!.id, people: [0, 2] },
    { n: 2, type: "501", daysAgo: 3, crew: 1, author: users[1]!.id, people: [1, 3] },
    { n: 3, type: "502", daysAgo: 6, crew: 0, author: users[0]!.id, people: [0, 1, 2] },
  ];
  for (const r of demoRecords) {
    const id = `01900000-0000-7000-8000-00000000d${String(r.n).padStart(3, "0")}`;
    const exists = await client.query("select 1 from records where id = $1", [id]);
    if (exists.rowCount) continue;
    await client.query("select set_config('app.user_id', $1, true)", [userIds.get(r.author)]);
    const payload =
      r.type === "501"
        ? {
            topic: "Trabajo en altura",
            crew: crewIds[r.crew],
            location: location.id,
            attendees: r.people.map((i) => personaIds[i]),
          }
        : {};
    await client.query(
      `insert into records (id, company_id, record_type_id, schema_version, occurred_at, crew_id, location_id,
                            payload, submission_hash, device_id, client_created_at)
       values ($1, $2, $3, 1, now() - make_interval(days => $4), $5, $6, $7, $8, 'seed-device',
               now() - make_interval(days => $4))`,
      [
        id,
        pid,
        `90000000-0000-7000-8000-000000000${r.type}`,
        r.daysAgo,
        crewIds[r.crew],
        location.id,
        JSON.stringify(payload),
        "0".repeat(63) + r.n,
      ],
    );
    for (const i of r.people) {
      await client.query(
        "insert into record_participants (company_id, record_id, persona_id, role) values ($1, $2, $3, 'attendee')",
        [pid, id, personaIds[i]],
      );
    }
  }
  await client.query("commit");
  console.log(`Seeded ${users.length} users, ${companies.length} companies.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
