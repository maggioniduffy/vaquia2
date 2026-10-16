# Phase 9 — Voice + LLM (Layer 3) — post-pilot

**Goal:** dictate the toolbox talk instead of typing it; get semantic warnings explaining what the talk/ATS may be missing.
**Refs:** spec/rules-engine.md · spec/architecture.md
**Start only after:** pilot uses phases 2–8 in production for ≥ 1 month. Re-plan this phase then (scope will change with real data).

## Unknowns → researcher
- [ ] STT options for es-AR noisy field audio: cost per minute, accuracy, offline capture + later transcription.
- [ ] Claude model/pricing for structuring (Haiku-class) vs semantic review; prompt caching.

## Draft tasks
- [ ] **9.1** Audio capture offline (record → blob → sync) + server transcription job.
- [ ] **9.2** LLM structuring: transcript → toolbox_talk@N payload (Zod-validated, user confirms before submit).
- [ ] **9.3** Migrations: `prompt_templates` (versioned), `llm_invocations` (append-only: prompt version, model id, input hash, output, cost, latency).
- [ ] **9.4** Layer 3 rules: hazards in text not covered by controls; text contradicts checklist; repeated "sin novedad" by same author. Severity max `warn`, always with explanation, false-positive button.
- [ ] **9.5** Eval set: 50 real (anonymized) talks/ATS labeled by the pilot's HSE lead; track precision before enabling for customers.

## Acceptance (to refine)
- Dictated talk → structured draft the supervisor accepts with minimal edits in ≥ 80% of eval cases.
- Layer 3 false-positive rate measured and below an agreed threshold before release.
