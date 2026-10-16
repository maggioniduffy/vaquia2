# Vaquia

HSE platform for oilfield service SMEs (Neuquén basin). PWA on Next.js 16 + Supabase.

- Vision and business context: `docs/OVERVIEW.md`
- Plan and current phase: `docs/PLAN.md`
- Specs: `docs/spec/`

## Local setup

Requires Node 22+, pnpm 10, Docker.

```bash
pnpm install
pnpm exec supabase start          # Postgres + Auth + API, applies migrations and seed
pnpm exec supabase status -o env  # copy API_URL / ANON_KEY into .env.local (see .env.example)
pnpm dev
```

Demo users (password `vaquia-demo`), from `supabase/seed.sql`:

| Email | Company | Role |
|---|---|---|
| hse@petrosur.test | Petrosur Servicios SRL | hse |
| supervisor@petrosur.test | Petrosur Servicios SRL | supervisor |
| hse@andesservicios.test | Andes Servicios Petroleros SA | hse |
| admin@vaquia.test | both | admin |

Magic-link emails land in the local Mailpit inbox (http://127.0.0.1:54324).

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test   # unit
pnpm exec supabase test db                 # RLS + append-only (pgTAP)
pnpm build && pnpm test:e2e                # Playwright: light/dark × desktop/mobile
```
