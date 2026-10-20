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
| T4 RLS + views migration | S4 | delegated (implementer), reviewer design review first | doing | — |
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
