# Architecture

## Shape
Single PWA (Next.js on Vercel) for office (desktop) and field (mobile, offline) + Postgres on Neon (RLS) + Better Auth (in the Next app) + Cloudflare R2 (files). Scheduled jobs: Vercel Cron → route handlers `/api/cron/*` (protected by `CRON_SECRET`).

```
PWA (Next.js)
 ├─ app/(office)  dashboards, review, config
 ├─ app/(field)   capture, offline → Dexie (IndexedDB) + outbox
 ├─ /api/auth/*  Better Auth (sessions in Postgres)
 ├─ /api/cron/*  scheduled jobs (A1, A2, escalation, notifications) ← Vercel Cron
 └─ server actions / route handlers → withUser() → Postgres (Neon)
                                       ├─ SQL views (KPIs)
                                       └─ append-only tables (triggers)
Notifications: in-app inbox · email (Resend) · web push (VAPID)
Later: STT API · Claude API
```

## Stack
| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TS strict (TS 6.x until typescript-eslint supports 7), pnpm. Auth guard lives in `src/proxy.ts` (Next 16 replacement for middleware). |
| Styling | Tailwind v4 + CSS variables (`docs/spec/design.md`) |
| Primitives | shadcn/ui (Radix) restyled to tokens |
| Client state | Zustand (UI only); server state via RSC + server actions |
| Schemas | Forms are data: JSON form DSL per `record_type@version` (spec/forms.md) compiled to Zod by `src/forms/`, same code client/server |
| Offline | Serwist + Dexie |
| Rules | json-logic-js |
| PDF / XLSX | @react-pdf/renderer / exceljs |
| Email | Resend (needs a verified domain) or any SMTP server (Gmail app password for now); `src/lib/email.ts` |
| Auth | Better Auth: 6-digit email OTP only (`emailOTP`, 5 min, 3 attempts, hashed; no passwords, no magic link), invite-only (`disableSignUp`). Temporary guest sessions (`anonymous` plugin, on unless `GUEST_LOGIN_ENABLED=false`; guests always join the fixed `Empresa Demo` company (`plan = 'demo'`, created by migration; membership is only inserted if that plan matches) as `hse`, but guests cannot upload files or import CSV (checked server-side via `session.isGuest`); login server actions are rate limited via `auth_rate_limits` (`src/lib/rate-limit.ts`); to be removed before real customers). Better Auth's HTTP route accepts POST only for `/sign-out` (allowlist in `src/app/api/auth/[...all]/blocked.ts`, else 404) so sign-in/OTP endpoints cannot bypass those limits; login actions call `auth.api` in-process. Limits are keyed per email and per IP (IP trusted from `x-forwarded-for` only on Vercel); per-email limits let someone lock out a known email for the window — accepted trade-off. Base URL: `BETTER_AUTH_URL`, else `https://$VERCEL_URL` (preview deploys; `VERCEL_URL`/`VERCEL_BRANCH_URL` are trusted origins). Tables `users`, `sessions`, `accounts`, `verifications` |
| DB access | `pg` (node-postgres), raw SQL. Migrations: dbmate |
| Files | Cloudflare R2 (S3 API), private bucket, presigned URLs |
| Tests | Vitest (unit + `db/tests` against real Postgres), Playwright |
| Hosting | Vercel (**Pro once billing customers; Hobby is non-commercial**) + Neon (free tier until pilot; branch per environment) |

## Offline sync
- UUIDv7 generated on client; idempotent upsert by id.
- Outbox: blobs (signatures, photos) upload first, record references storage paths after.
- Published form schemas (base + extensions) and company rules are cached with the reference data; a draft keeps the schema versions it started with (spec/forms.md#Offline).
- One author per draft → conflicts rare. If server is newer, keep client version as conflict copy for HSE. Never overwrite silently.
- Never delete local data until server confirms.
- Persistent "N pendientes" indicator; device heartbeat so HSE sees stale devices.
- Background Sync where supported; fallback sync on `online` event + app open.

## Security & tenancy
- `company_id` on every tenant row; RLS via `current_company_id()` and `has_role(role[])`.
- Request identity: the app connects as the DB owner; `withUser(userId, fn)` opens a transaction, `set local role authenticated` and sets `app.user_id`, read by `app.current_user_id()`. Use Neon's **pooled** URL (transaction pooling keeps `set local` safe).
- Known hardening, later: the app connects as the table owner (RLS relies on `withUser()` discipline). Move the runtime to a non-owner login role that is a member of `authenticated`; keep the owner for migrations/Better Auth/scripts.
- Production migrations (`migrate.yml`) run in parallel with the Vercel deploy: keep every migration backward compatible with the previously deployed code (expand, then contract).
- Cron: Vercel Hobby only allows daily jobs. Hourly escalation (phase 4) needs Vercel Pro, or a GitHub Actions schedule calling the same route as a stopgap.
- Append-only (`audit_log`, `rule_evaluations`, `notifications`, `period_snapshots`, `exports`): `reject_mutation()` trigger rejects UPDATE/DELETE/TRUNCATE for every role; inserts via functions.
- Audit: attach `audit_row()` (AFTER INSERT/UPDATE/DELETE) to every tenant table; diff = `{new}` / `{old}` / `{col: {old,new}}`.
- Private R2 bucket, short-lived presigned URLs; object keys prefixed by `company_id`.
- TLS + Neon encryption at rest. Region: confirm with pilot (São Paulo closest).
- Signatures: store signer, timestamp, geo, hash of signed content (firma electrónica, Ley 25.506).

## Language
Code/identifiers/commits/docs: English. UI copy: es-AR, only in `src/i18n/es-AR.ts`.
