# Phase 3b — Company forms

**Goal:** an admin builds the company's own forms (or adds fields to charla/ATS), attaches block/warn rules to those fields, and supervisors fill them offline like any built-in form.
**Refs:** spec/forms.md · spec/rules-engine.md#Company rules (phase 3b) · spec/data-model.md#Records · spec/design.md

Builds on phase 2 (forms as data, renderer, sync) and phase 3 (rules engine). Numbered 3b so phases 4–9 keep their numbers.

## Unknowns
- [ ] The form builder is not in the design bundle (docs/design/vaquia-2). Get a design pass (office editor + 390px live preview) before 3b.3, or build it from design.md components only.

## Tasks
- [ ] **3b.1** (implementer) Migrations: company rows for `record_types`, `form_schemas` (company + extension kinds, publish/retire), `rules.company_id`. RLS: admin writes, members read published, global rows read-only. Enforce one published version per type × kind × company and immutability of published rows.
- [ ] **3b.2** (implementer) `[test-now]` Meta-schema rules for company forms. Extensions only append `x_` keys and never touch core fields. Key reuse across versions is rejected. Limits from spec/forms.md#Limits.
- [ ] **3b.3** (implementer) Office form builder (admin): types list; section/field editor for every field type; `visibleIf` editor; live 390px preview with the field renderer; save draft, publish, retire; version history (read-only past versions).
- [ ] **3b.4** (implementer) Extension editor for charla/ATS: core fields shown locked, company sections/fields appended.
- [ ] **3b.5** (implementer) `[test-now]` Rule builder for company fields (comparison, range, required-if, checklist unchecked, yes/no = no) → json-logic, severity, `{label}` message template; preview against a sample payload. New version on every edit.
- [ ] **3b.6** (implementer) Field app: company types on "Hoy" and capture; schemas, extensions and company rules cached offline; drafts pinned to their versions; server accepts any version published when the draft started.
- [ ] **3b.7** (tester) RLS tests for the new rows/columns; compiler + meta-schema table tests; e2e: build form → add rule → fill offline → blocked with explanation → sync.

## Acceptance
- An admin creates "Check-list de camioneta" with a rule "presión < 150 bloquea". A supervisor fills it offline, is blocked with "Presión de neumáticos 120 psi: por debajo de 150", fixes it and syncs.
- An admin adds an `x_` field to charla. New charlas include it; old charlas render exactly as captured.
- Publishing a new version never changes past records or past rule evaluations.
- Company A's forms and rules are invisible to company B (test proves it).
