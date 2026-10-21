# UI performance pass
Objective: make navigation and interaction feel fast (server render, DB, service worker, client renders, bundle, assets).
Branch: `perf/ui-responsiveness` · Delivery: ask-on-risk · Runners: `pnpm lint && pnpm typecheck` per unit, `pnpm db:verify` for DB, `pnpm test`/`test:db`/`test:e2e` at the end.
Plan: `~/.claude/plans/la-ui-responde-muy-sharded-pebble.md`

## Specs
- S1 "detectá y eliminá renders innecesarios."
- S2 "reducí el bundle con lazy loading."
- S3 "optimizá requests y caching."
- S4 "encontrá queries lentas y problemas N+1."
- S5 "optimizá imágenes, fuentes y scripts."
- S6 "y lo que consideres" — includes loading states/streaming and service-worker navigation cost.
- S7 Decision: Better Auth session cookie cache, 60 s.
- S8 Decision: enable React Compiler.
- Invariant: RLS visibility per role/guest/author unchanged; offline field capture keeps working.

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T0 baseline (build sizes, EXPLAIN) | S3,S4 | inline | done (EXPLAIN in T4) | — |
| T1 loading.tsx + Suspense | S6 | inline | done | 0ea6e31 |
| T2 service worker scope | S3,S6 | inline | done | 4c2c069 |
| T3 requests & caching (cookieCache, withUser, next/form) | S3,S7 | inline | done | 0bbc30d |
| T4 RLS + views migration | S4 | delegated (implementer), reviewer design review first | done | 9d54782 |
| T5 server N+1 | S4 | inline | done | 4db1dcb |
| T6 single sheet per list | S1 | delegated (implementer), parallel to T4 | done | 440df5e |
| T7 React Compiler + capture form/Dexie renders | S1,S8 | inline | done | f44899a |
| T8 bundle/assets/fonts | S2,S5 | inline | done | e828c65 |

## Log
- L1 (2026-10-20) User: "la UI responde muy lenta: 1) detectá y eliminá renders innecesarios. 2) reducí el bundle con lazy loading. 3) optimizá requests y caching. 4) encontrá queries lentas y problemas N+1. 5) optimizá imágenes, fuentes y scripts. y lo que consideres"
- L2 (2026-10-20) User decisions: cookie cache "Sí, 60 s"; React Compiler "Sí, activarlo".
- L3 Engram mirror: pending (Engram tools not available in this session).
- L4 Baseline client JS (gzip, per route): / 209, people 253, crews 250, records 247, record detail 285, dashboard 248, field 238, capture 283, login 206 KB.
- L5 T4 design review verdict: proceed with conditions (helpers wrapped one by one, alter policy, no memberships_insert, security_invoker views, drift-guard + guest-children + pg_policies catalog tests, replace qualifications index).
- L6 After T1-T8 client JS: / 211, people 228, crews 223, records 218, record detail 260, dashboard 219, field 240, capture 290, login 208 KB (office -10/12%; field +2/7 KB = compiler runtime).
- L7 Skipped on evidence: sync indicator (outbox rows hold no blobs), /api/files cache headers (no-store kept on purpose: personal documents on shared devices), SVG grain (raster tile cached by browser; design-owned), patagonia.png (landing/login only, read by canvas), Geist Mono (used in 27 files).
- L8 (2026-10-20) Close: `pnpm db:verify` green (rollback + re-up of the T4 migration, 214 DB tests); `pnpm test` 428 passed. EXPLAIN before/after for T4 was not recorded in the Log (equivalence covered by `db/tests/query-equivalence.test.ts`).
- L9 (2026-10-20) Independent review of `main...HEAD`: ready, no blockers (T4 policies keep per-role/guest/author visibility; down restores all 50). Fixed: sync blob check uses `allSettled` so bodies are cancelled when one lookup rejects. Follow-ups (not regressions): field-page warming posts plain requests the `fieldPages` matcher never sees, so offline reload of a client-navigated field page is not guaranteed (`field-page-cache.tsx:20`, `sw.ts:22`); `sw.ts:16` comment overstates "network only" and `/` lacks the 4 s timeout; 60 s cookie cache keeps a revoked session valid up to 60 s (document in auth spec); qualifications index leads with `company_id` (confirm with EXPLAIN); `personas` reference always rewritten.
- L10 (2026-10-20) `pnpm test:e2e` 40 passed, 0 failed (36 project-conditional skips), run against the HEAD build on :3100. `e2e/locations.spec.ts` place-search test now blocks service workers: Serwist `defaultCache` answers cross-origin GETs, so `page.route` never saw the Photon request (cross-origin handling unchanged by this branch). `pnpm test:db` after e2e failed one invitations test only because e2e left 6 invitations in the shared DB (test counts the whole table); fresh `db:verify` green, 214/214. Bundle not rebuilt: T4 changed no client code, L6 numbers stand.
