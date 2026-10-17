# Plan — phase index

Read only the current phase file. Status: `todo` · `doing` · `review` · `done`.

| # | Phase | File | Status |
|---|---|---|---|
| 0 | Foundations: repo, auth, tenancy, RLS, design system, CI | `phases/phase-0.md` | done |
| 1 | People, crews, locations, qualifications | `phases/phase-1.md` | done |
| 2 | Field capture: toolbox talk + ATS, offline, signatures | `phases/phase-2.md` | todo |
| 3 | Validation engine (Layer 1) + audit log | `phases/phase-3.md` | todo |
| 3b | Company forms: builder, extensions of charla/ATS, field rules | `phases/phase-3b.md` | todo |
| 4 | Findings + corrective actions | `phases/phase-4.md` | todo |
| 5 | **A1** qualification expiry alerts + notifications | `phases/phase-5.md` | todo |
| 6 | Man-hours, incidents, KPIs | `phases/phase-6.md` | todo |
| 7 | **A2** monthly close + automatic report | `phases/phase-7.md` | todo |
| 8 | **A3** operator export | `phases/phase-8.md` | todo |
| 9 | Voice + LLM (Layer 3) — post-pilot | `phases/phase-9.md` | todo |

**Current phase:** 2

## Phase protocol
1. Opus reads the phase file and plans the task breakdown (plan mode → user approves).
2. `researcher` resolves unknowns flagged in the phase.
3. `implementer` executes tasks (parallel when files don't overlap). After a `[test-now]` task, `tester` covers that module before moving on.
4. **End of phase only:** `tester` writes all tests for the phase and runs the full suite; implementer fixes failures until green.
5. `reviewer` reviews the phase diff. Fix blockers/majors.
6. Tick tasks, set status `done`, advance **Current phase**.

## Backlog (post-MVP, not planned yet)
Work permits (PT), LOTO, PPE/equipment inspections, observation cards, near-miss report form, investigation templates (cause tree, 5 Whys, ICAM), events map, Layer 2 stats, Layer 4 correlations, operator APIs, WhatsApp channel.
