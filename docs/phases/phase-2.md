# Phase 2 — Field capture (toolbox talk + ATS), offline

**Goal:** a supervisor with no signal creates a toolbox talk or ATS, collects signatures, and it reaches the server intact when signal returns.
**Refs:** spec/workflow.md#Record states · spec/architecture.md#Offline sync · spec/data-model.md#Records · spec/forms.md · spec/design.md#Layout

## Unknowns → researcher
- [x] Serwist precache + runtime caching for App Router routes needed offline. → `@serwist/turbopack` (Turbopack supported, no webpack switch): `withSerwist()` in next.config, `app/sw.ts` with `defaultCache` + `/~offline` document fallback, SW served by a `createSerwistRoute` route handler (exempt it from the auth guard in `src/proxy.ts`). Field pages are visited online once (login) and served NetworkFirst from cache offline; capture screens are client shells over Dexie. Source: serwist.pages.dev/docs/next/turbo.
- [x] Background Sync API support on Android Chrome / iOS Safari (fallback: sync on `online` + app open). → Android Chrome: yes; iOS Safari: no (not even installed PWAs), no guaranteed upload after the page closes. One Dexie-owned ordered outbox; the app retries on startup, `visibilitychange` → visible and `online`; `sync.register()` only as an optional Chrome wake-up. Serwist's BackgroundSyncQueue is not the outbox (transport failures only). Sources: caniuse.com/background-sync, serwist.pages.dev/docs/serwist/guide/background-syncing.

## Tasks
- [x] **2.1** (implementer) Migrations: `record_types` (with `company_id?`), `form_schemas`, `records`, `record_participants`, `signatures`, `attachments`. Status enum per spec/workflow.md#Record states.
- [ ] **2.2** (implementer) `[test-now]` Forms as data (spec/forms.md): meta-schema, DSL → Zod compiler in `src/forms/` (shared client/server), generic field renderer. Seed `toolbox_talk@1` and `ats@1` as global `form_schemas` rows.
- [ ] **2.3** (implementer) Offline layer: Dexie DB (drafts, outbox, blobs), cached reference data (personas, crews, task types, qualifications status) refreshed on login/online.
- [ ] **2.4** (implementer) `[test-now]` Sync engine: outbox, UUIDv7 ids, idempotent upsert endpoint, blobs first then record, conflict copy (never overwrite), retry with backoff. `SyncIndicator` component.
- [ ] **2.5** (implementer) Toolbox talk form (seed schema + attendees widget): topic, crew, location (auto from crew), attendees picker, notes, signatures (SignaturePad per attendee), auto geo + timestamp.
- [ ] **2.6** (implementer) ATS form (seed schema + steps → hazards → controls group widget): task type, steps → hazards → controls (repeatable), required PPE checklist, participants, signatures.
- [ ] **2.7** (implementer) Office: records list (filters: type, crew, date, status) + read-only detail.
- [ ] **2.8** (tester) e2e with network offline → create → online → assert server record + signatures; duplicate submit = one record; unit tests for the compiler and both seed schemas (render, validate, version pinning).

## Acceptance
- Airplane-mode e2e passes; no data loss on app reload while offline.
- Double-submit produces one record.
- Forms usable one-handed on a 360px screen.
