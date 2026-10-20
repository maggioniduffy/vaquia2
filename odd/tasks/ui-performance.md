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
| T0 baseline (build sizes, EXPLAIN) | S3,S4 | inline | doing | — |
| T1 loading.tsx + Suspense | S6 | inline | todo | — |
| T2 service worker scope | S3,S6 | inline | todo | — |
| T3 requests & caching (cookieCache, withUser, next/form, file cache) | S3,S7 | inline | todo | — |
| T4 RLS + views migration | S4 | delegated (implementer), reviewer design review first | todo | — |
| T5 server N+1 | S4 | inline | todo | — |
| T6 single sheet per list | S1 | delegated (implementer), parallel to T4 | todo | — |
| T7 React Compiler + capture form/Dexie renders | S1,S8 | inline | todo | — |
| T8 bundle/assets/fonts | S2,S5 | inline | todo | — |

## Log
- L1 (2026-10-20) User: "la UI responde muy lenta: 1) detectá y eliminá renders innecesarios. 2) reducí el bundle con lazy loading. 3) optimizá requests y caching. 4) encontrá queries lentas y problemas N+1. 5) optimizá imágenes, fuentes y scripts. y lo que consideres"
- L2 (2026-10-20) User decisions: cookie cache "Sí, 60 s"; React Compiler "Sí, activarlo".
- L3 Engram mirror: pending (Engram tools not available in this session).
