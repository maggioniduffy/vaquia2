# Phase 4 — Findings + corrective actions

**Goal:** every problem detected becomes an owned action that gets closed with evidence and approval.
**Refs:** spec/workflow.md (Corrective action states, Escalation) · spec/automations.md#Supporting · spec/data-model.md#Findings & actions

## Tasks
- [ ] **4.1** (implementer) Migrations: `findings`, `corrective_actions`; view `actions_with_overdue`.
- [ ] **4.2** (implementer) Finding sources: manual (from any record detail), from an ATS hazard flagged "requires action", from a warn/block evaluation (one click "crear hallazgo").
- [ ] **4.3** (implementer) `[test-now]` Action flow: assign owner + due date + criticality → owner uploads evidence (photo required) → `pending_approval` → HSE approves/rejects with comment. State machine in one pure module (tested by `tester`).
- [ ] **4.4** (implementer) Field view "Mis acciones" (owner) + office board/table (HSE) with filters and overdue dot.
- [ ] **4.5** (implementer) Hourly job (pg_cron → Edge Function) detecting overdue transitions; writes to `notifications` (sending wired in phase 5).
- [ ] **4.6** (tester) State machine tests (illegal transitions rejected), evidence required, overdue detection at boundary times (ART timezone).

## Acceptance
- Full cycle: finding → action → evidence offline → sync → approve → closed.
- Rejected action returns to owner with comment.
- Overdue detection respects America/Argentina/Buenos_Aires.
