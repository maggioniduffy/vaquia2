# Architecture

## Shape
Single PWA (Next.js on Vercel) for office (desktop) and field (mobile, offline) + Supabase (Postgres, RLS, Auth, Storage). Scheduled jobs: `pg_cron` → Supabase Edge Functions (not Vercel cron).

```
PWA (Next.js)
 ├─ app/(office)  dashboards, review, config
 ├─ app/(field)   capture, offline → Dexie (IndexedDB) + outbox
 └─ server actions / route handlers → Supabase
                                       ├─ pg_cron → Edge Functions (A1, A2, escalation, notifications)
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
| Schemas | Zod, one per `record_type@version`, shared client/server |
| Offline | Serwist + Dexie |
| Rules | json-logic-js |
| PDF / XLSX | @react-pdf/renderer / exceljs |
| Email | Resend |
| Tests | Vitest, Playwright, `supabase test db` |
| Hosting | Vercel (**Pro once billing customers; Hobby is non-commercial**) + Supabase |

## Offline sync
- UUIDv7 generated on client; idempotent upsert by id.
- Outbox: blobs (signatures, photos) upload first, record references storage paths after.
- One author per draft → conflicts rare. If server is newer, keep client version as conflict copy for HSE. Never overwrite silently.
- Never delete local data until server confirms.
- Persistent "N pendientes" indicator; device heartbeat so HSE sees stale devices.
- Background Sync where supported; fallback sync on `online` event + app open.

## Security & tenancy
- `company_id` on every tenant row; RLS via `current_company_id()` and `has_role(role[])`.
- Append-only (`audit_log`, `rule_evaluations`, `notifications`, `period_snapshots`, `exports`): `reject_mutation()` trigger rejects UPDATE/DELETE/TRUNCATE for every role; inserts via functions.
- Audit: attach `audit_row()` (AFTER INSERT/UPDATE/DELETE) to every tenant table; diff = `{new}` / `{old}` / `{col: {old,new}}`.
- Private storage buckets, signed URLs.
- TLS + Supabase encryption at rest. Region: confirm with pilot (São Paulo closest).
- Signatures: store signer, timestamp, geo, hash of signed content (firma electrónica, Ley 25.506).

## Language
Code/identifiers/commits/docs: English. UI copy: es-AR, only in `src/i18n/es-AR.ts`.
