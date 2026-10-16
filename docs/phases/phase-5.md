# Phase 5 — A1: qualification expiry alerts + notification infra

**Goal:** nobody is surprised by an expired qualification; notifications are useful, grouped and never duplicated.
**Refs:** spec/automations.md#A1 · spec/workflow.md#Escalation · spec/data-model.md#Notifications

## Unknowns → researcher
- [ ] Resend free tier limits + Supabase Edge Function usage pattern.
- [ ] Web Push from Edge Functions (VAPID lib compatible with Deno). iOS installed-PWA requirements.

## Tasks
- [ ] **5.1** (implementer) Migrations: `notifications` (dedupe_key unique), `push_subscriptions`; per-user channel preferences in membership settings.
- [ ] **5.2** (implementer) Notification service: `enqueue(kind, recipients, payload, dedupeKey)`; dispatcher Edge Function sends by channel (in-app always, email, push); retries; marks `sent_at`.
- [ ] **5.3** (implementer) In-app inbox (bell → list, mark read). Minimal.
- [ ] **5.4** (implementer) Daily job 06:00 ART: qualifications at 30/15/7/0 days → status update → enqueue per spec/workflow.md#Escalation → **one digest per recipient** (email template, plain and minimal).
- [ ] **5.5** (implementer) Wire phase 4 overdue escalation + record-blocked events into the same service.
- [ ] **5.6** (implementer) Push subscribe flow (prompt only after install / explicit opt-in).
- [ ] **5.7** (tester) Job run twice same day → no duplicate sends; digest groups N items into 1 email; timezone boundary tests; email rendering snapshot.

## Acceptance
- Seed with qualifications expiring at each threshold → exactly the expected digests, once.
- Expired qualification immediately reflected in apt/not-apt and in phase 3 rule.
