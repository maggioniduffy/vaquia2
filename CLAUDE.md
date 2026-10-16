# Vaquia — Claude instructions

HSE platform for oilfield service SMEs (Neuquén). PWA: Next.js 16 + Postgres (Neon) + Better Auth.

## Context loading (keep context small)
1. Read `docs/PLAN.md` (phase index + status). **Do not** read all phases.
2. Read only the current `docs/phases/phase-X.md`.
3. Open only the `docs/spec/*.md` files listed in the phase's **Refs** line. Each is small and single-topic.
4. **Do not read `docs/OVERVIEW.md`** — it is for humans (vision, business, open questions). Only open it if the user asks.
5. Never paste large files into a subagent prompt — give it paths.
6. If a spec is wrong or outdated, fix the spec in the same change (specs are the source of truth, not the code comments).

## Working mode
- **Start every task in plan mode** (default in `.claude/settings.json`). Present the plan, wait for approval.
- Skip planning only if the user says so explicitly ("sin plan", "directo", "no plan").
- After a phase task is done: tick it in the phase file, update `docs/PLAN.md` status line. Nothing else.

## Delegation
The main session (Opus) plans, analyzes, reviews and orchestrates. It does not write bulk code.

| Agent | Model | Use for |
|---|---|---|
| `researcher` | haiku | Look up docs/APIs, probe endpoints, inventory files, summarize long outputs |
| `tester` | haiku | Write and run tests, long repetitive edits, fixtures, seed data |
| `implementer` | sonnet | Features and fixes within an approved plan |
| `reviewer` | opus | Independent review at the end of each phase (fresh eyes, no prior context) |

Rules:
- One implementer task = one coherent change with clear acceptance criteria and file paths.
- Run independent agents in parallel when tasks don't touch the same files.
- **Tests run once per phase, not per task.** During tasks: only `pnpm lint && pnpm typecheck`. After the last implementer task: `tester` writes the phase's tests (from Acceptance + RLS for new tables) and runs the full suite → fixes (implementer) until green → `reviewer` → final fixes.
- **Exception `[test-now]`:** tasks marked so in the phase file (silent-failure cores: sync, rules evaluator, state machines, KPI math, period locking) get their unit/db tests from `tester` right after the task, before the next task starts. These tests count toward the end-of-phase suite.
- Report agent results to the user in 1–3 lines; don't dump their output.

## Conventions
- TypeScript strict. Code, identifiers, commits, docs: **English**. UI copy: **Spanish (es-AR)**, only in `src/i18n/es-AR.ts`.
- Server is authoritative; client validation is UX only.
- Every tenant table has `company_id` + RLS. Every new table gets an RLS test (written in the phase's test task).
- Append-only tables (`audit_log`, `rule_evaluations`, `notifications`, `period_snapshots`, `exports`): no UPDATE/DELETE, ever.
- Locked records are never edited — corrections are amendment records.
- Migrations: plain SQL with dbmate (`db/migrations`, `-- migrate:up` / `-- migrate:down`). Never edit an applied migration.
- Tenant data access only through `withUser()` (`src/lib/db`): it runs as the `authenticated` role so RLS applies. The bare pool is the table owner and bypasses RLS — Better Auth and scripts only.
- Every new table: explicit `grant` to `authenticated` (no default privileges).
- UI follows `docs/spec/design.md`: greys only; color = meaning (danger/warning/success).
- Commits: Conventional Commits. Small and per task.

## Commands
- `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`
- `docker compose up -d` (local Postgres) · `pnpm db:migrate` · `pnpm db:reset` (local only) · `pnpm db:seed` · `pnpm db:new <name>` · `pnpm test:db`

## Cost awareness
Prefer free tiers and boring tech. Flag any new paid service before adding it.
