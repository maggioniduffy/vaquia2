# Phase 3 — Validation engine (Layer 1) + audit

**Goal:** bad records are stopped or flagged at capture, with an explanation, and every evaluation is traceable.
**Refs:** spec/rules-engine.md · spec/workflow.md#Record states · spec/data-model.md#Validation & audit

## Tasks
- [ ] **3.0** (implementer) Detailed styling consistent with our design guidelines across dropdown menus..
- [ ] **3.1** (implementer) Migrations: `rules` (versioned), `rule_evaluations`, `alert_feedback` (append-only where noted).
- [ ] **3.1b** (implementer) PPE catalogue: global seeded PPE items (casco, botines de seguridad, guantes, anteojos, protección auditiva, ropa ignífuga, arnés…) + company-own items (`company_id?`, global-or-own like task types), and required PPE per task type. Admin screen to add company items and set each task type's required PPE. Include PPE in `/api/sync/reference` and fill `ppeItems` in `buildReferences` (replaces the phase-2 "Sin EPP específico" fallback, spec/forms.md). Needed by 3.4.
- [ ] **3.2** (implementer) `[test-now]` Engine `src/rules/`: evaluate json-logic rules against a normalized record context (record + participants + their qualification status + task requirements). Pure function, same code client/server. Output: `{ruleCode, version, result, severity, explanation}`.
- [ ] **3.3** (implementer) Explanation templates with variables (`{persona}`, `{qualification}`, `{expires_on}`) → es-AR strings.
- [ ] **3.4** (implementer) Seed rules: missing signature of a participant; signer lacks valid qualification required by task type (block); required PPE unchecked for task type (warn); ATS without at least one hazard/control (block); talk with < 2 attendees (warn).
- [ ] **3.5** (implementer) Server: on submit → evaluate → persist evaluations → set `blocked`/`accepted`. Client: live preview while filling, block banner prevents finishing, warn requires ack.
- [ ] **3.6** (implementer) "Falso positivo" + ack buttons on each alert → `alert_feedback`.
- [ ] **3.7** (implementer) Admin: list rules, toggle active, edit message/severity (creates new version). Logic editing of global rules stays code/seed; no-code rules on company fields arrive in phase 3b.
- [ ] **3.8** (tester) Table-driven tests per rule; test that old evaluations keep their rule version after edit; append-only tests.

## Acceptance
- Persona with expired "Trabajo en altura" cannot sign an altura ATS; message names who/what/when.
- Editing a rule never alters past evaluations.
- Client and server give identical results for the test fixtures.
