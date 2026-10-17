# Billing — tiers and Mercado Pago subscriptions

Status: **planned** (phase 1c). Today only the trial exists (`companies.plan`, `trial_ends_at`, `VQ001` read-only trigger — see data-model.md#Tenancy) and `paid` is set manually with `pnpm company:plan`.

## Tiers
Source of truth: `src/lib/billing/tiers.ts` (the landing reads it). Prices are **illustrative**, ARS, without IVA.

| Tier | Active field staff | Monthly | Annual (10 × monthly) |
|---|---|---|---|
| `base` | up to 25 | $ 95.000 | $ 950.000 |
| `pro` | up to 100 | $ 220.000 | $ 2.200.000 |
| `premium` | unlimited | $ 420.000 | $ 4.200.000 |

- Every tier includes all modules. Premium adds voice + AI (phase 9, "próximamente" until then) and priority support.
- "Active field staff" = `personas` with `active = true` in the company.
- Over the limit: creating, importing or reactivating active personas is blocked with a clear message (server-side). Existing data, field capture, closes and exports are never blocked by the limit.
- Annual = 2 months free. Prices change via new Mercado Pago plans; existing subscriptions get their amount updated (notify admins beforehand).

## Lifecycle
1. **Onboarding:** the wizard gets a step "Elegí tu plan" (preselected from the landing's `/signup?plan=<tier>`). Company starts `plan = 'trial'`, `tier = <chosen>`, `trial_ends_at = now() + 30 days`.
2. **Trial:** the current tier's limit applies. The admin can switch tier any time, as many times as wanted, from `/settings/billing` — no charge, and switching **never** changes `trial_ends_at` (the 30 days belong to the company). Each switch is audited.
3. **Last 7 days:** the trial banner adds "Elegí cómo pagar" → `/settings/billing`.
4. **Pay:** admin confirms tier + interval (`monthly | annual`) → Mercado Pago checkout → webhook `authorized` → `plan = 'paid'`.
5. **Day 30 without payment:** read-only (existing `VQ001`). Paying later re-activates immediately.
6. **After paying:** tier/interval changes update the Mercado Pago subscription (new amount from the next charge). Downgrading below the current active staff is allowed; adding staff stays blocked until under the limit.
7. **Payment failed / cancelled:** grace period (7 days, banner) then read-only.

## Data model (to implement in 1c)
| Table / column | Notes |
|---|---|
| `companies.tier` | `base | pro | premium`, not null for new companies |
| `companies.billing_interval` | `monthly | annual`, null during trial |
| `subscriptions` | company_id, mp_preapproval_id (unique), tier, interval, status (`pending | authorized | paused | cancelled`), amount_ars, next_payment_at. RLS: admin reads; writes only by the webhook (owner) |
| `billing_events` | append-only: raw Mercado Pago notification, mp_id (unique → idempotency), type, received_at |

`plan` stays `trial | paid | demo`; the webhook is the only writer of `paid` (besides the ops script).

## Mercado Pago
- Suscripciones API: one `preapproval_plan` per tier × interval; one `preapproval` per company; redirect to Mercado Pago checkout (`init_point`), back to `/settings/billing`.
- Webhook `POST /api/billing/webhook` (not under `/api/auth`): verify `x-signature` (HMAC with the webhook secret), store in `billing_events`, fetch the preapproval from the API (never trust the payload), update `subscriptions` + `companies.plan`. Idempotent by notification id. Topics: `subscription_preapproval`, `subscription_authorized_payment`.
- Env: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`. Sandbox with test users.
- Cost: no fixed fee; Mercado Pago charges a commission per payment.

## Open questions (researcher, before 1c)
- Annual frequency in `preapproval` (12 months) vs. a one-off payment for annual.
- Price updates on existing preapprovals (limits, user notification rules).
- Factura electrónica (AFIP) and IVA: Mercado Pago doesn't invoice; likely a separate provider.
