# Phase 2 — Field capture (toolbox talk + ATS), offline

**Goal:** a supervisor with no signal creates a toolbox talk or ATS, collects signatures, and it reaches the server intact when signal returns.
**Refs:** spec/workflow.md#Record states · spec/architecture.md#Offline sync · spec/data-model.md#Records · spec/forms.md · spec/design.md#Layout

## Unknowns → researcher
- [ ] Serwist precache + runtime caching for App Router routes needed offline.
- [ ] Background Sync API support on Android Chrome / iOS Safari (fallback: sync on `online` + app open).

## Tasks
- [ ] **2.1** (implementer) Migrations: `record_types` (with `company_id?`), `form_schemas`, `records`, `record_participants`, `signatures`, `attachments`. Status enum per spec/workflow.md#Record states.
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
