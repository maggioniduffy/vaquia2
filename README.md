# Vaquia

HSE platform for oilfield service SMEs (Neuquén basin). PWA on Next.js 16 + Postgres (Neon) + Better Auth.

- Vision and business context: `docs/OVERVIEW.md`
- Plan and current phase: `docs/PLAN.md`
- Specs: `docs/spec/`

## Local setup

Requires Node 22+, pnpm 10, Docker.

```bash
pnpm install
docker compose up -d              # Postgres 17 on localhost:5432
cp .env.example .env.local        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:reset                     # migrate + seed (local only)
pnpm dev
```

Demo users (password `vaquia-demo`), from `scripts/seed.mts`:

| Email | Company | Role |
|---|---|---|
| hse@petrosur.test | Petrosur Servicios SRL | hse |
| supervisor@petrosur.test | Petrosur Servicios SRL | supervisor |
| hse@andesservicios.test | Andes Servicios Petroleros SA | hse |
| admin@vaquia.test | both | admin |

Without `RESEND_API_KEY`, magic-link emails are printed to the `pnpm dev` log.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test   # unit
pnpm test:db                               # RLS + append-only, against DATABASE_URL
pnpm build && pnpm test:e2e                # Playwright: light/dark × desktop/mobile
```

## Deploying (Neon + Vercel)

1. Create a Neon project (Postgres 17, region São Paulo unless the pilot requires otherwise).
2. Run migrations with the **direct** connection string:
   `DATABASE_URL=<neon direct url> pnpm db:migrate`
3. In Vercel set `DATABASE_URL` (Neon **pooled** URL), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
   (the public URL), `RESEND_API_KEY`, `EMAIL_FROM`.
4. Create the first company and admin with a one-off script against the direct URL (no
   self-signup: accounts are invite-only). Never run `db:seed` or `db:reset` against Neon.
