# Phase 1b — Self-serve sign up, company creation, onboarding, trial

**Goal:** a new customer signs up alone (Google or email code), creates their company and lands on a guided dashboard, on a 30-day trial that turns read-only when it expires.
**Refs:** spec/architecture.md#Auth · spec/data-model.md#Tenancy · spec/landing.md#CTAs · spec/design.md

## Decisions
- Open sign-up (OTP + Google). Google for every user; invited users link by email.
- Sign-up only for users with zero memberships; guests cannot create companies.
- Wizard: my persona (name, DNI) → company (name, CUIT with check digit). Duplicate CUIT is blocked with a "ask your admin" message that does not reveal the admin.
- Plan `trial | paid | demo`, `trial_ends_at`. Expired trial = read-only, enforced in the DB (trigger, SQLSTATE `VQ001`). Payment out of scope: `paid` is set manually via script until phase 1c (tiers + Mercado Pago, spec/billing.md).
- Guest/demo stays; landing gets "Crear cuenta" as primary CTA.

## Tasks
- [x] **1b.1** (implementer) `[test-now]` Migration: `plan` check + `trial_ends_at`, `company_writable()`, `app.assert_company_writable()` trigger on every business tenant table (append-only system tables exempt).
- [x] **1b.2** (implementer) `[test-now]` Migration `create_company(name, cuit, full_name, dni)` (security definer) + `app.cuit_valid`; `src/lib/cuit.ts` with the same algorithm.
- [x] **1b.3** (implementer) Auth: open OTP sign-up, Google provider + account linking (env-gated), Google button on `/login`, `/signup` page.
- [x] **1b.4** (implementer) `/onboarding` wizard + `createCompany` action + redirects for zero-membership users.
- [x] **1b.5** (implementer) Dashboard onboarding checklist, trial banner (office + field), `VQ001` → read-only message in action error handlers.
- [x] **1b.6** (implementer) Landing CTAs + `scripts/company-plan.ts` (`pnpm company:plan <cuit> paid|trial [--days N]`).
- [ ] **1b.7** (tester) DB tests (trigger, `create_company`), unit tests `cuit.ts`, e2e OTP sign-up → wizard → checklist.
- [ ] **1b.8** (reviewer) Phase review: auth surface, security definer function, trigger coverage.

## Acceptance
- A new email (OTP) or Google account with no membership lands on `/onboarding`, creates company + persona, becomes admin on a 30-day trial.
- Invalid CUIT blocked client and server; duplicate CUIT shows the "pedile acceso" message.
- A user with a membership, or a guest, cannot call `create_company`.
- An invited user signing in with Google with the invited email gets their existing membership.
- With `trial_ends_at` in the past every business write fails with `VQ001`, the UI shows the read-only message, reads still work; `paid`/`demo` unaffected.
- The checklist ticks itself as data is added and can be hidden.
