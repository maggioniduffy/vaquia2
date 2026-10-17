# Phase 1 — People, crews, locations, qualifications

**Goal:** the company's people and their qualifications are in the system and anyone can see who is fit for which task.
**Refs:** spec/workflow.md#Roles · spec/automations.md#A1 (inputs) · spec/domain.md#Qualification seed list · spec/data-model.md (People & places, Qualifications)

## Tasks
- [x] **1.1** (implementer) Migrations: `operators` (global, seeded), `locations`, `crews`, `personas`, `qualification_types` (global seed + company custom), `qualifications`, `task_types`, `task_requirements`. RLS + audit triggers.
- [x] **1.2** (implementer) View `qualification_status` → `valid | expiring (≤30d) | expired | missing` per persona × required type.
- [x] **1.3** (implementer) Office CRUD: personas, crews, locations (table + sheet form, no extra pages).
- [x] **1.4** (implementer) Qualifications per persona: add/renew with file upload (`src/lib/storage`: local disk in dev, private R2 in prod; downloads via an authenticated route; file optional until R2 is set up). Renewal = new row, old kept.
- [x] **1.5** (implementer) CSV import for personas and qualifications: preview, row-level errors, commit. Template CSV downloadable.
- [x] **1.6** (implementer) "Personal apto / no apto" screen: filter by crew, location, task type; status dots.
- [ ] **1.7** (implementer) Link persona ↔ membership (invite user from persona).
- [ ] **1.8** (tester) RLS tests for all new tables; unit tests for status view edge cases (expires today, no expiry, renewed); import fixture with 200 rows incl. bad rows.

## Acceptance
- Import 200 personas + qualifications from CSV with clear errors for bad rows.
- Apt/not-apt screen correct for a task requiring 2 qualifications when one is expired.
- Renewing a qualification keeps history.
