// Prints the SQL Better Auth expects for the current options (run against an empty database).
import { getMigrations } from "better-auth/db/migration";
import { magicLink } from "better-auth/plugins";
import pg from "pg";
const { authOptions } = await import(process.argv[2]);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { compileMigrations } = await getMigrations({
  ...authOptions,
  database: pool,
  plugins: [magicLink({ sendMagicLink: async () => {} })],
});
console.log(await compileMigrations());
await pool.end();
