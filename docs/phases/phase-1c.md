# Phase 1c — Billing: tiers + Mercado Pago

**Goal:** a company picks a tier in onboarding, switches freely during the 30-day trial, and pays monthly or annually with Mercado Pago before the trial ends; payment state drives read-only.
**Refs:** spec/billing.md · spec/data-model.md#Tenancy · spec/architecture.md#Auth

## Unknowns (researcher)
- [ ] Mercado Pago Suscripciones: annual frequency, price updates on existing preapprovals, sandbox test users, `x-signature` verification.
- [ ] Factura electrónica (AFIP): provider options and cost (flag before adding).

## Tasks
- [ ] **1c.1** (implementer) Migration: `companies.tier`, `companies.billing_interval`, `subscriptions`, `billing_events` (append-only) + RLS, grants; backfill existing companies (`paid`/`demo` → `pro`).
- [ ] **1c.2** (implementer) `[test-now]` Active-staff limit per tier, enforced server-side (DB) on create/import/reactivate personas; never blocks capture/close/export.
- [ ] **1c.3** (implementer) Onboarding step "Elegí tu plan" (preselected from `/signup?plan=`, validated against `TIERS`), passed to `create_company`.
- [ ] **1c.4** (implementer) `[test-now]` Tier switching during trial from `/settings/billing` (admin, audited, never touches `trial_ends_at`).
- [ ] **1c.5** (implementer) `/settings/billing`: current tier, usage vs limit, days left, choose interval, Mercado Pago checkout.
- [ ] **1c.6** (implementer) `[test-now]` Webhook `/api/billing/webhook`: signature, idempotency, state machine (`pending → authorized → paused/cancelled`, grace 7 days) → `companies.plan`.
- [ ] **1c.7** (implementer) Trial banner CTA "Elegí cómo pagar" in the last 7 days; grace banner on failed payment.
- [ ] **1c.8** (tester) RLS for new tables, limit + switching + webhook tests, e2e onboarding with tier.
- [ ] **1c.9** (reviewer) Phase review (webhook trust boundary, money paths).

## Acceptance
- Tier chosen in onboarding; switching tiers during the trial never changes `trial_ends_at`.
- Base company cannot create the 26th active persona; capture keeps working.
- Sandbox payment turns the company `paid`; a replayed webhook changes nothing; a forged signature is rejected.
- Expired trial without payment is read-only; paying re-activates it immediately.
