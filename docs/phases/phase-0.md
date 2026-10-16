# Phase 0 — Foundations

**Goal:** empty but production-shaped app: a user logs in, belongs to a company, sees only that company's data.
**Refs:** spec/architecture.md · spec/data-model.md#Tenancy · spec/design.md

## Unknowns → researcher
- [ ] Current Next.js 16 + Serwist setup steps and compatibility. → deferred to phase 2 (offline is first needed there).
- [x] Tailwind v4 `@theme` + shadcn/ui setup for Next 16.
- [x] Auth for App Router: Better Auth (`nextCookies`, `getSessionCookie` in `src/proxy.ts`).

## Tasks
- [x] **0.1** (implementer) Scaffold: Next 16, TS strict, pnpm, ESLint, Prettier, path aliases, `src/` layout (`app/(office)`, `app/(field)`, `app/(auth)`, `lib/`, `i18n/`).
- [x] **0.2** (implementer) Design tokens in CSS per spec/design.md, light/dark, Geist fonts, base components (Button, Input, Table, Dialog, Toast, Badge-dot).
- [x] **0.3** (implementer) Local Postgres + dbmate migrations: `companies`, `memberships`, `current_company_id()`, role helper `has_role(role[])`, RLS policies.
- [x] **0.4** (implementer) Auth: email + password and magic link, session via Better Auth, proxy guarding routes, company switcher if user has >1 membership.
- [x] **0.5** (implementer) `audit_log` table + generic trigger function (append-only, rejects UPDATE/DELETE).
- [x] **0.6** (implementer) App shell: office sidebar, field bottom bar, empty pages, es-AR dictionary.
- [x] **0.7** (tester) Vitest + Playwright + `pnpm test:db` (Vitest against Postgres) wired; RLS test for companies/memberships; e2e login.
- [x] **0.8** (implementer) CI (GitHub Actions): lint, typecheck, unit, db tests. Seed script with 2 demo companies.

## Notes
- Active company for multi-membership users: `user_settings.active_company_id` (see spec/data-model.md#Tenancy).
- CI runs DB tests and e2e against a Postgres 17 service container.
- Moved from Supabase to Neon + Better Auth (free-tier project limit). Migrations rewritten in place: none had been applied outside local dev.
- Magic link replaced by a 6-digit email OTP (Better Auth `emailOTP`): scanners/preview bots consume one-shot links and links need a stable origin; a code works on any device and Vercel preview URL.
- Guest login (`anonymous` plugin, migration `anonymous_users`) is a temporary demo feature behind `GUEST_LOGIN_ENABLED` + `GUEST_COMPANY_ID`; remove before onboarding real customers.

## Acceptance
- User of company A cannot read company B rows (test proves it).
- `audit_log` UPDATE/DELETE fails (test proves it).
- Login → shell renders in light and dark, mobile and desktop.
- CI green.
