# Phase 8 — A3: operator export

**Goal:** the approved month leaves in the operator's exact format, with no retyping.
**Refs:** spec/automations.md#A3 · spec/domain.md#KPIs (base) · spec/forms.md#Downstream · ask the user for the pilot operator format

## Prerequisite (business)
- [ ] Real filled example of the pilot operator's report (XLSX/PDF). **Blocker: don't start 8.3 without it.**

## Tasks
- [ ] **8.1** (implementer) Migrations: `export_templates` (versioned), `exports` (append-only).
- [ ] **8.2** (implementer) Mapping engine: template JSON → output. Supports: sheet/column mapping from snapshot paths, static cells, number formats, kpi_base override, per-crew row expansion. Formats: XLSX (`exceljs`), CSV, PDF (section order).
- [ ] **8.3** (implementer) First template replicating the pilot operator's file.
- [ ] **8.4** (implementer) Required-field validation before generating; clear errors. Validate custom field references per spec/forms.md (record type code + key exist in every schema version in the period).
- [ ] **8.5** (implementer) Export screen: only `approved` periods; choose template; download; history with hash and author.
- [ ] **8.6** (tester) Golden-file test: fixture snapshot → generated XLSX equals the real operator example cell by cell; template version change doesn't affect past exports. The fixture template maps one custom field.

## Acceptance
- Generated file matches the operator example cell by cell for fixture data.
- Adding a second template requires zero code changes.
