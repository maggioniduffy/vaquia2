# Phase 7 — A2: monthly close + automatic report

**Goal:** the month closes itself into a draft; HSE reviews, manager approves, data freezes.
**Refs:** spec/automations.md#A2 · spec/workflow.md#Period states · spec/data-model.md#KPIs & periods

## Tasks
- [ ] **7.1** (implementer) Migrations: `periods`, `period_snapshots` (append-only). Period state machine module.
- [ ] **7.2** (implementer) Job on `companies.settings.report_day` (default 1): open close for previous month → build draft JSON (KPIs, incidents, open/overdue actions, qualification snapshot, 3-month trend).
- [ ] **7.3** (implementer) Completeness checklist: missing HH, records `pending_sync` > 48h (from device heartbeat), unresolved blocks, unclassified incidents. Each item links to where it's fixed. Regenerate draft button.
- [ ] **7.4** (implementer) Review screen (HSE): draft preview, narrative/comment field, submit. Approval screen (manager): approve / return with comment. Notifications via phase 5.
- [ ] **7.5** (implementer) `[test-now]` On approve (single DB transaction): snapshot (kpis + record_ids + SHA-256 of canonical JSON) → lock period records → render PDF (`@react-pdf/renderer`, minimal layout) → store path + hash.
- [ ] **7.6** (implementer) `[test-now]` Locked enforcement: DB trigger rejects updates to records in approved periods; amendment record flow (new record with `amends_record_id`).
- [ ] **7.7** (tester) Full close e2e; attempt edit of locked record fails; snapshot hash stable for same data; PDF generated.
- [ ] **7.8** (reviewer, extra) Review locking + snapshot transaction specifically.

## Acceptance
- From seed data: job → draft → HSE submit → manager approve → period locked, PDF with hash.
- Late-synced record dated in a locked period goes to an "pendiente de enmienda" queue, not silently into the closed month.
