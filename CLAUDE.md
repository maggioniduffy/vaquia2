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
| `researcher` | OpenCode CLI (haiku wrapper) | Look up docs/APIs, probe endpoints, inventory files, summarize long outputs |
| `tester` | OpenCode CLI (haiku wrapper) | Write and run tests, long repetitive edits, fixtures, seed data |
| `implementer` | sonnet | Features and fixes within an approved plan |
| `reviewer` | opus | Independent review at the end of each phase (fresh eyes, no prior context) |

`researcher` and `tester` are thin haiku wrappers that hand the work to `opencode run` with the `vaquia-researcher` / `vaquia-tester` agents in `opencode.json` (model `opencode/deepseek-v4.1-flash-free`, free OpenCode Zen tier, zero retention and no training per opencode.ai/docs/zen; `.env*` reads denied, tester cannot commit/push/reset). They return only OpenCode's final answer. Give them paths, never file contents or secrets. Do not switch to a free model that may train on data (Big Pickle, MiMo, Nemotron); never send customer data.

Rules:
- One implementer task = one coherent change with clear acceptance criteria and file paths.
- Run independent agents in parallel when tasks don't touch the same files.
- **Tests run once per phase, not per task.** During tasks: only `pnpm lint && pnpm typecheck`. After the last implementer task: `tester` writes the phase's tests (from Acceptance + RLS for new tables) and runs the full suite → fixes (implementer) until green → `reviewer` → final fixes.
- **Exception `[test-now]`:** tasks marked so in the phase file (silent-failure cores: sync, rules evaluator, state machines, KPI math, period locking) get their unit/db tests from `tester` right after the task, before the next task starts. These tests count toward the end-of-phase suite.
- Report agent results to the user in 1–3 lines; don't dump their output.
- **Design review first:** in phases touching auth, permissions, RLS, security definer functions or shared triggers, `reviewer` reviews the plan + schema/migration design *before* the implementer starts (threat model, abuse cases, every table a shared trigger touches). The end-of-phase review still runs.
- **Tests:** before running a new or changed test, read it and its fixtures and check its preconditions hold (right user/persona, state it assumes absent really is, selectors match the UI). Include this in every `tester` brief.
- **Diagnosing failures:** `tester` (OpenCode) writes and runs tests; when a test fails and the cause isn't obvious from the output, the investigation goes to `implementer` (sonnet), not to `tester`.
- **One track at a time:** new requests that arrive mid-phase go to a later phase or the backlog unless the user marks them urgent. Commit each agent's work as soon as it reports.

## Conventions
- TypeScript strict. Code, identifiers, commits, docs: **English**. UI copy: **Spanish (es-AR)**, only in `src/i18n/es-AR.ts`.
- Server is authoritative; client validation is UX only.
- Every tenant table has `company_id` + RLS. Every new table gets an RLS test (written in the phase's test task).
- Every new tenant business table gets the `app.assert_company_writable()` trigger (expired trials are read-only).
- Append-only tables (`audit_log`, `rule_evaluations`, `notifications`, `period_snapshots`, `exports`): no UPDATE/DELETE, ever.
- Locked records are never edited — corrections are amendment records.
- Migrations: plain SQL with dbmate (`db/migrations`, `-- migrate:up` / `-- migrate:down`). Never edit an applied migration.
- **Databases:** development (local and Claude Code cloud sessions) uses only a local Postgres. Neon is production: it is migrated only by `.github/workflows/migrate.yml` after merging to `main`. `scripts/dbmate.mjs`, `test:db` and `test:e2e` refuse non-local `DATABASE_URL` outside GitHub Actions — never work around that guard.
- **Migration gate:** every DB change passes `pnpm db:verify` (fresh migrate, rollback + re-up of the latest, full `test:db`) before commit. Migrations not yet merged to `main` may be fixed in place (re-run `db:verify`); after merge, only new migrations. Write the DB test that exercises the change (including INSERT/UPDATE/DELETE on *every* table a shared trigger/function touches) first. This overrides "tests once per phase" for DB changes.
- Shared plpgsql trigger functions: never write `old.col`/`new.col` for a column only some tables have (plpgsql resolves the field even inside a false `and`); read it via `to_jsonb(new) ->> 'col'` or a nested `if tg_table_name = ...`.
- Aim for one migration per coherent change; plan the schema in the phase plan so fixes don't need follow-up migrations.
- Tenant data access only through `withUser()` (`src/lib/db`): it runs as the `authenticated` role so RLS applies. The bare pool is the table owner and bypasses RLS — Better Auth and scripts only.
- Every new table: explicit `grant` to `authenticated` (no default privileges).
- UI follows `docs/spec/design.md`: greys + teal accent for actions/focus/selection; red/amber only as dots or thin borders.
- Commits: Conventional Commits. Small and per task.

## Commands
- `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e`
- `docker compose up -d` (local Postgres; `.env.local` → `DATABASE_URL=postgres://postgres:postgres@localhost:5432/vaquia?sslmode=disable`, then `pnpm db:reset`. Cloud sessions without Docker: install Postgres 17 in the environment setup script, same URL) · `pnpm db:migrate` · `pnpm db:reset` (local only) · `pnpm db:seed` · `pnpm db:new <name>` · `pnpm test:db` · `pnpm db:verify` (local migrate + rollback + DB tests; required before any Neon migrate)

## Cost awareness
Prefer free tiers and boring tech. Flag any new paid service before adding it.
